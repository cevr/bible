// Upstream: packages/react/src/dialog/title/DialogTitle.tsx,
// packages/react/src/dialog/description/DialogDescription.tsx
//
// The heading that labels the dialog and the paragraph that describes it:
// each registers its id with the dialog, which names it in the popup's
// `aria-labelledby` or `aria-describedby` while it is rendered.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { useRegisteredId } from '../../utils/useRegisteredId.ts';
import { useDialogRootContext } from '../root/DialogRootContext.ts';

interface DialogTitleState {}

interface DialogTitleProps extends BaseUIComponentProps<'h2', DialogTitleState> {}

interface DialogDescriptionState {}

interface DialogDescriptionProps extends BaseUIComponentProps<'p', DialogDescriptionState> {}

/**
 * A heading that labels the dialog.
 * Renders an `<h2>` element.
 */
export function DialogTitle(componentProps: DialogTitleProps): JSX.Element {
  const { store } = useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');
  const id = useRegisteredId(componentProps, store.setTitleElementId);
  return useRenderElement('h2', componentProps, {
    props: [
      {
        get id() {
          return id();
        },
      },
      elementProps,
    ],
  });
}

/**
 * A paragraph with additional information about the dialog.
 * Renders a `<p>` element.
 */
export function DialogDescription(componentProps: DialogDescriptionProps): JSX.Element {
  const { store } = useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');
  const id = useRegisteredId(componentProps, store.setDescriptionElementId);
  return useRenderElement('p', componentProps, {
    props: [
      {
        get id() {
          return id();
        },
      },
      elementProps,
    ],
  });
}
