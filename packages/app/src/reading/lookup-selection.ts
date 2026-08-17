/** The portable lookup input, built from a DOM selection (§7, Milestone 7).
 *
 *  §7 calls the selection a **portable lookup input**: "Web and desktop build it
 *  from the DOM selection plus reading context; the CLI accepts the same text as
 *  an argument". The builder cannot live in core — `packages/core` has no DOM
 *  and must not grow one — so it lives here, where both visual hosts already
 *  share one component tree. Web and desktop therefore build the value with the
 *  *same* function rather than with two that agree today.
 *
 *  The agreement with the third builder is held by a fixture, the way Milestone
 *  4's span parity is: `@bible/core/wiki/testing`'s `LOOKUP_ADAPTER_INPUT` is
 *  the one value, this module is asserted against it in
 *  `lookup-selection.test.ts`, and `bible wiki lookup`'s own builder is asserted
 *  against it in `packages/cli/test/commands/wiki.test.ts`. No package can
 *  import both builders, so a shared expected value is what makes the claim
 *  checkable at all.
 *
 *  The text rule itself is **not** here. `lookupInputOf` in core collapses
 *  §4.3's whitespace and refuses text that collapses away, and the CLI's builder
 *  calls the same function — so this module is the DOM half only: what a
 *  `Selection` is, when it is asking for a lookup at all, which verse (if any)
 *  holds it, and which click it owns.
 *
 *  Pure, and outside the JSX, for the reason `gesture.ts` and `peek-state.ts`
 *  are: this package's tests run under plain Bun with no DOM, so a decision
 *  taken inside a component is a decision no unit test can see. What the
 *  *markup* does with the value is asserted against the compiled components in
 *  `apps/desktop/e2e/lookup-panel.spec.ts`.
 */

import type { VerseReference } from '@bible/core/bible';
import { lookupInputOf, type LookupInput } from '@bible/core/wiki';
import { Option } from 'effect';

/** Exactly the part of the DOM's `Selection` this module reads.
 *
 *  A real `Selection` is assignable to it, so a host passes
 *  `window.getSelection()` unchanged, and naming the members states the whole of
 *  this file's dependency on the DOM — the same seam `GestureTarget` draws in
 *  `gesture.ts`, and for the same reason: a stand-in cast to `Selection` would
 *  assert a conformance it does not have. */
export interface TextSelection {
  /** True when the selection is an insertion point rather than a range — which
   *  is what an ordinary click leaves behind. */
  readonly isCollapsed: boolean;
  readonly toString: () => string;
  /** Zero for a selection with no range at all, which is what a surface that
   *  has never been selected in reports. */
  readonly rangeCount: number;
  readonly getRangeAt: (index: number) => SelectionRange;
}

/** Exactly the part of a DOM `Range` this module reads: where it starts and
 *  where it ends. The two are the question §7's `context` turns on — a
 *  selection that begins in one verse and ends in another is located in
 *  neither. */
export interface SelectionRange {
  readonly startContainer: SelectionNode;
  readonly endContainer: SelectionNode;
}

/** A range end, as the walk to its verse reads it. A `Range` end is usually a
 *  text node, which carries no attributes of its own — so the walk starts at its
 *  parent, exactly as `claimedGesture`'s does. */
export interface SelectionNode {
  /* oxlint-disable-next-line effect/noNullish -- `Node.parentElement` is typed
     `HTMLElement | null` by the DOM itself. Naming that exact type is what makes
     a real range end assignable here; it is read through `Option.fromNullishOr`
     below, so the nullish stops at this line. */
  readonly parentElement: VerseTarget | null;
}

/** Exactly the part of `Element` the verse walk reads. */
export interface VerseTarget extends SelectionNode {
  /* oxlint-disable-next-line effect/noNullish -- `Element.getAttribute` is typed
     `string | null` by the DOM itself, for the same reason. */
  readonly getAttribute: (name: string) => string | null;
}

