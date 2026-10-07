// Upstream: packages/react/src/internals/constants.ts
//
// Constants the parts share.
import type { JSX } from '@solidjs/web';

export const TYPEAHEAD_RESET_MS = 500;
/** Marks an element a swipe gesture does not start from. */
export const BASE_UI_SWIPE_IGNORE_ATTRIBUTE = 'data-base-ui-swipe-ignore';
export const BASE_UI_SWIPE_IGNORE_SELECTOR = `[${BASE_UI_SWIPE_IGNORE_ATTRIBUTE}]`;

/** Hides the empty `aria-owns` owner span (iOS VoiceControl still reads what it owns). */
export const ownerVisuallyHidden: JSX.CSSProperties = {
  'clip-path': 'inset(50%)',
  position: 'fixed',
  top: '0',
  left: '0',
};
