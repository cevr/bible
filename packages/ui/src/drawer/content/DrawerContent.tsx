// Upstream: packages/react/src/drawer/content/DrawerContent.tsx
//
// A region of the drawer's popup where a pointer press never starts a swipe,
// so text in it can be selected with the mouse. Touch still swipes from it.
import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';

import { useDialogRootContext } from '../../dialog/root/DialogRootContext.ts';
import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { DRAWER_CONTENT_ATTRIBUTE } from '../utils/drawerAttributes.ts';

interface DrawerContentState {}

interface DrawerContentProps extends BaseUIComponentProps<'div', DrawerContentState> {}

/**
 * A container for the drawer contents.
 * Renders a `<div>` element.
 */
export function DrawerContent(componentProps: DrawerContentProps): JSX.Element {
  useDialogRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  return useRenderElement('div', componentProps, {
    props: [{ [DRAWER_CONTENT_ATTRIBUTE]: '' }, elementProps],
  });
}
