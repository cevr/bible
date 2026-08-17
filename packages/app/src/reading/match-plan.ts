/** The immutable match plan: one pass of the matcher per rendered section, and
 *  a value the render tree may read as many times as it likes (§4.5, §5).
 *
 *  **Why a plan and not a matcher.** `SectionMatchState` mutates: the first
 *  clean occurrence of a phrase claims the section's slot, and every later ask
 *  for that phrase gets nothing. That is exactly §4.5, and it is exactly wrong
 *  to hand to a reactive renderer. Solid compiles a dynamic JSX prop into a
 *  getter, so `phrases={matcher.nodes(paragraph.nodes)}` is not evaluated once —
 *  it is evaluated on every read of `props.phrases`, and the reads after the
 *  first see a state in which every phrase is already hot. The paragraph renders
 *  its spans on the first read and loses them on the second, which is a
 *  disappearing link rather than a slow one.
 *
 *  So the matcher runs **outside** the render tree, once, over the whole
 *  section's units in document order, and what the JSX consumes is the finished
 *  result: arrays, already sliced, already numbered. Reading a plan twice
 *  returns the same arrays because there is no state left to consume — the
 *  property `match-plan.test.ts` pins by reading every entry twice.
 *
 *  **Occurrence identity.** An occurrence id has to be unique across everything
 *  a peek state can be open over, and peek state outlives a chapter turn: the
 *  signal lives in the reader component, which the router keeps mounted across
 *  `/bible/1/1` → `/bible/1/2`. So the id carries the **section key** — the
 *  chapter address, the page address, the topic-page section kind — ahead of the
 *  container and the index. Two phrases in one verse differ by index; the same
 *  verse number in two chapters differs by section key; and a chapter turn
 *  therefore cannot leave a card open over a phrase that is no longer there,
 *  because no id in the new plan can equal the open one.
 */

import type { Node as EgwNode, Text as EgwText } from '@bible/core/egw';
import {
  renderVerseSegments,
  segmentVerseText,
  type MarginNoteAnchor,
  type TextSegment,
} from '@bible/core/bible-rendering';
import {
  matchNodes,
  matchSection,
  matchSegments,
  PhraseAutomaton,
  PhraseDictionary,
  SectionMatchState,
  type PhraseSpan,
} from '@bible/core/wiki';
import { createMemo, type Accessor } from 'solid-js';

import { occurrenceId, type PhraseOccurrenceId } from './peek-state.js';

// ---------------------------------------------------------------------------
// The dictionary's automaton (§4.2)
// ---------------------------------------------------------------------------

export interface PhraseSource {
  readonly dictionary: PhraseDictionary;
  readonly automaton: PhraseAutomaton;
  /** Whether the dictionary has anything to match. A surface with no phrases
   *  skips the overlay rather than running an empty automaton over every run. */
  readonly active: boolean;
}

/** Builds the automaton for the current dictionary, rebuilding only when the
 *  dictionary itself changes.
 *
 *  Takes an accessor rather than a value so the memo owns the dependency: a
 *  component that read the dictionary itself and passed the value would rebuild
 *  the automaton on every one of its own re-renders, which is the exact ~1 ms
 *  §4.2 says to pay once per load. */
export const usePhraseSource = (dictionary: Accessor<PhraseDictionary>): Accessor<PhraseSource> =>
  createMemo(() => phraseSource(dictionary()));

/** A `PhraseSource` over a dictionary, outside the render tree. The memo above
 *  is this function plus a dependency; a test (and the self-excluding memo
 *  below) needs the function. */
export const phraseSource = (dictionary: PhraseDictionary): PhraseSource => ({
  dictionary,
  automaton: PhraseAutomaton.make(dictionary),
  active: dictionary.entries.length > 0,
});

