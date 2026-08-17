/** The UI half of §10 Milestone 6's CLI JSON workflow.
 *
 *  > `bible wiki topic 2300-days --json` matches, **section for section and
 *  > identity for identity**, what the UI renders.
 *
 *  Three seams have to agree, and each already proves a different part of it:
 *
 *  - `packages/core/src/wiki/host-parity.test.ts` proves the RPC handler and
 *    the CLI encode **one value** through one codec, on the wire.
 *  - `packages/cli/test/commands/wiki.test.ts` proves the **command** still runs
 *    that encoder — what reaches stdout for `2300-days` is `WikiPageJson`, with
 *    six sections in lineup order and the arrival flag on section 1.
 *  - This file is the third: the identities the **UI keys its rendering on** are
 *    derived from that same encoded page, and from nothing else.
 *
 *  That last claim is the one a CLI test structurally cannot make. A UI that
 *  hardcoded its section order, or its arrival posture, or which text it draws,
 *  would leave both of the other tests green.
 *
 *  **What "the UI's projections" means here.** This package's suites run under
 *  plain Bun with no DOM, and Solid 2 compiles JSX with a Babel transform rather
 *  than shipping a runtime factory, so a mounted `WikiTopicPage` is not
 *  reachable from a unit test — `apps/desktop/e2e/wiki-phrase.spec.ts` is where
 *  the compiled markup is asserted. What *is* reachable, and what this file
 *  therefore tests, are the four total functions the JSX consumes and cannot
 *  disagree with: `openOnArrival` decides which sections arrive open,
 *  `sectionOpen` decides whether one is open now, **`sectionItems` is the list
 *  the section's markup maps over**, and `sectionTextUnits` decides which text
 *  the phrase overlay is offered. Every one of them takes the decoded page and
 *  nothing else.
 *
 *  `sectionItems` is the one that closes the hole this file used to have. The
 *  page's markup was six per-section `Match` branches, and a deleted branch left
 *  every suite green while the section rendered nothing — the assertions here
 *  reached headings, postures and overlay text but never an item. The JSX now
 *  maps over the projection this file walks, so the six sections are asserted
 *  item for item.
 *
 *  **One fixture, three seams.** The page is `@bible/core/wiki/testing`'s
 *  `WIKI_PAGE_FIXTURE_PAGE` — content in every one of the six sections, composed by
 *  the real composer over test corpora. The same fixture is printed by
 *  `bible wiki topic --json` in `packages/cli/test/commands/wiki.test.ts` (which
 *  also pins the artifact-composed page against this in-memory one) and rendered
 *  in the desktop e2e. The identity table all three compare against is
 *  `WIKI_PAGE_FIXTURE_IDENTITIES`, stated once beside the fixture.
 */

import {
  emptySectionLineup,
  topicSlug,
  WikiCommentaryEntry,
  WikiCommentarySection,
  WikiCrossReference,
  WikiCrossReferencesSection,
  WikiEgwStatementsSection,
  WikiKeyVersesSection,
  WikiPage,
  WikiPageJson,
  WikiPassageRef,
  WikiPioneerWitnessesSection,
  WikiRelatedTopic,
  WikiRelatedTopicsSection,
  WikiVerseRef,
  WikiWritingsHit,
  type WikiSection,
  type WikiSectionKind,
  type WikiSectionLineup,
} from '@bible/core/wiki';
import { bookNumber, chapterNumber, verseNumber } from '@bible/core/bible';
import { WIKI_PAGE_FIXTURE_IDENTITIES, WIKI_PAGE_FIXTURE_PAGE } from '@bible/core/wiki/testing';
import { describe, expect, test } from 'bun:test';
import { Effect, Option, Schema } from 'effect';

import { openOnArrival, sectionOpen, toggleSection } from './peek-state.js';
import { renderedIdentity, sectionItems } from './wiki-section-items.js';
import { sectionTextUnits } from './wiki-section-text.js';

const verse = (label: string, book: number, chapter: number, at: number): WikiVerseRef =>
  WikiVerseRef.make({
    book: bookNumber(book),
    chapter: chapterNumber(chapter),
    verse: verseNumber(at),
    label,
    text: Option.none(),
  });

