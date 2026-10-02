// Upstream: packages/react/src/tabs/panel/TabsPanel.tsx
//
// The panel shown while its tab is active (`role="tabpanel"`,
// `aria-labelledby` naming its tab). An inactive panel is unmounted once its
// exit transition finishes, or with `keepMounted` stays in the DOM, `hidden`
// and `inert`. A mounted panel registers its id so its tab's
// `aria-controls` can name it.
import type { JSX } from '@solidjs/web';
import { Show, createEffect, createSignal, createUniqueId, omit } from 'solid-js';

import { useCompositeListItem } from '../internals/composite/CompositeList.tsx';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps.ts';
import {
  type TransitionStatus,
  createUnmountAfterClose,
  transitionStatusMapping,
} from '../internals/transitions.ts';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import {
  type TabsRootState,
  type TabsTabValue,
  tabsStateAttributesMapping,
  useTabsRootContext,
} from './TabsRootContext.ts';

export interface TabsPanelState extends TabsRootState {
  /** Whether the panel is hidden. */
  hidden: boolean;
  transitionStatus: TransitionStatus;
}

export interface TabsPanelProps extends BaseUIComponentProps<'div', TabsPanelState> {
  /** The panel's value: it shows while the tab with this value is active. */
  value: TabsTabValue;
  /** Whether the panel stays in the DOM while hidden. @default false */
  keepMounted?: boolean | undefined;
}

const stateAttributesMapping = {
  ...tabsStateAttributesMapping,
  ...transitionStatusMapping,
} as StateAttributesMapping<TabsPanelState>;

export function TabsPanel(props: TabsPanelProps): JSX.Element {
  const root = useTabsRootContext();
  const generatedId = createUniqueId();
  const id = () => (typeof props.id === 'string' ? props.id : generatedId);
  const listItem = useCompositeListItem();
  const [element, setElement] = createSignal<HTMLElement | null>(null, { ownedWrite: true });

  const open = () => props.value === root.value;
  const keepMounted = () => props.keepMounted ?? false;
  const { mounted, transitionStatus } = createUnmountAfterClose({ open, element });
  const hidden = () => !mounted();

  createEffect(
    () => [hidden(), keepMounted(), props.value, id()] as const,
    ([isHidden, keep, value, panelId]) => {
      if (isHidden && !keep) {
        return undefined;
      }
      return root.registerMountedTabPanel(value, panelId);
    },
  );

  const state: TabsPanelState = {
    get hidden() {
      return hidden();
    },
    get orientation() {
      return root.orientation;
    },
    get tabActivationDirection() {
      return root.tabActivationDirection;
    },
    get transitionStatus() {
      return transitionStatus();
    },
  };

  const ownProps: HTMLProps = {
    role: 'tabpanel',
    get id() {
      return id();
    },
    get 'aria-labelledby'() {
      return root.getTabIdByPanelValue(props.value);
    },
    get hidden() {
      return hidden();
    },
    get tabindex() {
      return open() ? 0 : -1;
    },
    get inert() {
      return !open();
    },
    get 'data-index'() {
      return listItem.index();
    },
  };

  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'value',
    'keepMounted',
    'id',
  ) as HTMLProps;

  function Element() {
    return useRenderElement('div', props, {
      state,
      ref: [listItem.ref, (node: HTMLElement | null) => setElement(() => node)],
      props: [ownProps, elementProps],
      get stateAttributesMapping() {
        return stateAttributesMapping;
      },
    });
  }

  return (
    <Show when={keepMounted() || mounted()}>
      <Element />
    </Show>
  );
}
