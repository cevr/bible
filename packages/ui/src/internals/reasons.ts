// Upstream: packages/react/src/internals/reason-parts.ts, packages/react/src/internals/reasons.ts
//
// Why a part's state changed: the `reason` of every change event's details.
export const REASONS = {
  none: 'none',
  triggerPress: 'trigger-press',
  triggerHover: 'trigger-hover',
  triggerFocus: 'trigger-focus',
  outsidePress: 'outside-press',
  itemPress: 'item-press',
  closePress: 'close-press',
  linkPress: 'link-press',
  clearPress: 'clear-press',
  chipRemovePress: 'chip-remove-press',
  trackPress: 'track-press',
  incrementPress: 'increment-press',
  decrementPress: 'decrement-press',
  inputChange: 'input-change',
  inputClear: 'input-clear',
  inputBlur: 'input-blur',
  inputPaste: 'input-paste',
  inputPress: 'input-press',
  focusOut: 'focus-out',
  escapeKey: 'escape-key',
  closeWatcher: 'close-watcher',
  listNavigation: 'list-navigation',
  keyboard: 'keyboard',
  pointer: 'pointer',
  drag: 'drag',
  wheel: 'wheel',
  scrub: 'scrub',
  popupClose: 'popup-close',
  cancelOpen: 'cancel-open',
  siblingOpen: 'sibling-open',
  disabled: 'disabled',
  missing: 'missing',
  initial: 'initial',
  imperativeAction: 'imperative-action',
  swipe: 'swipe',
  windowResize: 'window-resize',
} as const;

export type BaseUIEventReasons = typeof REASONS;
export type BaseUIEventReason = BaseUIEventReasons[keyof BaseUIEventReasons];
