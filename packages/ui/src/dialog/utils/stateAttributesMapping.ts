// Upstream: packages/react/src/dialog/utils/stateAttributesMapping.ts,
// packages/react/src/dialog/popup/DialogPopupDataAttributes.ts,
// packages/react/src/dialog/popup/DialogPopupCssVars.ts,
// packages/react/src/dialog/viewport/DialogViewportDataAttributes.ts,
// packages/react/src/dialog/backdrop/DialogBackdropDataAttributes.ts,
// packages/react/src/dialog/close/DialogCloseDataAttributes.ts
//
// The `data-*` attributes and CSS variables of the dialog's parts. The popup
// and the viewport share one state shape: open or closed, the transition,
// `data-nested` inside another dialog, and `data-nested-dialog-open` while a
// dialog nested in it is open.
import type { StateAttributesMapping } from '../../internals/getStateAttributesProps.ts';
import { type TransitionStatus, transitionStatusMapping } from '../../internals/transitions.ts';
import { CommonPopupDataAttributes, popupStateMapping } from '../../utils/popupStateMapping.ts';

export const DialogPopupDataAttributes = {
  open: CommonPopupDataAttributes.open,
  closed: CommonPopupDataAttributes.closed,
  startingStyle: CommonPopupDataAttributes.startingStyle,
  endingStyle: CommonPopupDataAttributes.endingStyle,
  /** Present when the dialog is nested within another dialog. */
  nested: 'data-nested',
  /** Present when the dialog has other open dialogs nested within it. */
  nestedDialogOpen: 'data-nested-dialog-open',
} as const;

export const DialogViewportDataAttributes = DialogPopupDataAttributes;

export const DialogBackdropDataAttributes = {
  open: CommonPopupDataAttributes.open,
  closed: CommonPopupDataAttributes.closed,
  startingStyle: CommonPopupDataAttributes.startingStyle,
  endingStyle: CommonPopupDataAttributes.endingStyle,
} as const;

export const DialogCloseDataAttributes = {
  /** Present when the button is disabled. */
  disabled: 'data-disabled',
} as const;

export const DialogPopupCssVars = {
  /** How many dialogs are open nested within. */
  nestedDialogs: '--nested-dialogs',
} as const;

const NESTED_DIALOG_OPEN_HOOK = { [DialogPopupDataAttributes.nestedDialogOpen]: '' };

/** Shared by the popup and the viewport; `nested` renders as `data-nested` unmapped. */
export const dialogStateAttributesMapping: StateAttributesMapping<{
  open: boolean;
  transitionStatus: TransitionStatus;
  nested: boolean;
  nestedDialogOpen: boolean;
}> = {
  ...popupStateMapping,
  ...transitionStatusMapping,
  nestedDialogOpen(value) {
    return value ? NESTED_DIALOG_OPEN_HOOK : null;
  },
};
