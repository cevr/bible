/** The page schema's shape constraints (§6.1, §5).
 *
 *  Every assertion here is about a page that a client could not render but that
 *  a looser schema would happily decode: a lineup missing a section, a lineup in
 *  the wrong order, or a section that arrives open when §5 says it arrives
 *  collapsed. Modelling the lineup as an unrestricted `Schema.Array(WikiSection)`
 *  with a boolean `defaultOpen` permits all three, which is why the tuple and
 *  the literals exist.
 */

import { Effect, Option, Schema } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import {
  topicSlug,
  WikiCommentarySection,
  WikiCrossReferencesSection,
  WikiEgwStatementsSection,
  WikiKeyVersesSection,
  WikiPage,
  WikiPioneerWitnessesSection,
  WikiRelatedTopicsSection,
} from './model.js';

const KEY_VERSES = { _tag: 'key-verses', items: [], total: 0, defaultOpen: true };
const EGW = {
  _tag: 'egw-statements',
  items: [],
  total: 0,
  defaultOpen: false,
  handoff: Option.none(),
  missingBooks: [],
};
const COMMENTARY = { _tag: 'commentary', items: [], total: 0, defaultOpen: false };
const PIONEER = {
  _tag: 'pioneer-witnesses',
  items: [],
  total: 0,
  defaultOpen: false,
  handoff: Option.none(),
  missingBooks: [],
};
const CROSS_REFS = { _tag: 'cross-references', items: [], total: 0, defaultOpen: false };
const RELATED = { _tag: 'related-topics', items: [], total: 0, defaultOpen: false };

const LINEUP = [KEY_VERSES, EGW, COMMENTARY, PIONEER, CROSS_REFS, RELATED];

const page = (sections: readonly unknown[]) => ({
  slug: 'sanctuary',
  title: 'The Sanctuary',
  status: 'flagship',
  core: Option.none(),
  sections,
  unavailable: Option.none(),
  sectionsUnavailable: Option.none(),
});

const decode = Schema.decodeUnknownEffect(WikiPage);

/** The candidate is always a `page(...)` fixture — a page-shaped record whose
 *  `sections` field is the thing under test. Typing the parameter as that
 *  fixture rather than as `unknown` keeps the contract at the call site: these
 *  are pages the schema must refuse, not arbitrary values. */
type PageCandidate = ReturnType<typeof page>;

const rejects = (input: PageCandidate): Effect.Effect<boolean> =>
  Effect.flip(decode(input)).pipe(
    Effect.as(true),
    Effect.orElseSucceed(() => false),
  );

describe('WikiPage schema', () => {
  it.effect('accepts the six-section lineup in order', () =>
    Effect.gen(function* () {
      const decoded = yield* decode(page(LINEUP));
      expect(decoded.sections.map((section) => section._tag)).toEqual([
        'key-verses',
        'egw-statements',
        'commentary',
        'pioneer-witnesses',
        'cross-references',
        'related-topics',
      ]);
      // Positional typing, not a runtime search: the tuple means position 0 *is*
      // the key-verses section, so `.items` here is `WikiPassageRef[]` with no
      // narrowing.
      expect(decoded.sections[0]._tag).toBe('key-verses');
    }),
  );

  it.effect('rejects a lineup with a section missing', () =>
    Effect.gen(function* () {
      // Five sections. Under `Schema.Array(WikiSection)` this decodes fine, and
      // every client that indexes position 4 for cross-references silently
      // renders related-topics there instead.
      expect(yield* rejects(page([KEY_VERSES, EGW, COMMENTARY, PIONEER, CROSS_REFS]))).toBe(true);
    }),
  );

  it.effect('rejects a lineup with a section repeated or reordered', () =>
    Effect.gen(function* () {
      expect(
        yield* rejects(page([EGW, KEY_VERSES, COMMENTARY, PIONEER, CROSS_REFS, RELATED])),
      ).toBe(true);
      expect(
        yield* rejects(page([KEY_VERSES, KEY_VERSES, COMMENTARY, PIONEER, CROSS_REFS, RELATED])),
      ).toBe(true);
      // Seven sections is as wrong as five.
      expect(yield* rejects(page([...LINEUP, RELATED]))).toBe(true);
    }),
  );

  it.effect('rejects a page that arrives with the wrong section open', () =>
    Effect.gen(function* () {
      // §5: key verses arrive open, the rest collapsed. A boolean lets a host
      // ship either, and the three of them then disagree about the page's
      // arrival posture while all passing the schema.
      expect(
        yield* rejects(page([{ ...KEY_VERSES, defaultOpen: false }, ...LINEUP.slice(1)])),
      ).toBe(true);
      expect(
        yield* rejects(
          page([
            KEY_VERSES,
            { ...EGW, defaultOpen: true },
            COMMENTARY,
            PIONEER,
            CROSS_REFS,
            RELATED,
          ]),
        ),
      ).toBe(true);
      expect(
        yield* rejects(
          page([
            KEY_VERSES,
            EGW,
            COMMENTARY,
            PIONEER,
            CROSS_REFS,
            { ...RELATED, defaultOpen: true },
          ]),
        ),
      ).toBe(true);
    }),
  );

  it.effect('round-trips a page through its own encoding', () =>
    Effect.gen(function* () {
      const decoded = yield* decode(page(LINEUP));
      const encoded = yield* Schema.encodeEffect(WikiPage)(decoded);
      // The CLI's `--json` and the RPC payload are both this value, which is the
      // point of naming it `WikiPageJson`: two seams, one codec.
      expect(yield* decode(encoded)).toEqual(decoded);
    }),
  );

  it.effect('constructs the same lineup the decoder accepts', () =>
    Effect.gen(function* () {
      // `make` and `decode` agreeing is what lets the composer build the lineup
      // in memory and the wire carry it unchanged.
      const built = WikiPage.make({
        slug: topicSlug('sanctuary'),
        title: 'The Sanctuary',
        status: 'flagship',
        core: Option.none(),
        sections: [
          WikiKeyVersesSection.make({ items: [], total: 0, defaultOpen: true }),
          WikiEgwStatementsSection.make({
            items: [],
            total: 0,
            defaultOpen: false,
            handoff: Option.none(),
            missingBooks: [],
          }),
          WikiCommentarySection.make({ items: [], total: 0, defaultOpen: false }),
          WikiPioneerWitnessesSection.make({
            items: [],
            total: 0,
            defaultOpen: false,
            handoff: Option.none(),
            missingBooks: [],
          }),
          WikiCrossReferencesSection.make({ items: [], total: 0, defaultOpen: false }),
          WikiRelatedTopicsSection.make({ items: [], total: 0, defaultOpen: false }),
        ],
        unavailable: Option.none(),
        sectionsUnavailable: Option.none(),
      });
      expect(yield* decode(page(LINEUP))).toEqual(built);
    }),
  );
});
