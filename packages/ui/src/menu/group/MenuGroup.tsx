// Upstream: packages/react/src/menu/group/MenuGroup.tsx,
// packages/react/src/menu/group/MenuGroupContext.ts,
// packages/react/src/menu/group-label/MenuGroupLabel.tsx
//
// A `role="group"` of related items, labelled by its `Menu.GroupLabel`
// (the label registers its id with the group from an effect, as a dialog's
// title does, so a server render writes no signal).
import type { JSX } from '@solidjs/web';
import {
  createContext,
  createEffect,
  createSignal,
  createUniqueId,
  omit,
  untrack,
  useContext,
} from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';

/** Sets (or, with the previous id, clears) the id labelling the group. */
export type MenuGroupContextValue = (
  update: (current: string | undefined) => string | undefined,
) => void;

export const MenuGroupContext = createContext<MenuGroupContextValue | null>(null);

export function useMenuGroupRootContext(): MenuGroupContextValue {
  const context = useContext(MenuGroupContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuGroupContext is missing. Menu group parts must be used within <Menu.Group> or <Menu.RadioGroup>.',
    );
  }
  return context;
}

/** The label id a group's label registers. */
export function createGroupLabelId() {
  const [labelId, setLabelId] = createSignal<string | undefined>(undefined, { ownedWrite: true });
  const update: MenuGroupContextValue = (fn) => setLabelId((current) => fn(current));
  return { labelId, update };
}

export interface MenuGroupState {}

export interface MenuGroupProps extends BaseUIComponentProps<'div', MenuGroupState> {}

export function MenuGroup(componentProps: MenuGroupProps): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render');
  const { labelId, update } = createGroupLabelId();
  // A thunk, built under the providers below so its children read them.
  const element = () =>
    useRenderElement('div', componentProps, {
      props: [
        {
          role: 'group',
          get 'aria-labelledby'() {
            return labelId();
          },
        },
        elementProps,
      ],
    });
  return <MenuGroupContext value={update}>{untrack(element)}</MenuGroupContext>;
}

export interface MenuGroupLabelState {}

export interface MenuGroupLabelProps extends BaseUIComponentProps<'div', MenuGroupLabelState> {}

/** The label of a `Menu.Group`; hidden from assistive tech, which reads it as the group's name. */
export function MenuGroupLabel(componentProps: MenuGroupLabelProps): JSX.Element {
  const elementProps = omit(componentProps, 'class', 'style', 'render', 'id');
  const fallbackId = createUniqueId();
  const id = () => componentProps.id || fallbackId;
  const setLabelId = useMenuGroupRootContext();
  createEffect(id, (value) => {
    setLabelId(() => value);
    return () => setLabelId((current) => (current === value ? undefined : current));
  });
  return useRenderElement('div', componentProps, {
    props: [
      {
        get id() {
          return id();
        },
        'aria-hidden': 'true',
      },
      elementProps,
    ],
  });
}