/** The `2300-days` page, with content in every section that carries prose.
 *
 *  Built through the composer's own section constructors, so the `_tag`s, the
 *  lineup order and the `defaultOpen` flags below are the *model's* — writing
 *  the six out by hand would make this a test about a literal this file chose. */
const SECTIONS: WikiSectionLineup = [
  WikiKeyVersesSection.make({
    items: [
      WikiPassageRef.make({
        start: verse('Dan 8:14', 27, 8, 14),
        end: Option.none(),
        label: 'Dan 8:14',
        text: Option.some('then shall the sanctuary be cleansed.'),
      }),
      WikiPassageRef.make({
        start: verse('Dan 8:11', 27, 8, 11),
        end: Option.none(),
        label: 'Dan 8:11',
        // A passage the Bible corpus could not resolve carries no text, and
        // therefore offers the overlay nothing.
        text: Option.none(),
      }),
    ],
    total: 12,
    defaultOpen: true,
  }),
  WikiEgwStatementsSection.make({
    items: [
      WikiWritingsHit.make({
        refcode: 'GC 409.1',
        bookCode: 'GC',
        bookTitle: 'The Great Controversy',
        author: 'Ellen G. White',
        snippet: Option.some('The sanctuary in heaven is the very centre of Christ’s work.'),
        absence: Option.none(),
      }),
    ],
    total: 5,
    defaultOpen: false,
    handoff: Option.none(),
    missingBooks: [],
  }),
  WikiCommentarySection.make({
    items: [
      WikiCommentaryEntry.make({
        verse: verse('Dan 8:14', 27, 8, 14),
        refcode: '4BC 1171.1',
        bookCode: '4BC',
        bookTitle: 'SDA Bible Commentary vol. 4',
        content: 'The cleansing of the sanctuary is the judgment.',
      }),
    ],
    total: 1,
    defaultOpen: false,
  }),
  WikiPioneerWitnessesSection.make({
    items: [],
    total: 0,
    defaultOpen: false,
    handoff: Option.none(),
    missingBooks: [],
  }),
  WikiCrossReferencesSection.make({
    items: [
      WikiCrossReference.make({
        from: verse('Dan 8:14', 27, 8, 14),
        to: verse('Heb 9:23', 58, 9, 23),
        source: 'openbible',
        preview: Option.some('the heavenly things themselves with better sacrifices'),
      }),
    ],
    total: 3,
    defaultOpen: false,
  }),
  WikiRelatedTopicsSection.make({
    items: [
      WikiRelatedTopic.make({
        slug: topicSlug('sanctuary'),
        title: 'The Sanctuary',
        kind: 'authored',
      }),
    ],
    total: 1,
    defaultOpen: false,
  }),
];

const page = (sections: WikiSectionLineup = SECTIONS): WikiPage =>
  WikiPage.make({
    slug: topicSlug('2300-days'),
    title: '2300 Days / 1844',
    status: 'flagship',
    core: Option.none(),
    sections,
    unavailable: Option.none(),
    sectionsUnavailable: Option.none(),
  });

/** The encoded page — what actually crosses to a client, and what the CLI
 *  prints. */
const encode = Schema.encodeSync(WikiPageJson);
/** …and back, because a client renders the **decoded** value. Round-tripping
 *  rather than rendering the in-memory page is the whole point: it proves the
 *  UI's inputs survive the wire, not that they survive a constructor. */
const decode = Schema.decodeSync(WikiPageJson);

