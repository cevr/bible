// Fixture for film/focus-says-visible: each line marked RED fires the rule, and
// nothing else does.

declare const root: HTMLElement;
declare const field: HTMLTextAreaElement | undefined;
const STAY: FocusOptions = { preventScroll: true };

export const unsaid = () => [
  root.focus(), // RED film/focus-says-visible
  root.focus({ preventScroll: true }), // RED film/focus-says-visible
  root.focus(STAY), // RED film/focus-says-visible
  field?.focus(), // RED film/focus-says-visible
  root['focus'](), // RED film/focus-says-visible
];

export const said = () => [
  root.focus({ focusVisible: false }),
  root.focus({ preventScroll: true, focusVisible: true }),
  root.focus({ ...STAY, focusVisible: false }),
  field?.focus({ focusVisible: root.matches(':focus-visible') }),
  root.blur(),
];
