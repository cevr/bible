// Upstream: packages/react/src/utils/hideMiddleware.ts,
// packages/react/src/floating-ui-react/middleware/arrow.ts
//
// Base UI's anchor-hidden detection and its arrow (the centre a popup's
// `--transform-origin` reads), as positioning middleware.
import type { Middleware, Padding } from '@floating-ui/dom';
import {
  clamp,
  getAlignment,
  getAlignmentAxis,
  getAxisLength,
  getPaddingObject,
} from '@floating-ui/utils';

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

interface ArrowOptions {
  /** The arrow element to centre on the anchor. */
  element: Element;
  /** The space kept between the arrow and the floating element's edges. */
  padding?: Padding | undefined;
}

/**
 * Floating UI's `arrow`, measuring against the floating element rather than
 * the arrow's offset parent (upstream's fork), so a detached stand-in arrow
 * still reports where the anchor's centre falls along the popup.
 */
export const arrow = (
  options: (state: Parameters<Middleware['fn']>[0]) => ArrowOptions,
): Middleware => ({
  name: 'arrow',
  async fn(state) {
    const { x, y, placement, rects, platform, elements, middlewareData } = state;
    const { element, padding = 0 } = options(state);

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

    const clientSize = (elements.floating as HTMLElement)[clientProp] || rects.floating[length];

    const centerToReference = endDiff / 2 - startDiff / 2;

    // A padding large enough to uncentre the arrow is cut down to keep it centred.
    const largestPossiblePadding = clientSize / 2 - arrowDimensions[length] / 2 - 1;
    const minPadding = Math.min(paddingObject[minProp], largestPossiblePadding);
    const maxPadding = Math.min(paddingObject[maxProp], largestPossiblePadding);

    // The arrow stays inside the floating element when the centre falls outside it.
    const min = minPadding;
    const max = clientSize - arrowDimensions[length] - maxPadding;
    const center = clientSize / 2 - arrowDimensions[length] / 2 + centerToReference;
    const offset = clamp(min, center, max);

    // An anchor too small for the arrow's padding moves the floating element itself, once,
    // so an aligned arrow still points at the anchor.
    const shouldAddOffset =
      !middlewareData.arrow &&
      getAlignment(placement) != null &&
      center !== offset &&
      rects.reference[length] / 2 -
        (center < min ? minPadding : maxPadding) -
        arrowDimensions[length] / 2 <
        0;
    let alignmentOffset = 0;
    if (shouldAddOffset) {
      alignmentOffset = center < min ? center - min : center - max;
    }

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
