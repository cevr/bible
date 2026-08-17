/** §8.5's gesture rule, as one function.
 *
 *  > **The two link layers never claim the same gesture.** Verse tap opens the
 *  > study pane. Wiki phrase tap opens the peek card. Phrases are inline spans;
 *  > the verse surface owns the tap **outside** a phrase span. This is the one
 *  > place the study seam touches the wiki layer, and it is a hard rule, not a
 *  > preference.
 *
 *  The rule is a *precedence*, and precedence between an outer surface and an
 *  inner one is decided by asking what the tap actually landed on. That question
 *  lives here rather than inside the reader so that Milestone 6 adds phrase
 *  spans without editing the verse handler: a span that renders with
 *  `data-claims-gesture` is already excluded by this walk, and the reader's
 *  `onClick` already consults it.
 *
 *  Written as a walk from the target up to the verse surface rather than as a
 *  check on the target alone, because the claiming element may have children —
 *  a phrase span will wrap text nodes, and in Milestone 6 possibly an icon —
 *  and a tap on a child is a tap on the phrase.
 */

import { Option } from 'effect';

/** The attribute an inner link layer sets to claim the tap for itself.
 *
 *  A data attribute rather than a class or a tag check: it says *why* the
 *  element is excluded, it cannot collide with a styling class someone renames,
 *  and Milestone 6's phrase span declares it in one place. */
export const CLAIMS_GESTURE_ATTRIBUTE = 'data-claims-gesture';

/** The verse surface itself. The walk stops here rather than at the document
 *  root, so an ancestor outside the verse cannot suppress a verse tap. */
const VERSE_SURFACE_SELECTOR = '[role="listitem"]';

/** The element that claimed this tap, or `None` when the verse surface owns it.
 *
 *  Three kinds of element claim a tap:
 *
 *  - an `<a>`, because it is a real link and the browser is already activating
 *    it — running the verse handler as well would push the same route twice;
 *  - a `<button>`, for the same reason: it is an interactive control whose own
 *    handler is the point of the tap;
 *  - anything carrying `data-claims-gesture`, which is how the wiki phrase layer
 *    will declare itself in Milestone 6.
 *
 *  Returns the claiming element rather than a boolean so a caller can say which
 *  layer took the gesture — useful in a test, and the difference between a
 *  debuggable rule and an opaque one. */
const CLAIMING_TAGS: ReadonlySet<string> = new Set(['A', 'BUTTON']);

/** Exactly the part of `Element` the walk reads.
 *
 *  `Element` is assignable to this, so the reader passes a real event target
 *  unchanged. Stating the four members instead of taking `Element` names the
 *  rule's whole dependency on the DOM, and lets this file be tested in a package
 *  that has no DOM to render into — the alternative being a cast of a stand-in
 *  to `Element`, which would assert a conformance the stand-in does not have. */
export interface GestureTarget {
  readonly tagName: string;
  /* oxlint-disable-next-line effect/noNullish -- `Element.parentElement` is
     typed `Element | null` by the DOM itself. Naming that exact type is what
     makes a real `Element` assignable here; it is read through
     `Option.fromNullishOr` below, so the nullish stops at this line. */
  readonly parentElement: GestureTarget | null;
  readonly matches: (selector: string) => boolean;
  readonly hasAttribute: (name: string) => boolean;
}

export const claimedGesture = (target: GestureTarget): Option.Option<GestureTarget> => {
  let current = Option.some(target);
  while (Option.isSome(current)) {
    const element = current.value;
    if (element.matches(VERSE_SURFACE_SELECTOR)) return Option.none();
    if (CLAIMING_TAGS.has(element.tagName) || element.hasAttribute(CLAIMS_GESTURE_ATTRIBUTE)) {
      return Option.some(element);
    }
    current = Option.fromNullishOr(element.parentElement);
  }
  return Option.none();
};
