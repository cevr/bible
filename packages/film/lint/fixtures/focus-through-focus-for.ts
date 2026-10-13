// Fixture for film/focus-through-focus-for: each line marked RED fires the
// rule, and nothing else does.

declare const root: HTMLElement;
declare const field: HTMLTextAreaElement | undefined;
declare const focusFor: (el: HTMLElement, input: 'key' | 'pointer') => void;
const STAY: FocusOptions = { preventScroll: true };

export const past = () => [
  root.focus(), // RED film/focus-through-focus-for
  root.focus({ preventScroll: true }), // RED film/focus-through-focus-for
  root.focus(STAY), // RED film/focus-through-focus-for
  root.focus({ ...STAY, focusVisible: false }), // RED film/focus-through-focus-for
  field?.focus({ focusVisible: true }), // RED film/focus-through-focus-for
  root['focus'](), // RED film/focus-through-focus-for
  root.focus.call(root), // RED film/focus-through-focus-for
  root.focus.bind(root), // RED film/focus-through-focus-for
];

export const through = () => [
  focusFor(root, 'key'),
  focusFor(root, 'pointer'),
  root.blur(),
  root.matches(':focus-visible'),
];
