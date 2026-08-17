/** The one hot-phrase surface (§4.7, §5, §8.5).
 *
 *  Three surfaces draw phrase links — the Bible reader's segment renderer, the
 *  EGW paragraph renderer, and the topic page's layered sections — and all three
 *  draw *this*. A second copy would be a second place for `data-claims-gesture`
 *  to go missing, which is the one attribute standing between a phrase tap and
 *  §8.5's study pane opening underneath it.
 *
 *  A `<button>` rather than an `<a>`, and the choice is §8.5's. The gesture rule
 *  is that the verse surface owns the tap *outside* a phrase span, and
 *  `claimedGesture` already treats `A` and `BUTTON` as claiming. But an anchor
 *  would also be *activated by the browser* on click, navigating before the peek
 *  card could open — first tap has to peek, not jump. The `data-claims-gesture`
 *  attribute is set explicitly all the same: it says *why* the element is
 *  excluded, and it is what a future non-button phrase surface would rely on.
 */

import { Option } from 'effect';

import { CLAIMS_GESTURE_ATTRIBUTE } from './gesture.js';
import { topicPath, type Peeked, type PhraseOccurrenceId } from './peek-state.js';

/** `aria-expanded` takes the *string* enumeration, not a boolean — the DOM
 *  attribute's absent state and its `"false"` state mean different things, and
 *  Solid's typing keeps them apart. Same shape `ui/popover.tsx` uses. */
const expandedState = (open: boolean): 'true' | 'false' => {
  if (open) return 'true';
  return 'false';
};

export interface PhraseSpanProps {
  readonly text: string;
  readonly slug: string;
  readonly occurrence: PhraseOccurrenceId;
  /** Which occurrence is currently peeked, so the span can mark itself. */
  readonly peeked: Option.Option<PhraseOccurrenceId>;
  readonly onPhrase: (tapped: Peeked) => void;
}

export const PhraseSpan = (props: PhraseSpanProps) => (
  <button
    type="button"
    class="bible-phrase"
    data-occurrence={props.occurrence}
    // The card is this button's own disclosure, so a screen-reader user learns
    // the tap opened something rather than that it did nothing visible to them.
    aria-expanded={expandedState(Option.contains(props.peeked, props.occurrence))}
    // The topic this opens, visible to a test and to a reader inspecting the
    // page, without the browser activating it the way an `href` would.
    data-topic={topicPath(props.slug)}
    {...{ [CLAIMS_GESTURE_ATTRIBUTE]: '' }}
    onClick={() =>
      props.onPhrase({
        occurrence: props.occurrence,
        slug: props.slug,
        phrase: props.text,
      })
    }
  >
    {props.text}
  </button>
);
