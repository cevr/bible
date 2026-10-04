// Upstream: packages/react/src/dialog/close/DialogClose.tsx
//
// A button that closes the dialog it is in (reason `close-press`).
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { useButton } from '../../internals/useButton.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

export interface DialogCloseState {
  disabled: boolean;
}

export interface DialogCloseProps
  extends NativeButtonProps, BaseUIComponentProps<'button', DialogCloseState> {
  /** @default false */
  disabled?: boolean | undefined;
}

/**
 * A button that closes the dialog.
 * Renders a `<button>` element.
 */
export function DialogClose(componentProps: DialogCloseProps): JSX.Element {
  const { store } = useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'disabled', 'nativeButton');
  const disabled = () => componentProps.disabled ?? false;

  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return disabled();
    },
    get native() {
      return componentProps.nativeButton ?? true;
    },
  });

  const state: DialogCloseState = {
    get disabled() {
      return disabled();
    },
  };

  return useRenderElement('button', componentProps, {
    state,
    ref: buttonRef,
    props: [
      {
        onClick(event: MouseEvent) {
          if (untrack(store.open)) {
            store.setOpen(false, createChangeEventDetails(REASONS.closePress, event));
          }
        },
      },
      elementProps,
      getButtonProps,
    ],
  });
}
