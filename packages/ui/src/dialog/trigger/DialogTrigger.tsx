// Upstream: packages/react/src/dialog/trigger/DialogTrigger.tsx,
// packages/react/src/dialog/trigger/DialogTriggerDataAttributes.ts
//
// The button that opens the dialog on click. It is `data-popup-open` and
// `aria-expanded` while the dialog it opened is open, and names the popup in
// `aria-controls` then. A dialog may have several triggers; the one pressed
// becomes the active trigger, and focus returns to it on close.
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, onCleanup, untrack } from 'solid-js';

import { useClick } from '../../floating-ui-solid/hooks/useClick.ts';
import { CLICK_TRIGGER_IDENTIFIER } from '../../internals/constants.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { useButton } from '../../internals/useButton.ts';
import { propsFromAccessor, useRenderElement } from '../../internals/useRenderElement.tsx';
import {
  CommonTriggerDataAttributes,
  triggerOpenStateMapping,
} from '../../utils/popupStateMapping.ts';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

export const DialogTriggerDataAttributes = {
  /** Present when the corresponding dialog is open. */
  popupOpen: CommonTriggerDataAttributes.popupOpen,
  /** Present when the trigger is disabled. */
  disabled: 'data-disabled',
} as const;

export interface DialogTriggerState {
  disabled: boolean;
  /** Whether the dialog is open and was opened by this trigger. */
  open: boolean;
}

export interface DialogTriggerProps
  extends NativeButtonProps, BaseUIComponentProps<'button', DialogTriggerState> {
  /** @default false */
  disabled?: boolean | undefined;
}

/**
 * A button that opens the dialog.
 * Renders a `<button>` element.
 */
export function DialogTrigger(componentProps: DialogTriggerProps): JSX.Element {
  const { store, triggerProps } = useDialogRootContext();
  const elementProps = omit(
    componentProps,
    'class',
    'style',
    'render',
    'disabled',
    'nativeButton',
    'id',
  );
  const triggerId = untrack(() => componentProps.id) || createUniqueId();

  const disabled = () => componentProps.disabled ?? false;
  const isOpenedByThisTrigger = () => store.isOpenedByTrigger(triggerId);

  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return disabled();
    },
    get native() {
      return componentProps.nativeButton ?? true;
    },
  });

  const click = useClick(store.floatingRootContext);
  const rootTriggerProps = propsFromAccessor(() =>
    triggerProps(store.isMountedByTrigger(triggerId)),
  );

  const state: DialogTriggerState = {
    get disabled() {
      return disabled();
    },
    get open() {
      return isOpenedByThisTrigger();
    },
  };

  onCleanup(() => store.registerTrigger(triggerId, null));

  return useRenderElement('button', componentProps, {
    state,
    stateAttributesMapping: triggerOpenStateMapping,
    ref: (el: HTMLElement) => {
      buttonRef(el);
      store.registerTrigger(triggerId, el);
    },
    props: [
      click.reference,
      rootTriggerProps,
      {
        [CLICK_TRIGGER_IDENTIFIER]: '',
        id: triggerId,
        'aria-haspopup': 'dialog',
        get 'aria-expanded'() {
          return isOpenedByThisTrigger() ? 'true' : 'false';
        },
        get 'aria-controls'() {
          return store.triggerPopupId(triggerId);
        },
      },
      elementProps,
      getButtonProps,
    ],
  });
}
