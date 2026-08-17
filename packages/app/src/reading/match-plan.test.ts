/** The match plan's one property: **reading it twice gives the same answer**.
 *
 *  This is the regression this module exists for. `SectionMatchState` mutates —
 *  §4.5's first-occurrence rule is spent state, by design — and Solid compiles a
 *  dynamic JSX prop into a getter, so a component that received a *matcher* had
 *  its phrases claimed on the first read and got empty lists on every read
 *  after. Nothing in a unit test can mount a Solid component here (this
 *  package's suites run under plain Bun with no DOM), but the failure does not
 *  need a DOM: it is entirely a property of reading the value more than once,
 *  and that is what these tests do.
 *
 *  Every assertion below runs the read twice and compares. Reinstate the old
 *  shape — a `matchSegments`/`matchNodes` call behind the accessor — and the
 *  second read comes back empty and every one of them fails.
 */

import { parseParagraphContent } from '@bible/core/egw';
import { PhraseDictionary, PhraseAutomaton } from '@bible/core/wiki';
import {
  DANIEL_8_11,
  DANIEL_8_14,
  DANIEL_8_9,
  PHRASE_FIXTURE_DICTIONARY,
} from '@bible/core/wiki/testing';
import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';

import {
  buildChapterPlan,
  buildTextSectionPlan,
  buildWritingsPlan,
  excluding,
  nodeSpans,
  paragraphPlan,
  phraseSource,
  textUnitSpans,
  versePlan,
  writingsParagraphKey,
  type ParagraphPlan,
  type PhraseSource,
} from './match-plan.js';

const source = (dictionary: PhraseDictionary = PHRASE_FIXTURE_DICTIONARY): PhraseSource => ({
  dictionary,
  automaton: PhraseAutomaton.make(dictionary),
  active: dictionary.entries.length > 0,
});

/** Daniel 8 as the reader renders it: the three fixture verses, in order. */
const DANIEL_8 = [
  { verse: 9, text: DANIEL_8_9, marginNotes: [] },
  { verse: 11, text: DANIEL_8_11, marginNotes: [] },
  { verse: 14, text: DANIEL_8_14, marginNotes: [] },
];

const phraseTexts = (segments: readonly { readonly type: string }[]): readonly string[] =>
  segments
    .filter((segment): segment is { type: 'phrase'; text: string } => segment.type === 'phrase')
    .map((segment) => segment.text);

describe('the chapter plan survives being read twice', () => {
  test('the same verse read twice carries the same phrase spans', () => {
    const plan = buildChapterPlan({ key: '27/8', source: source(), verses: DANIEL_8 });

    // The double read. This is literally what Solid does to a dynamic prop, and
    // it is the assertion the old matcher-in-a-prop shape could not pass.
    const first = versePlan(plan, '11');
    const second = versePlan(plan, '11');

    expect(phraseTexts(first.segments)).toEqual(['the daily', 'sanctuary']);
    expect(phraseTexts(second.segments)).toEqual(phraseTexts(first.segments));
    expect(second.segments).toEqual(first.segments);
    expect(second.occurrences).toEqual(first.occurrences);
  });

  test('every verse of the chapter is stable under a second read', () => {
    const plan = buildChapterPlan({ key: '27/8', source: source(), verses: DANIEL_8 });
    for (const verse of ['9', '11', '14']) {
      expect(versePlan(plan, verse).segments).toEqual(versePlan(plan, verse).segments);
    }
  });

  test('§4.5 still holds inside one pass: sanctuary is hot in v11 and cold in v14', () => {
    // The plan must not *weaken* the rule while making it re-readable. `the
    // daily` and `sanctuary` are both hot in verse 11 (the named regression
    // pair), and the second `sanctuary` in verse 14 has no slot left.
    const plan = buildChapterPlan({ key: '27/8', source: source(), verses: DANIEL_8 });
    expect(phraseTexts(versePlan(plan, '11').segments)).toEqual(['the daily', 'sanctuary']);
    expect(phraseTexts(versePlan(plan, '14').segments)).toEqual([]);
  });

  test('a margin-bearing verse renders its anchor (§10 M6’s third layer)', () => {
    // The reader passed **no** margin notes until now, so the pipeline's margin
    // layer never ran in production and `SEGMENT_APPLICATION_ORDER`'s third
    // element was decorative on this path. `bible-reader.tsx` now reads
    // `v1.reading.bibleChapterMarginAnchors.get` and hands the anchors here; a
    // reader that stopped supplying them turns this back into an empty list.
    const plan = buildChapterPlan({
      key: '1/1',
      source: source(),
      verses: [
        {
          verse: 1,
          text: 'In the beginning God created the heaven and the earth.',
          marginNotes: [{ noteIndex: 0, phrase: 'beginning' }],
        },
      ],
    });
    expect(versePlan(plan, '1').segments).toContainEqual({ type: 'margin', noteIndex: 0 });
  });

  test('an empty dictionary still renders the editorial layers', () => {
    const empty = source(PhraseDictionary.make({ entries: [], unavailable: Option.none() }));
    const plan = buildChapterPlan({ key: '27/8', source: empty, verses: DANIEL_8 });
    const verse = versePlan(plan, '9');
    expect(phraseTexts(verse.segments)).toEqual([]);
    // The `[land]` bracket is still an italic segment: no dictionary is not no
    // pipeline.
    expect(verse.segments).toContainEqual({ type: 'italic', text: 'land' });
  });
});