describe('the UI renders the identities the wire carries', () => {
  test('section for section, in the lineup order the payload declares', () => {
    const wire = encode(page());
    // The UI walks the tuple; it never asks which sections exist. So the order
    // it renders in *is* the payload's order.
    expect(wire.sections.map((section) => section._tag)).toEqual([
      'key-verses',
      'egw-statements',
      'commentary',
      'pioneer-witnesses',
      'cross-references',
      'related-topics',
    ]);
  });

  test('the arrival posture is the payload’s own defaultOpen flags', () => {
    const wire = encode(page());
    const open = openOnArrival(decode(wire).sections);

    // Every section the UI opens is one the wire marked open, and every section
    // the wire marked open is one the UI opens. Stated both ways, because one
    // direction alone is satisfied by a UI that opens nothing.
    const wireOpen = wire.sections
      .filter((section) => section.defaultOpen)
      .map((section) => section._tag);
    expect([...open].toSorted()).toEqual(wireOpen.toSorted());
    expect(wireOpen).toEqual(['key-verses']);
  });

  test('a section the reader toggles is open; the rest keep the payload’s posture', () => {
    // The anti-hardcoding property, without a cast. §5's arrival rule is encoded
    // in the lineup's *shape* — `WikiCommentarySection.defaultOpen` is the
    // literal `false` — so a page that arrives with commentary open cannot be
    // constructed, and building one through `as unknown as` would be a test
    // about a value the wire can never carry. What *can* happen is the reader
    // opening it, and that is the same projection under a different input:
    // `sectionOpen` is `arrival XOR toggled`, so nothing in the UI names
    // `key-verses`.
    const arrival = openOnArrival(decode(encode(page())).sections);
    const toggled = toggleSection(new Set<WikiSectionKind>(), 'commentary');

    expect(sectionOpen({ kind: 'commentary', arrival, toggled })).toBe(true);
    expect(sectionOpen({ kind: 'key-verses', arrival, toggled })).toBe(true);
    expect(sectionOpen({ kind: 'pioneer-witnesses', arrival, toggled })).toBe(false);
    // And toggling the arrival-open section closes it, which is the direction a
    // hardcoded `key-verses` would get wrong.
    expect(
      sectionOpen({
        kind: 'key-verses',
        arrival,
        toggled: toggleSection(new Set<WikiSectionKind>(), 'key-verses'),
      }),
    ).toBe(false);
  });

  test('the six section identities are the closed set the UI has headings for', () => {
    // A seventh section added to the model without a heading would render an
    // unlabelled disclosure. `SECTION_TITLES` in `wiki-topic-page.tsx` is a
    // total `Record<WikiSectionKind, string>`, so that is a compile error — this
    // asserts the set it is total over is the one the wire carries.
    expect(new Set(encode(page()).sections.map((section) => section._tag)).size).toBe(6);
  });

  test('an empty lineup is still six sections in order', () => {
    // The composer's own empty lineup, for the host that wires no sources: the
    // page is still six sections and still opens section 1.
    const empty = decode(encode(page(emptySectionLineup())));
    expect(empty.sections.map((section) => section._tag).length).toBe(6);
    expect([...openOnArrival(empty.sections)]).toEqual(['key-verses']);
  });
});

// ---------------------------------------------------------------------------
// The item lists — the half a heading-only assertion could not see
// ---------------------------------------------------------------------------

/** The shared non-empty fixture, encoded and decoded exactly as a client
 *  receives it. `Effect.runSync` because the composition is over in-memory test
 *  services and completes synchronously; nothing here touches a file. */
const populated = decode(encode(Effect.runSync(WIKI_PAGE_FIXTURE_PAGE)));

