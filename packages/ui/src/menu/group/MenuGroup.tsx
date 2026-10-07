// Upstream: packages/react/src/menu/group/MenuGroup.tsx,
// packages/react/src/menu/group/MenuGroupContext.ts,
// packages/react/src/menu/group-label/MenuGroupLabel.tsx
//
// A `role="group"` of related items, labelled by its `Menu.GroupLabel`
// (the label registers its id with the group as a dialog's title does).
import type { JSX } from '@solidjs/web';
import { createContext, createSignal, omit, untrack, useContext } from 'solid-js';

import type { BaseUIComponentProps } from '../../internals/types.ts';
import { useRenderElement } from '../../internals/useRenderElement.tsx';
import { type RegisterId, useRegisteredId } from '../../utils/useRegisteredId.ts';

/** Sets the id labelling the group. */
export type MenuGroupContextValue = RegisterId;

export const MenuGroupContext = createContext<MenuGroupContextValue | null>(null);

export function useMenuGroupRootContext(): MenuGroupContextValue {
  const context = useContext(MenuGroupContext);
  if (context === null) {
    throw new Error(
      'Base UI: MenuGroupContext is missing. Menu group parts must be used within <Menu.Group>.',
    );
  }
  return context;
}

/** The label id a group's label registers. */
function createGroupLabelId() {
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
  const id = useRegisteredId(componentProps, useMenuGroupRootContext());
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