/** The attribute a reading surface marks a verse with.
 *
 *  A data attribute rather than the `id`, so the marker says what it is for and
 *  cannot be confused with the anchor target the verse number already uses. */
export const VERSE_ATTRIBUTE = 'data-verse';

/** The verse number the node sits in, by the same upward walk `gesture.ts`
 *  uses. `None` outside any verse — which is every node on a writings surface. */
const verseAt = (node: SelectionNode): Option.Option<number> => {
  let current = Option.fromNullishOr(node.parentElement);
  while (Option.isSome(current)) {
    const element = current.value;
    const marked = Option.fromNullishOr(element.getAttribute(VERSE_ATTRIBUTE));
    if (Option.isSome(marked)) {
      const verse = Number(marked.value);
      if (Number.isInteger(verse)) return Option.some(verse);
      return Option.none();
    }
    current = Option.fromNullishOr(element.parentElement);
  }
  return Option.none();
};

/** The verse that holds **the whole selection**, when one does.
 *
 *  §7 gives `context` exactly one job: it "locates the selection inside a
 *  verse", and the Strong's group then reports the verse words the selection
 *  covers. A selection that starts in verse 12 and ends in verse 13 is located
 *  in neither, and naming the verse the gesture happened to *end* in — which is
 *  what the element handling `mouseup` knows — makes core compare one verse's
 *  words against another verse's text. The reader is then shown lexicon entries
 *  for words that are not in their selection, with nothing on screen to say so.
 *
 *  Both ends, therefore, or no context at all: four groups is the honest answer
 *  to a selection no single verse holds. */
export const selectionVerse = (selection: TextSelection): Option.Option<number> => {
  if (selection.rangeCount === 0) return Option.none();
  const range = selection.getRangeAt(0);
  const start = verseAt(range.startContainer);
  const end = verseAt(range.endContainer);
  if (Option.isNone(start) || Option.isNone(end)) return Option.none();
  if (start.value !== end.value) return Option.none();
  return start;
};

/** The lookup a selection asks for, or `None` when it asks for none.
 *
 *  `None` is the ordinary case and is not a failure: every click in the reading
 *  surface leaves a collapsed selection, and a selection of pure whitespace
 *  collapses to nothing. Returning an absent lookup rather than an empty one is
 *  what lets the caller mount the panel from this value directly — there is no
 *  second "is it worth showing" predicate for a host to spell differently from
 *  its sibling.
 *
 *  `context` is the verse the selection is located in, which the caller reads
 *  with {@link selectionVerse}. A selection made outside Scripture — a writings
 *  paragraph, a topic page — passes `None` and gets four groups. */
export const lookupSelection = (
  selection: TextSelection,
  context: Option.Option<VerseReference>,
): Option.Option<LookupInput> => {
  if (selection.isCollapsed) return Option.none();
  return lookupInputOf({ text: selection.toString(), context });
};

/** Whether the selection just made owns the `click` that follows it (§8.5).
 *
 *  A drag over verse text ends in `mouseup` — which opens the panel — and the
 *  browser then delivers a `click` to the same element, because a click is a
 *  press and a release on one target however far the pointer travelled between
 *  them. The verse surface's own handler answers that click by opening the study
 *  pane, so one gesture opened two surfaces and the second covered the first.
 *  §8.5's rule is that the two layers never claim the same gesture, and this is
 *  the third claimant: a selection owns the click that completed it.
 *
 *  Read off the live selection rather than remembered in a flag, because the
 *  browser already holds the fact. A press that starts a *new* gesture collapses
 *  the selection before `click` is delivered, so an ordinary verse tap after a
 *  lookup still opens the pane — which is what makes this a rule about one
 *  gesture rather than a mode the reader has to get out of. */
export const selectionOwnsClick = (selection: Option.Option<TextSelection>): boolean =>
  Option.match(selection, {
    onNone: () => false,
    onSome: (made) => Option.isSome(lookupSelection(made, Option.none())),
  });
