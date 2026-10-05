// Upstream: packages/react/src/floating-ui-react/middleware/arrow.ts,
// packages/react/src/utils/hideMiddleware.ts
//
// Base UI's own positioning middleware: an arrow that always measures
// against the popup (not its offset parent), and anchor-hidden detection.
// Upstream's `adaptiveOrigin` is left out: no popup here passes it.
import type { Derivable, Middleware, Padding } from '@floating-ui/dom';
import {
  clamp,
  evaluate,
  getAlignment,
  getAlignmentAxis,
  getAxisLength,
  getPaddingObject,
} from '@floating-ui/utils';

export interface ArrowOptions {
  element: Element | null;
  /** Space kept between the arrow and the popup's edges (its rounded corners). */
  padding?: Padding | undefined;
}

export const arrow = (options: ArrowOptions | Derivable<ArrowOptions>): Middleware => ({
  name: 'arrow',
  options,
  async fn(state) {
    const { x, y, placement, rects, platform, elements, middlewareData } = state;
    const { element, padding = 0 } = evaluate(options, state) || {};
    if (element == null) {
      return {};
    }
    const paddingObject = getPaddingObject(padding);
    const coords = { x, y };
    const axis = getAlignmentAxis(placement);
    const length = getAxisLength(axis);
    const arrowDimensions = await platform.getDimensions(element);
    const isYAxis = axis === 'y';
    const minProp = isYAxis ? 'top' : 'left';
    const maxProp = isYAxis ? 'bottom' : 'right';
    const clientProp = isYAxis ? 'clientHeight' : 'clientWidth';
    const endDiff =
      rects.reference[length] + rects.reference[axis] - coords[axis] - rects.floating[length];
    const startDiff = coords[axis] - rects.reference[axis];
    const clientSize = elements.floating[clientProp] || rects.floating[length];
    const centerToReference = endDiff / 2 - startDiff / 2;
    // Padding too large to center the arrow shrinks so it can.
    const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
    const minPadding = Math.min(paddingObject[minProp], largestPossiblePadding);
    const maxPadding = Math.min(paddingObject[maxProp], largestPossiblePadding);
    const min = minPadding;
    const max = clientSize - arrowDimensions[length] - maxPadding;
    const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
    const offset = clamp(min, center, max);
    // A reference too small for the padded arrow to point at moves the popup
    // instead, with one reset so `shift()` still runs.
    const shouldAddOffset =
      !middlewareData.arrow &&
      getAlignment(placement) != null &&
      center !== offset &&
      rects.reference[length] / 2 -
        (center < min ? minPadding : maxPadding) -
        arrowDimensions[length] / 2 <
        0;
    const alignmentOffset = shouldAddOffset ? (center < min ? center - min : center - max) : 0;
    return {
      [axis]: coords[axis] + alignmentOffset,
      data: {
        [axis]: offset,
        centerOffset: center - offset - alignmentOffset,
        ...(shouldAddOffset && { alignmentOffset }),
      },
      reset: shouldAddOffset,
    };
  },
});

/** Whether the anchor is scrolled out of view (or has no box at all). */
export const hide: Middleware = {
  name: 'hide',
  async fn(state) {
    const { width, height, x, y } = state.rects.reference;
    const anchorHidden = width === 0 && height === 0 && x === 0 && y === 0;
    // Floating UI's core puts `detectOverflow` on the platform before running middleware.
    const detectOverflow = state.platform.detectOverflow;
    if (!detectOverflow) {
      return {};
    }
    const overflow = await detectOverflow(state, { elementContext: 'reference' });
    const referenceHidden =
      overflow.top - height >= 0 ||
      overflow.right - width >= 0 ||
      overflow.bottom - height >= 0 ||
      overflow.left - width >= 0;
    return { data: { referenceHidden: referenceHidden || anchorHidden } };
  },
};