/** The dictionary a page is allowed to link *out of*: every entry except the
 *  ones that open the page the reader is already standing on.
 *
 *  §4 states no self-link rule — §4.8's noise flags are an authoring decision
 *  and the composer does not filter by destination — so this milestone adds one.
 *  What matters is **where** it is applied.
 *
 *  Filtering the self spans out *after* the matcher ran was wrong, and wrong in
 *  a way that removed a link rather than adding one. §4.4 resolves overlaps
 *  between *candidates*: a longer alias suppresses a shorter one that starts
 *  inside it. On `heavenly-sanctuary`'s own page, the self alias
 *  `heavenly sanctuary` is the longer candidate, so it suppressed the perfectly
 *  valid `sanctuary` → `/wiki/sanctuary` that overlaps it — and was then dropped
 *  by the post-filter, leaving the reader no link at all where §4.4 had just
 *  decided one. Excluding the entries *before* the automaton runs makes the self
 *  alias a phrase the matcher never knew, so `sanctuary` wins §4.4 on its own
 *  merits.
 *
 *  A whole automaton per page rather than one shared one. §4.2's build is ~1-4 ms
 *  over a 250-400 phrase dictionary, paid once per *topic page render* (the memo
 *  keys on the dictionary and the slug together, so scrolling, toggling a
 *  section and re-peeking all reuse it) — against a link the reader can see is
 *  missing. The two reading surfaces are untouched: a chapter and an EGW page
 *  are not a topic, so they keep the one shared automaton. */
export const excluding = (dictionary: PhraseDictionary, slug: string): PhraseDictionary => {
  const kept = dictionary.entries.filter((entry) => String(entry.slug) !== slug);
  if (kept.length === dictionary.entries.length) return dictionary;
  return PhraseDictionary.make({ entries: kept, unavailable: dictionary.unavailable });
};

/** The self-excluding source for one topic page, rebuilt only when the
 *  dictionary or the page changes. */
export const useTopicPhraseSource = (
  dictionary: Accessor<PhraseDictionary>,
  slug: Accessor<string>,
): Accessor<PhraseSource> => createMemo(() => phraseSource(excluding(dictionary(), slug())));

// ---------------------------------------------------------------------------
// Occurrence numbering
// ---------------------------------------------------------------------------

/** A phrase the plan decided to draw: where it sits, which topic it opens, and
 *  the occurrence id §5's double-tap rule keys on. Minted here rather than in
 *  the JSX because the index is a property of the section's single pass, not of
 *  one component's render. */
export interface PlannedSpan {
  readonly start: number;
  readonly end: number;
  readonly slug: string;
  readonly alias: string;
  readonly occurrence: PhraseOccurrenceId;
}

/** Numbers one unit's runs, continuing a per-unit count.
 *
 *  The index is global to the **unit**, not to the run: §5's double-tap keys on
 *  "the same phrase the reader tapped", and two `TextSegment`s of one verse (or
 *  two `Text` nodes of one paragraph) are one sentence to a reader. */
const number = (input: {
  readonly key: string;
  readonly container: string;
  readonly runs: readonly (readonly PhraseSpan[])[];
}): readonly (readonly PlannedSpan[])[] => {
  let index = 0;
  const numbered: (readonly PlannedSpan[])[] = [];
  for (const run of input.runs) {
    const planned: PlannedSpan[] = [];
    for (const span of run) {
      planned.push({
        start: span.start,
        end: span.end,
        slug: String(span.slug),
        alias: span.alias,
        occurrence: occurrenceId({
          section: input.key,
          container: input.container,
          index,
        }),
      });
      index += 1;
    }
    numbered.push(planned);
  }
  return numbered;
};

// ---------------------------------------------------------------------------
// The rendered pieces
// ---------------------------------------------------------------------------

/** One run's text, split into what a renderer draws. Shared by the EGW
 *  paragraph renderer and the topic page, because both split a plain string on
 *  spans and a second copy of the cursor arithmetic is a second place for an
 *  off-by-one. */
export type PhrasePiece =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'phrase';
      readonly text: string;
      readonly slug: string;
      readonly occurrence: PhraseOccurrenceId;
    };

export const phrasePieces = (
  text: string,
  spans: readonly PlannedSpan[],
): readonly PhrasePiece[] => {
  const pieces: PhrasePiece[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor || span.end > text.length) continue;
    if (span.start > cursor) pieces.push({ kind: 'text', text: text.slice(cursor, span.start) });
    pieces.push({
      kind: 'phrase',
      text: text.slice(span.start, span.end),
      slug: span.slug,
      occurrence: span.occurrence,
    });
    cursor = span.end;
  }
  if (cursor < text.length) pieces.push({ kind: 'text', text: text.slice(cursor) });
  return pieces;
};

// ---------------------------------------------------------------------------
// The Bible surface: one chapter, one pass
// ---------------------------------------------------------------------------

/** One verse, rendered: the finished segment list (the four editorial layers
 *  plus phrases, in `SEGMENT_APPLICATION_ORDER`) and the occurrence id of each
 *  `phrase` segment, aligned by that segment's position among the phrases.
 *
 *  The ids are carried beside the segments rather than recomputed from them,
 *  because recomputing meant counting phrase segments at render time — which is
 *  what let two different phrases in one verse share an id when the segment list
 *  was rebuilt between the two counts. */
