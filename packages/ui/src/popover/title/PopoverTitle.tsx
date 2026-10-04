// Upstream: packages/react/src/popover/title/PopoverTitle.tsx,
// packages/react/src/popover/description/PopoverDescription.tsx
//
// The popover's heading and its description: each tells the popup its id
// while mounted, so the popup is labelled (`aria-labelledby`) and described
// (`aria-describedby`) by them.
import type { JSX } from '@solidjs/web';
import { createUniqueId, omit, onCleanup, untrack } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { usePopoverRootContext } from '../root/PopoverRootContext.ts';

export interface PopoverTitleState {}

export interface PopoverTitleProps extends BaseUIComponentProps<
  'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6',
  PopoverTitleState
> {}

export function PopoverTitle(componentProps: PopoverTitleProps): JSX.Element {
  const { store } = usePopoverRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');
  const id = untrack(() => componentProps.id) || createUniqueId();
  store.setTitleElementId(id);
  onCleanup(() => store.setTitleElementId(undefined));
  return useRenderElement('h2', componentProps, {
    state: {},
    props: [{ id }, elementProps],
  });
}

export interface PopoverDescriptionState {}

export interface PopoverDescriptionProps extends BaseUIComponentProps<
  'p',
  PopoverDescriptionState
> {}

export function PopoverDescription(componentProps: PopoverDescriptionProps): JSX.Element {
  const { store } = usePopoverRootContext();
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');
  const id = untrack(() => componentProps.id) || createUniqueId();
  store.setDescriptionElementId(id);
  onCleanup(() => store.setDescriptionElementId(undefined));
  return useRenderElement('p', componentProps, {
    state: {},
    props: [{ id }, elementProps],
  });
}
