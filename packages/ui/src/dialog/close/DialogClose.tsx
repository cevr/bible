// Upstream: packages/react/src/dialog/close/DialogClose.tsx
//
// A button that closes the dialog it is in (reason `close-press`).
import type { JSX } from '@solidjs/web';
import { omit, untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useButton } from '../../internals/useButton.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

interface DialogCloseState {}

interface DialogCloseProps extends BaseUIComponentProps<'button', DialogCloseState> {}

/**
 * A button that closes the dialog.
 * Renders a `<button>` element.
 */
export function DialogClose(componentProps: DialogCloseProps): JSX.Element {
  const { store } = useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');

  const { getButtonProps } = useButton();

  return useRenderElement('button', componentProps, {
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