describe('every section renders an item per item the wire carries', () => {
  test('the six sections’ rendered identities are the wire’s own', () => {
    // The whole lineup in one assertion, against the table the CLI suite and the
    // desktop e2e compare against too. Delete a section's branch from
    // `wiki-topic-page.tsx` — which now means deleting its `kind` from
    // `sectionItems` or from the `Switch` the JSX maps with — and the section
    // comes back empty here.
    const drawn = (kind: WikiSectionKind): readonly string[] =>
      Option.match(
        Option.fromNullishOr(populated.sections.find((section) => section._tag === kind)),
        {
          onNone: (): readonly string[] => [],
          onSome: (section) => sectionItems(section).map(renderedIdentity),
        },
      );
    expect({
      'key-verses': drawn('key-verses'),
      'egw-statements': drawn('egw-statements'),
      commentary: drawn('commentary'),
      'pioneer-witnesses': drawn('pioneer-witnesses'),
      'cross-references': drawn('cross-references'),
      'related-topics': drawn('related-topics'),
    }).toEqual(WIKI_PAGE_FIXTURE_IDENTITIES);
  });

  test('not one of the six is empty', () => {
    // Stated separately: an identity table that went empty on both sides would
    // satisfy the equality above. This is the claim that makes it mean
    // something.
    for (const section of populated.sections) {
      expect(sectionItems(section).length).toBeGreaterThan(0);
    }
  });

  test('an item’s index is its address in its own section', () => {
    // The overlay looks a unit's spans up by `index:field`
    // (`wiki-section-text.ts`), and the markup hands `MinedText` the index the
    // projection carries. The two must be the same number, or a key verse
    // renders another key verse's phrase spans.
    for (const section of populated.sections) {
      expect(sectionItems(section).map((item) => item.index)).toEqual(
        section.items.map((_, index) => index),
      );
    }
  });

  test('the projection preserves the composer’s order, and never re-sorts it', () => {
    // §6.1's caps and ordering are the composer's, applied before the page
    // crossed the wire. A client re-sorting would be a fourth opinion about the
    // table — so the projection is the section's own list, in its own order.
    const verses = populated.sections[0];
    expect(sectionItems(verses).map(renderedIdentity)).toEqual(
      verses.items.map((passage) => passage.label),
    );
  });

  test('the two writings sections draw the same item shape from different scopes', () => {
    // `egw-statements` and `pioneer-witnesses` both carry `WikiWritingsHit`, so
    // an item alone cannot say which section drew it — which is why the
    // projection tags by section rather than by item shape. Both are non-empty
    // and they are different rows, so one section standing in for the other
    // would be visible here.
    const egw = sectionItems(populated.sections[1]);
    const pioneer = sectionItems(populated.sections[3]);
    expect(egw.map((item) => item.kind)).toEqual(['hit']);
    expect(pioneer.map((item) => item.kind)).toEqual(['hit']);
    expect(egw.map(renderedIdentity)).not.toEqual(pioneer.map(renderedIdentity));
  });

  test('§6.3’s uninstalled book rides beside the ranked hits, not inside them', () => {
    // The second piece of markup a section carries. It is section metadata, so
    // it must not appear among the items and must not consume the cap.
    const egw = populated.sections[1];
    expect(egw.missingBooks.map((book) => book.bookCode)).toEqual(['ABSENT']);
    expect(sectionItems(egw).length).toBe(egw.items.length);
    expect(egw.total).toBe(egw.items.length);
  });
});

describe('the phrase overlay is offered the text the wire carries', () => {
  const units = (kind: WikiSectionKind): readonly { container: string; text: string }[] =>
    Option.match(
      Option.fromNullishOr(
        decode(encode(page())).sections.find((section: WikiSection) => section._tag === kind),
      ),
      {
        onNone: (): readonly { container: string; text: string }[] => [],
        onSome: (section) => [...sectionTextUnits(section)],
      },
    );

  test('each section offers its own auto-mined prose, and only that', () => {
    // §4.5's table makes each layered section a section for the overlay, and §6
    // says the text is the *auto-mined* corpus text. So a key verse offers its
    // KJV text, a hit offers its snippet, a commentary entry its content, a
    // cross-reference its preview — and never a label or a refcode, which are
    // citations rather than prose.
    expect(units('key-verses')).toEqual([
      { container: '0:text', text: 'then shall the sanctuary be cleansed.' },
    ]);
    expect(units('egw-statements')).toEqual([
      {
        container: '0:snippet',
        text: 'The sanctuary in heaven is the very centre of Christ’s work.',
      },
    ]);
    expect(units('commentary')).toEqual([
      { container: '0:content', text: 'The cleansing of the sanctuary is the judgment.' },
    ]);
    expect(units('cross-references')).toEqual([
      {
        container: '0:preview',
        text: 'the heavenly things themselves with better sacrifices',
      },
    ]);
  });

  test('an item the corpus could not resolve offers nothing', () => {
    // The second key verse carries `text: None`. It renders its label and no
    // prose, so it contributes no unit — not an empty one, which would mint an
    // occurrence id for a run that does not exist.
    expect(units('key-verses').length).toBe(1);
  });

  test('related topics are already links and are never overlaid', () => {
    // A phrase span over a related topic's title would be a second link to the
    // same destination, which is §4.7's "soup" exactly.
    expect(units('related-topics')).toEqual([]);
  });

  test('a section with no items offers no units', () => {
    expect(units('pioneer-witnesses')).toEqual([]);
  });
});