describe('occurrence ids are unique where they have to be', () => {
  test('two phrases in one verse, and one phrase in two chapters', () => {
    const daniel = buildChapterPlan({ key: '27/8', source: source(), verses: DANIEL_8 });
    const other = buildChapterPlan({ key: '27/9', source: source(), verses: DANIEL_8 });

    const inVerse = versePlan(daniel, '11').occurrences;
    // Two different phrases in one verse: two ids. The renderer used to count
    // phrase segments over a list it recomputed, which is how these two came to
    // collide.
    expect(inVerse.length).toBe(2);
    expect(new Set(inVerse).size).toBe(2);

    // The same verse in a different chapter: no id in common. This is what makes
    // a chapter turn invalidate an open peek, because the peek signal outlives
    // the route change.
    const inOtherChapter = versePlan(other, '11').occurrences;
    expect(inOtherChapter.length).toBe(2);
    for (const id of inOtherChapter) expect(inVerse).not.toContain(id);
  });

  test('every id in a chapter is distinct', () => {
    const plan = buildChapterPlan({ key: '27/8', source: source(), verses: DANIEL_8 });
    const all = ['9', '11', '14'].flatMap((verse) => [...versePlan(plan, verse).occurrences]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('the writings plan survives being read twice', () => {
  const paragraphs = [
    { paragraphId: 'p1', nodes: parseParagraphContent(`<p>${DANIEL_8_11}</p>`) },
    { paragraphId: 'p2', nodes: parseParagraphContent(`<p>${DANIEL_8_14}</p>`) },
  ];

  /** Every span in a paragraph, by slug. Reads the plan's own node list, which
   *  is the list the renderer looks nodes up in. */
  const slugs = (plan: ParagraphPlan): readonly string[] =>
    plan.nodes.flatMap((node) => nodeSpans(plan, node).map((span) => span.slug));

  test('a paragraph read twice carries the same spans', () => {
    const plan = buildWritingsPlan({ key: 'DA/100', source: source(), paragraphs });
    const first = paragraphPlan(plan, 'p1');
    const second = paragraphPlan(plan, 'p1');

    expect(slugs(first)).toEqual(['the-daily', 'sanctuary']);
    expect(slugs(second)).toEqual(slugs(first));
    expect(second.nodes).toEqual(first.nodes);
  });

  test('§4.5 holds across the page: the second sanctuary is cold', () => {
    const plan = buildWritingsPlan({ key: 'DA/100', source: source(), paragraphs });
    expect(slugs(paragraphPlan(plan, 'p2'))).toEqual([]);
  });
});

describe('the topic page plans one section at a time', () => {
  const units = [
    { container: '0:text', text: DANIEL_8_11 },
    { container: '1:text', text: DANIEL_8_14 },
  ];

  /** The source a topic page hands the planner: the dictionary minus the page's
   *  own entries, with the automaton built from what is left. */
  const own = (slug: string): PhraseSource =>
    phraseSource(excluding(PHRASE_FIXTURE_DICTIONARY, slug));

  test('a unit read twice carries the same spans', () => {
    const plan = buildTextSectionPlan({ key: 'x/key-verses', source: own('x'), units });
    expect(textUnitSpans(plan, '0:text')).toEqual(textUnitSpans(plan, '0:text'));
    expect(textUnitSpans(plan, '0:text').map((span) => span.slug)).toEqual([
      'the-daily',
      'sanctuary',
    ]);
  });

  test('each layered section is its own §4.5 section', () => {
    // `sanctuary` is spent inside one section and hot again in the next, which
    // is what §4.5's table means by "each layered section of the page".
    const first = buildTextSectionPlan({ key: 'x/key-verses', source: own('x'), units });
    const second = buildTextSectionPlan({ key: 'x/commentary', source: own('x'), units });
    expect(textUnitSpans(first, '1:text')).toEqual([]);
    expect(textUnitSpans(second, '0:text').map((span) => span.slug)).toContain('sanctuary');
  });

  test('a page never links to itself', () => {
    // The self-link rule §4 did not state, added here: the page's own slug is
    // excluded from its own dictionary, so a topic page's mined text does not
    // offer a link to the page the reader is standing on.
    const plan = buildTextSectionPlan({
      key: 'sanctuary/key-verses',
      source: own('sanctuary'),
      units,
    });
    expect(textUnitSpans(plan, '0:text').map((span) => span.slug)).toEqual(['the-daily']);
  });

  test('excluding the self alias does not suppress the link it overlaps', () => {
    // The regression this exclusion's *placement* exists for.
    //
    // `heavenly sanctuary` and `sanctuary` overlap, and §4.4 gives the longer
    // one the span. On the `heavenly-sanctuary` page the longer one is the
    // page's own alias — so a filter applied *after* the matcher ran first let
    // the self alias win §4.4's sweep, suppressing `sanctuary`, and then dropped
    // the winner. The reader was shown no link at all in a snippet §4.4 had just
    // decided carried one.
    //
    // Excluding the entries before `PhraseAutomaton.make` is what fixes it: the
    // matcher never learns the self alias, so `sanctuary` wins the sweep on its
    // own merits and the reader gets the link to the other page. Restore the
    // post-match filter (`runs.map((run) => run.filter(…))` over the full
    // dictionary) and this comes back `[]`.
    const snippet = 'Christ ministers in the heavenly sanctuary above.';
    const plan = buildTextSectionPlan({
      key: 'heavenly-sanctuary/egw-statements',
      source: own('heavenly-sanctuary'),
      units: [{ container: '0:snippet', text: snippet }],
    });
    const spans = textUnitSpans(plan, '0:snippet');
    expect(spans.map((span) => span.slug)).toEqual(['sanctuary']);
    // And it is the right word, at the right offsets — a link over `heavenly
    // sanctuary` would be the self-link the exclusion forbids.
    const only = spans[0] ?? { start: 0, end: 0 };
    expect(snippet.slice(only.start, only.end)).toBe('sanctuary');
  });

  test('two sections of one page never share an occurrence id', () => {
    const first = buildTextSectionPlan({ key: 'x/key-verses', source: own('x'), units });
    const second = buildTextSectionPlan({ key: 'x/commentary', source: own('x'), units });
    const ids = new Set(textUnitSpans(first, '0:text').map((span) => span.occurrence));
    for (const span of textUnitSpans(second, '0:text'))
      expect(ids.has(span.occurrence)).toBe(false);
  });
});

describe('the paragraph route keys its plan by publication and paragraph', () => {
  // Paragraph identity is the **pair** (`writings/model.ts`'s
  // `ParagraphReference`, and the `/writings/:id/p/:paragraphId` route the codec
  // builds). Two publications can carry the same paragraph id — the EGW corpus
  // numbers paragraphs per book — so a plan keyed on the id alone mints the same
  // occurrence ids on both routes, and a peek opened on one survives navigation
  // to the other and marks whatever phrase now sits at that address.
  const nodes = parseParagraphContent(`<p>${DANIEL_8_11}</p>`);
  const paragraphs = [{ paragraphId: '1.1', nodes }];

  /** The plan the paragraph route builds, through the reader's **own** key
   *  function — so weakening the key really does fail this, rather than failing
   *  a second copy of it the test wrote down. */
  const idsFor = (publicationId: number): readonly string[] => {
    const plan = buildWritingsPlan({
      key: writingsParagraphKey({ publicationId, paragraphId: '1.1' }),
      source: source(),
      paragraphs,
    });
    const paragraph = paragraphPlan(plan, '1.1');
    return paragraph.nodes.flatMap((node) =>
      nodeSpans(paragraph, node).map((span) => span.occurrence),
    );
  };

  test('the same paragraph id in two publications mints disjoint occurrence ids', () => {
    // `/writings/17/p/1.1` and `/writings/42/p/1.1`. Under the old key — the
    // bare `paragraphId` — both sides of this are the identical list.
    const first = idsFor(17);
    const second = idsFor(42);

    expect(first.length).toBe(2);
    expect(second.length).toBe(2);
    for (const id of second) expect(first).not.toContain(id);
  });

  test('a peek open on one publication cannot survive the hop to the other', () => {
    // The defect stated as the reader sees it: the peek signal outlives the
    // route change (the router keeps the reader mounted), so the open
    // occurrence id is carried across. It must match nothing in the new plan —
    // otherwise the new page renders a phrase expanded under a card about the
    // old one.
    const open = idsFor(17)[0] ?? '';
    expect(open).not.toBe('');
    expect(idsFor(42)).not.toContain(open);
  });
});
