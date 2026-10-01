/** The portable lookup input every adapter must build (§7, Milestone 7).
 *
 *  §10's Milestone 7 adapter check is that every adapter produces the same
 *  portable lookup input. It is held the way Milestone 4's span parity is held:
 *  **one fixture in core**, and each adapter asserts its own output equals it.
 *
 *  The selection is §7's own example — `bible wiki lookup "the daily" --context
 *  "Dan 8:13"` — so the fixture is the milestone's acceptance workflow rather
 *  than a phrase invented for a test.
 *
 *  What is compared is the **decoded** `LookupInput`, not its encoding: the
 *  value is what a builder produces, and the CLI never encodes it at all (it
 *  hands it straight to `LookupService`). Equality on the class is
 *  `Equal`-based structural equality, which is what `Schema.Class` gives.
 */

import { Option } from 'effect';

import { Reference } from '../bible/model.js';
import { LookupInput } from './lookup-model.js';

/** The selection as each adapter receives it: the text a reader selected, and
 *  the verse it came from as that adapter names a verse.
 *
 *  The CLI is handed `reference` as the `--context` string it parses; the
 *  numbers are the same verse, stated once. */
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
 *  A shell argument carries whatever the caller quoted, padding and line
 *  breaks included, so the fixture holds text that is not already clean.
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

/** Raw text that is not a lookup at all, in any adapter.
 *
 *  `LookupInput.text` refuses whitespace-only selections at the schema. An
 *  adapter that passed them on would turn a schema refusal into a thrown
 *  decode error at a host boundary rather than into "no lookup was asked
 *  for". */
export const LOOKUP_ADAPTER_EMPTY_TEXTS: readonly string[] = ['   ', '\n\t ', ''];

/** The one value every builder must produce. */
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
 *  Strong's group — so its absence is a value every adapter must produce
 *  identically rather than a case each spells its own way. */
export const LOOKUP_ADAPTER_INPUT_NO_CONTEXT: LookupInput = LookupInput.make({
  text: LOOKUP_ADAPTER_SELECTION.text,
  context: Option.none(),
});
