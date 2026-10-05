// Upstream: packages/utils/src/visuallyHidden.ts
//
// Styles that hide an element visually while keeping it in the accessibility
// tree, pinned to the viewport's corner.
import type { JSX } from '@solidjs/web';

export const visuallyHidden: JSX.CSSProperties = {
  'clip-path': 'inset(50%)',
  overflow: 'hidden',
  'white-space': 'nowrap',
  border: '0',
  padding: '0',
  width: '1px',
  height: '1px',
  position: 'fixed',
  margin: '0',
  top: '0',
  left: '0',
};
