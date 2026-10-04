// Upstream: packages/utils/src/visuallyHidden.ts
//
// Styles that hide an element visually while keeping it in the accessibility
// tree and the form: `visuallyHidden` pins it to the viewport's corner,
// `visuallyHiddenInput` keeps it in place (so native validation bubbles point
// at the field).
import type { JSX } from '@solidjs/web';

const visuallyHiddenBase: JSX.CSSProperties = {
  'clip-path': 'inset(50%)',
  overflow: 'hidden',
  'white-space': 'nowrap',
  border: '0',
  padding: '0',
  width: '1px',
  height: '1px',
  margin: '-1px',
};

export const visuallyHidden: JSX.CSSProperties = {
  ...visuallyHiddenBase,
  position: 'fixed',
  margin: '0',
  top: '0',
  left: '0',
};

export const visuallyHiddenInput: JSX.CSSProperties = {
  ...visuallyHiddenBase,
  position: 'absolute',
};