export interface VersePlan {
  readonly segments: readonly TextSegment[];
  readonly occurrences: readonly PhraseOccurrenceId[];
}

export const EMPTY_VERSE_PLAN: VersePlan = { segments: [], occurrences: [] };

/** A chapter's plan: verse number → that verse's finished render. */
export interface ChapterPlan {
  /** The §4.5 section this plan covers, and the prefix of every occurrence id in
   *  it. Carried as a value so the memo's dependency on the route is something
   *  the computation *returns* rather than a read someone could delete. */
  readonly key: string;
  readonly verses: ReadonlyMap<string, VersePlan>;
  readonly active: boolean;
}

export const versePlan = (plan: ChapterPlan, verse: string): VersePlan =>
  plan.verses.get(verse) ?? EMPTY_VERSE_PLAN;

/** The occurrence id of the phrase segment at a given position among a verse's
 *  phrases. Total: an out-of-range index is a plan and a render that disagree,
 *  which renders the span cold rather than throwing inside a `For`. */
export const verseOccurrence = (plan: VersePlan, phraseIndex: number): PhraseOccurrenceId =>
  plan.occurrences[phraseIndex] ?? '';

/** One verse as the chapter planner takes it. */
export interface ChapterVerse {
  readonly verse: number;
  readonly text: string;
  readonly marginNotes: readonly MarginNoteAnchor[];
}

/** Builds a whole chapter's plan in one pass, in verse order.
 *
 *  §4.5's section for Bible text is the chapter, so there is exactly one
 *  `SectionMatchState` here and it is spent before this function returns.
 *  Nothing it produces holds a reference to it.
 *
 *  The phrase layer is supplied to `renderVerseSegments` as the callback that
 *  pipeline declares, so the layer order stays the pipeline's business and this
 *  function stays the *state's* business. When the dictionary is empty the
 *  callback is omitted entirely, which is `segmentVerseText` exactly. */
export const buildChapterPlan = (input: {
  readonly key: string;
  readonly source: PhraseSource;
  readonly verses: readonly ChapterVerse[];
}): ChapterPlan => {
  const state = new SectionMatchState();
  const verses = new Map<string, VersePlan>();
  for (const verse of input.verses) {
    const container = String(verse.verse);
    if (!input.source.active) {
      verses.set(container, {
        segments: segmentVerseText(verse.text, verse.marginNotes),
        occurrences: [],
      });
      continue;
    }
    let numbered: readonly (readonly PlannedSpan[])[] = [];
    const segments = renderVerseSegments({
      text: verse.text,
      marginNotes: verse.marginNotes,
      phrases: (editorial) => {
        const runs = matchSegments(input.source.automaton, editorial, state);
        numbered = number({ key: input.key, container, runs });
        return runs;
      },
    });
    verses.set(container, {
      segments,
      occurrences: numbered.flat().map((span) => span.occurrence),
    });
  }
  return { key: input.key, verses, active: input.source.active };
};

// ---------------------------------------------------------------------------
// The EGW surface: one page (or one paragraph), one pass
// ---------------------------------------------------------------------------

/** One paragraph's plan: the `Text` nodes the matcher entered, in document
 *  order, and each one's spans.
 *
 *  Keyed by node value rather than by an index into a flattened traversal,
 *  because `ParagraphNodes` walks a tree and would otherwise have to reproduce
 *  the matcher's traversal order exactly to line the two up. */
export interface ParagraphPlan {
  readonly nodes: readonly EgwText[];
  readonly spans: readonly (readonly PlannedSpan[])[];
}

export const EMPTY_PARAGRAPH_PLAN: ParagraphPlan = { nodes: [], spans: [] };

/** The spans matched inside one `Text` node. Total: a node the plan does not
 *  know — a `ScriptureRef`'s child — has none. */
export const nodeSpans = (plan: ParagraphPlan, node: EgwText): readonly PlannedSpan[] => {
  const index = plan.nodes.indexOf(node);
  if (index === -1) return [];
  return plan.spans[index] ?? [];
};

export interface WritingsPlan {
  readonly key: string;
  readonly paragraphs: ReadonlyMap<string, ParagraphPlan>;
  readonly active: boolean;
}

export const paragraphPlan = (plan: WritingsPlan, paragraphId: string): ParagraphPlan =>
  plan.paragraphs.get(paragraphId) ?? EMPTY_PARAGRAPH_PLAN;

