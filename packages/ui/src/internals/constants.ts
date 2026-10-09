// Upstream: packages/react/src/internals/constants.ts
//
// Constants the parts share.
import type { JSX } from '@solidjs/web';

export const TYPEAHEAD_RESET_MS = 500;

/** Hides the empty `aria-owns` owner span (iOS VoiceControl still reads what it owns). */
export const ownerVisuallyHidden: JSX.CSSProperties = {
  'clip-path': 'inset(50%)',
  position: 'fixed',
  top: '0',
  left: '0',
};
