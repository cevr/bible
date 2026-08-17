/** The portable lookup input every adapter must build (§7, Milestone 7).
 *
 *  §10's Milestone 7 adapter check is: "DOM selection on web and desktop
 *  produces the same portable lookup input the CLI builds from its argument."
 *  Three builders, three packages, and no package that can import all three —
 *  `packages/app` has no CLI and `packages/cli` has no DOM. So the agreement is
 *  held the way Milestone 4's span parity is held: **one fixture in core**, and
 *  each adapter asserts its own output equals it.
 *
 *  The selection is §7's own example — `bible wiki lookup "the daily" --context
 *  "Dan 8:13"` — so the fixture is the milestone's acceptance workflow rather
 *  than a phrase invented for a test.
 *
 *  What is compared is the **decoded** `LookupInput`, not its encoding: the
 *  value is what the three builders produce, and two of them never encode it at
 *  all (the CLI hands it straight to `LookupService`, the app hands it to a
 *  procedure payload). Equality on the class is `Equal`-based structural
 *  equality, which is what `Schema.Class` gives.
 */

import { Option } from 'effect';

import { Reference } from '../bible/model.js';
import { LookupInput } from './lookup-model.js';

/** The selection as each adapter receives it: the text a reader selected, and
 *  the verse it came from as that adapter names a verse.
 *
 *  The CLI is handed `reference` as the `--context` string it parses; the two
 *  DOM hosts already hold the verse address the reader is inside, so they get
 *  the numbers. Both are the same verse, stated once. */
export const LOOKUP_ADAPTER_SELECTION = {
  text: 'the daily',
  /** `--context "Dan 8:13"`, exactly as §7's command line spells it. */
  reference: 'Dan 8:13',
  book: 27,
  chapter: 8,
  verse: 13,
} satisfies {
  readonly text: string;
  readonly reference: string;
  readonly book: number;
  readonly chapter: number;
  readonly verse: number;
};

/** The raw text each adapter is handed, and the one `LookupInput.text` all of
 *  them must produce from it.
 *
 *  The two sources are not alike and the fixture says so. A DOM `Range` carries
 *  the markup's own line breaks and indentation, and a drag that ends between
 *  words carries a trailing space; a shell argument carries whatever the caller
 *  quoted, padding included. Before Milestone 7's review the DOM builder
 *  collapsed and the CLI did not, so the same phrase selected on two surfaces
 *  was two `text` values on the wire — and the fixture could not see it, because
 *  it held only text that was already clean.
 *
 *  What is *not* folded here is as much of the contract: punctuation and case
 *  are the reader's own text and are echoed back by `LookupResult.text`. §4.3
 *  folds them where folding belongs — at match time, inside the resolver — so an
 *  input builder that lowercased would make the panel's own heading disagree
 *  with the selection the reader is looking at. */
export const LOOKUP_ADAPTER_TEXTS = [
  { raw: '  the   daily  ', text: 'the daily' },
  { raw: 'the\n  daily', text: 'the daily' },
  { raw: 'The Daily,', text: 'The Daily,' },
  { raw: 'the daily', text: 'the daily' },
] satisfies readonly { readonly raw: string; readonly text: string }[];

/** Raw text that is not a lookup at all, in either adapter.
 *
 *  Whitespace-only selections are the ordinary case on both DOM hosts — a drag
 *  that ended in the gap between two paragraphs — and `LookupInput.text` refuses
 *  them at the schema. An adapter that passed them on would turn a schema
 *  refusal into a thrown decode error at a host boundary rather than into "no
 *  lookup was asked for". */
export const LOOKUP_ADAPTER_EMPTY_TEXTS: readonly string[] = ['   ', '\n\t ', ''];

/** The one value all three builders must produce. */
export const LOOKUP_ADAPTER_INPUT: LookupInput = LookupInput.make({
  text: LOOKUP_ADAPTER_SELECTION.text,
  context: Option.some(
    Reference.verse(
      LOOKUP_ADAPTER_SELECTION.book,
      LOOKUP_ADAPTER_SELECTION.chapter,
      LOOKUP_ADAPTER_SELECTION.verse,
    ),
  ),
});

/** The same selection made where no verse locates it: a reader selecting inside
 *  a writings paragraph, and `bible wiki lookup "the daily"` with no `--context`.
 *
 *  §7 gives `context` one job — locating the selection inside a verse for the
 *  Strong's group — so its absence is a value both adapters must produce
 *  identically rather than a case each spells its own way. */
export const LOOKUP_ADAPTER_INPUT_NO_CONTEXT: LookupInput = LookupInput.make({
  text: LOOKUP_ADAPTER_SELECTION.text,
  context: Option.none(),
});
