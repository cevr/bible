// Upstream: packages/react/src/popover/close/PopoverClose.tsx
//
// A button that closes the popover. Inside the popup of a modal popover, its
// presence turns on the focus trap (see `closePart.ts`).
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps, NativeButtonProps } from '../../internals/types.ts';
import { useButton } from '../../internals/useButton.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { usePopoverRootContext } from '../root/PopoverRootContext.ts';
import { useClosePartRegistration } from './closePart.ts';

export interface PopoverCloseState {}

export interface PopoverCloseProps
  extends NativeButtonProps, BaseUIComponentProps<'button', PopoverCloseState> {
  /** @default false */
  disabled?: boolean | undefined;
}

export function PopoverClose(componentProps: PopoverCloseProps): JSX.Element {
  const { store } = usePopoverRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'disabled', 'nativeButton');
  useClosePartRegistration();
  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return componentProps.disabled ?? false;
    },
    focusableWhenDisabled: false,
    get native() {
      return componentProps.nativeButton ?? true;
    },
  });
  return useRenderElement('button', componentProps, {
    state: {},
    ref: buttonRef,
    props: [
      {
        onClick(event: MouseEvent) {
          store.setOpen(false, createChangeEventDetails(REASONS.closePress, event));
        },
      },
      elementProps,
      getButtonProps,
    ],
  });
}
