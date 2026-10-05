// Upstream: packages/react/src/internals/reason-parts.ts, packages/react/src/internals/reasons.ts
//
// Why a part's state changed: the `reason` of every change event's details.
// Only the reasons a kept part reports are here.
export const REASONS = {
  none: 'none',
  triggerPress: 'trigger-press',
  triggerFocus: 'trigger-focus',
  outsidePress: 'outside-press',
  itemPress: 'item-press',
  closePress: 'close-press',
  inputChange: 'input-change',
  inputClear: 'input-clear',
  inputBlur: 'input-blur',
  inputPaste: 'input-paste',
  focusOut: 'focus-out',
  escapeKey: 'escape-key',
  closeWatcher: 'close-watcher',
  listNavigation: 'list-navigation',
  keyboard: 'keyboard',
  pointer: 'pointer',
  scrub: 'scrub',
  cancelOpen: 'cancel-open',
  swipe: 'swipe',
} as const;

export type BaseUIEventReasons = typeof REASONS;
export type BaseUIEventReason = BaseUIEventReasons[keyof BaseUIEventReasons];