export interface WritingsParagraphInput {
  readonly paragraphId: string;
  readonly nodes: readonly EgwNode[];
}

/** The §4.5 section key of the **page** route: the publication and the page. */
export const writingsPageKey = (input: {
  readonly publicationId: number;
  readonly page: number;
}): string => `${String(input.publicationId)}/${String(input.page)}`;

/** The §4.5 section key of the **paragraph** route.
 *
 *  The publication is in it because a paragraph's identity is the *pair*: the
 *  core model says so (`writings/model.ts`'s `ParagraphReference` carries both)
 *  and so does the route the codec builds (`/writings/:id/p/:paragraphId`). The
 *  EGW corpus numbers paragraphs per book, so `1.1` names a paragraph in every
 *  publication that has one — and a key of the id alone therefore mints
 *  identical occurrence ids on two different routes. The peek signal outlives
 *  the hop between them (the router keeps the reader mounted), so the card
 *  opened on one publication would survive onto the other and mark whichever
 *  phrase now sits at that address.
 *
 *  Named here rather than spelled inline at the call site so the key the reader
 *  uses is the key a test can check. */
export const writingsParagraphKey = (input: {
  readonly publicationId: number;
  readonly paragraphId: string;
}): string => `${String(input.publicationId)}/p/${input.paragraphId}`;

/** Builds a writings page's plan in one pass, in paragraph order. §4.5's section
 *  for EGW text is "the chapter or reading unit **as rendered**", which on the
 *  page route is the page and on the paragraph route is the one paragraph — the
 *  same function serves both, at the size the route renders. */
export const buildWritingsPlan = (input: {
  readonly key: string;
  readonly source: PhraseSource;
  readonly paragraphs: readonly WritingsParagraphInput[];
}): WritingsPlan => {
  const paragraphs = new Map<string, ParagraphPlan>();
  if (!input.source.active) {
    return { key: input.key, paragraphs, active: false };
  }
  const state = new SectionMatchState();
  for (const paragraph of input.paragraphs) {
    const matched = matchNodes(input.source.automaton, paragraph.nodes, state);
    paragraphs.set(paragraph.paragraphId, {
      nodes: matched.map((entry) => entry.node),
      spans: number({
        key: input.key,
        container: paragraph.paragraphId,
        runs: matched.map((entry) => entry.spans),
      }),
    });
  }
  return { key: input.key, paragraphs, active: true };
};

// ---------------------------------------------------------------------------
// The topic page: each layered section is its own §4.5 section
// ---------------------------------------------------------------------------

/** One plain-text unit of a topic page's layered section: a key verse's text, a
 *  writings snippet, a commentary body, a cross-reference preview. */
export interface TextUnit {
  readonly container: string;
  readonly text: string;
}

/** A topic-page section's plan: unit address → that unit's single run of spans.
 *
 *  Every unit here is one plain string, so a unit has exactly one run — but the
 *  shape stays the same as the other two surfaces so `phrasePieces` and the span
 *  component are shared rather than re-specialized. */
export interface TextSectionPlan {
  readonly key: string;
  readonly units: ReadonlyMap<string, readonly PlannedSpan[]>;
  readonly active: boolean;
}

export const textUnitSpans = (plan: TextSectionPlan, container: string): readonly PlannedSpan[] =>
  plan.units.get(container) ?? [];

/** Builds one layered section's plan: one `SectionMatchState` for the section,
 *  spent over its units in the order the section lists them (§4.5's table names
 *  "each layered section of the page" as the section for a topic page).
 *
 *  The self-link rule is **not** here. It is upstream, in the source: the page's
 *  own entries are gone from the dictionary before the automaton is built (see
 *  {@link excluding}), so this function has nothing to filter and cannot filter
 *  it at the wrong moment. Hand it a `useTopicPhraseSource`. */
export const buildTextSectionPlan = (input: {
  readonly key: string;
  readonly source: PhraseSource;
  readonly units: readonly TextUnit[];
}): TextSectionPlan => {
  const units = new Map<string, readonly PlannedSpan[]>();
  if (!input.source.active) {
    return { key: input.key, units, active: false };
  }
  const state = new SectionMatchState();
  for (const unit of input.units) {
    const runs = matchSection(input.source.automaton, [unit.text], state);
    units.set(unit.container, number({ key: input.key, container: unit.container, runs }).flat());
  }
  return { key: input.key, units, active: true };
};
