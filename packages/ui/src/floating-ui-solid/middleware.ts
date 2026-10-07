// Upstream: packages/react/src/utils/hideMiddleware.ts
//
// Base UI's anchor-hidden detection, as positioning middleware.
import type { Middleware } from '@floating-ui/dom';

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
