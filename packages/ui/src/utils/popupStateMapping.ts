// Upstream: packages/react/src/utils/popupStateMapping.ts,
// packages/react/src/utils/CommonPopupDataAttributes.ts,
// packages/react/src/utils/CommonTriggerDataAttributes.ts,
// packages/react/src/utils/CommonPositionerCssVars.ts
//
// The `data-*` attributes and CSS variables every popup part shares: a
// trigger is `data-popup-open` while its popup is open; a popup is
// `data-open` or `data-closed`, `data-anchor-hidden` when its anchor scrolls
// away, and carries the transition attributes.
import type { StateAttributesMapping } from '../internals/getStateAttributesProps.ts';
import { type TransitionStatus, transitionStatusMapping } from '../internals/transitions.ts';

export const CommonPopupDataAttributes = {
  open: 'data-open',
  closed: 'data-closed',
  startingStyle: 'data-starting-style',
  endingStyle: 'data-ending-style',
  anchorHidden: 'data-anchor-hidden',
  side: 'data-side',
  align: 'data-align',
} as const;

const CommonTriggerDataAttributes = {
  popupOpen: 'data-popup-open',
  pressed: 'data-pressed',
} as const;

export const CommonPositionerCssVars = {
  availableWidth: '--available-width',
  availableHeight: '--available-height',
  anchorWidth: '--anchor-width',
  anchorHeight: '--anchor-height',
  transformOrigin: '--transform-origin',
} as const;

const PRESSABLE_TRIGGER_HOOK = {
  [CommonTriggerDataAttributes.popupOpen]: '',
  [CommonTriggerDataAttributes.pressed]: '',
};
const POPUP_OPEN_HOOK = { [CommonPopupDataAttributes.open]: '' };
const POPUP_CLOSED_HOOK = { [CommonPopupDataAttributes.closed]: '' };
const ANCHOR_HIDDEN_HOOK = { [CommonPopupDataAttributes.anchorHidden]: '' };

export const pressableTriggerOpenStateMapping: StateAttributesMapping<{ open: boolean }> = {
  open(value) {
    return value ? PRESSABLE_TRIGGER_HOOK : null;
  },
};

export const popupStateMapping: StateAttributesMapping<{ open: boolean; anchorHidden: boolean }> = {
  open(value) {
    return value ? POPUP_OPEN_HOOK : POPUP_CLOSED_HOOK;
  },
  anchorHidden(value) {
    return value ? ANCHOR_HIDDEN_HOOK : null;
  },
};

export const popupTransitionStateMapping: StateAttributesMapping<{
  open: boolean;
  anchorHidden: boolean;
  transitionStatus: TransitionStatus;
}> = {
  ...popupStateMapping,
  ...transitionStatusMapping,
};
