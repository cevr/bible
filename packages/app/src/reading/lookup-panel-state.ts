/** The lookup panel's decisions, as one plan (§7, Milestone 7).
 *
 *  Three questions the panel has to answer, none of which are about markup:
 *  which rows it draws and in what order, which of them arrive open, and whether
 *  it is a panel at all rather than a peek card. They live here rather than in
 *  `lookup-panel.tsx` for the reason `study-pane-state.ts` and `peek-state.ts`
 *  do: this package's tests run under plain Bun with no DOM, so a rule taken
 *  inside a component is a rule no unit test can state. What the *markup* draws
 *  is asserted against the compiled component in
 *  `apps/desktop/e2e/lookup-panel.spec.ts`.
 *
 *  **One plan, built from one read of the result.** The first version of this
 *  module answered only the first two questions and left the rows to the JSX,
 *  which read the live result again for every branch it drew. Solid compiles
 *  each of those reads into its own tracked access, so a result that resolved
 *  between two of them rendered a group's *count* from the old value beside the
 *  new value's *items* — a panel that says "Bible 8" over three verses, from two
 *  results that were each internally correct. Nothing in a pure state test could
 *  see it, because the tearing was in the number of reads rather than in any
 *  value. So the plan carries the rows as well: the component reads `lookupView`
 *  once inside a `createMemo` and every branch below draws that value.
 */

import type { LookupResult } from '@bible/core/wiki';
import { Option } from 'effect';

/** The five resolver groups, named as §7's table names them. */
export type LookupGroupId = 'topics' | 'strongs' | 'verses' | 'writings' | 'catalog';

/** One row of a group, in the form the panel draws it.
 *
 *  Four shapes rather than five, because two groups draw the same row: a topic
 *  match and a catalog match are both "a page this selection could mean, with a
 *  word about what opening it shows". Projected here rather than in the JSX so
 *  the rows a group carries are part of the plan the component reads once. */
export type LookupRow =
  | {
      readonly _tag: 'topic';
      /** The route parameter, as the caller's `onOpenTopic` takes it. */
      readonly slug: string;
      readonly title: string;
      /** `exact` / `fuzzy` for a dictionary hit, `flagship` / `catalog` for a
       *  catalog one — the answer to "why is this row here". */
      readonly note: string;
    }
  | {
      readonly _tag: 'lexicon';
      readonly word: string;
      /** The lexicon line, absent when the corpus has no row for the number. */
      readonly entry: Option.Option<string>;
    }
  | { readonly _tag: 'verse'; readonly href: string; readonly label: string; readonly text: string }
  | { readonly _tag: 'passage'; readonly source: string; readonly snippet: string };

/** One row of the panel: what it is called, what it holds, and whether it
 *  arrives open. */
export interface LookupGroupView {
  readonly id: LookupGroupId;
  readonly label: string;
  readonly count: number;
  /** §7: "all groups shown, empty groups collapsed." */
  readonly open: boolean;
  readonly rows: readonly LookupRow[];
}

/** Everything the panel draws for one resolved selection. */
export interface LookupView {
  /** The heading, and the close control's accessible name. */
  readonly label: string;
  /** §5's card instead of the panel, when core flagged the result. */
  readonly peek: Option.Option<{ readonly slug: string; readonly phrase: string }>;
  readonly groups: readonly LookupGroupView[];
}

/** What each group is called on screen. A record over the union rather than a
 *  branch, so a sixth group added to `LookupResult` fails to typecheck here
 *  instead of rendering with no name. */
const LABELS = {
  topics: 'Topics',
  strongs: "Strong's",
  verses: 'Bible',
  writings: 'Writings',
  catalog: 'Topical index',
} satisfies Record<LookupGroupId, string>;

/** The verse route a Bible hit links to. */
const versePath = (hit: LookupResult['verses'][number]): string =>
  `/bible/${String(hit.reference.book)}/${String(hit.reference.chapter)}/${String(
    hit.reference.verse,
  )}`;

const group = (id: LookupGroupId, rows: readonly LookupRow[]): LookupGroupView => ({
  id,
  label: LABELS[id],
  count: rows.length,
  open: rows.length > 0,
  rows,
});

/** The panel's whole plan, from one read of one result.
 *
 *  Order is the panel's contract with its two siblings and with the CLI:
 *  `LookupResult`'s field order is the encoding's key order is this list is the
 *  order `bible wiki lookup` prints. A group that resolved to nothing is still a
 *  row — §7's "an empty group is present-and-empty, not absent" is a statement
 *  about what the reader sees as much as about what the wire carries, and a row
 *  that disappeared when it found nothing would move every row below it between
 *  two runs of a reflex gesture.
 *
 *  `count` is `rows.length` by construction rather than by agreement, which is
 *  the property the torn render broke: the two can no longer come from different
 *  results, because there is only one result in this function. */
export const lookupView = (result: LookupResult): LookupView => ({
  label: `Lookup: ${result.text}`,
  peek: lonePeekTopic(result),
  groups: [
    group(
      'topics',
      result.topics.map((match): LookupRow => ({
        _tag: 'topic',
        slug: String(match.slug),
        title: match.display,
        note: match.kind,
      })),
    ),
    group(
      'strongs',
      result.strongs.map((hit): LookupRow => ({
        _tag: 'lexicon',
        word: hit.word,
        entry: Option.map(hit.entry, (entry) => `${String(entry.number)} · ${entry.definition}`),
      })),
    ),
    group(
      'verses',
      result.verses.map((hit): LookupRow => ({
        _tag: 'verse',
        href: versePath(hit),
        label: hit.label,
        text: hit.text,
      })),
    ),
    group(
      'writings',
      result.writings.map((hit): LookupRow => ({
        _tag: 'passage',
        source: `${hit.refcode} · ${hit.bookTitle}`,
        snippet: hit.snippet,
      })),
    ),
    group(
      'catalog',
      result.catalog.map((match): LookupRow => ({
        _tag: 'topic',
        slug: String(match.slug),
        title: match.name,
        note: match.status,
      })),
    ),
  ],
});

/** §7: "A lone topic hit gets the peek-card treatment from §5 instead of the
 *  full panel."
 *
 *  The *decision* is `LookupResult.lonePeek`, computed in core beside the data
 *  it reads; this function only reads the flag and hands back what §5's card
 *  needs — the topic to open and the phrase to name it by. The hosts obey the
 *  flag rather than re-deriving it, which is what keeps three surfaces from
 *  spelling one predicate three ways.
 *
 *  `None` when the flag is false, and also when it is true over an empty topic
 *  list: the card has nothing to show, so the panel is the honest fallback. */
const lonePeekTopic = (
  result: LookupResult,
): Option.Option<{ readonly slug: string; readonly phrase: string }> => {
  if (!result.lonePeek) return Option.none();
  return Option.map(Option.fromNullishOr(result.topics[0]), (match) => ({
    slug: String(match.slug),
    phrase: match.display,
  }));
};
