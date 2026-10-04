// Upstream: packages/react/src/tabs/list/TabsList.tsx
//
// The tab buttons' container (`role="tablist"`): a composite with one tab
// stop, moved by the arrow keys along the orientation, Home and End. Disabled
// tabs stay reachable. With `activateOnFocus` a tab activates when the arrow
// keys focus it; otherwise Enter or Space activates it. The list watches its
// own size and its tabs' sizes so the indicator can follow them.
import type { JSX } from '@solidjs/web';
import { createEffect, createSignal, omit } from 'solid-js';

import { CompositeRoot } from '../internals/composite/CompositeRoot.tsx';
import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import {
  TabsListContext,
  type TabsListContextValue,
  type TabsRootState,
  type TabsTabMetadata,
  tabsStateAttributesMapping,
  useTabsRootContext,
} from './TabsRootContext.ts';

export type TabsListState = TabsRootState;

export interface TabsListProps extends BaseUIComponentProps<'div', TabsListState> {
  /**
   * Whether a tab activates when the arrow keys focus it; otherwise Enter or
   * Space activates it. @default false
   */
  activateOnFocus?: boolean | undefined;
  /** Whether arrowing past the last tab wraps to the first. @default true */
  loopFocus?: boolean | undefined;
}

const NO_DISABLED_INDICES: ReadonlyArray<number> = [];

export function TabsList(props: TabsListProps): JSX.Element {
  const root = useTabsRootContext();
  const [highlightedTabIndex, setHighlightedTabIndex] = createSignal(0, { ownedWrite: true });
  const [tabsListElement, setTabsListElement] = createSignal<HTMLElement | null>(null, {
    ownedWrite: true,
  });

  const indicatorListeners = new Set<() => void>();
  const observedTabs = new Set<HTMLElement>();
  let resizeObserver: ResizeObserver | null = null;

  createEffect(tabsListElement, (listElement) => {
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      indicatorListeners.forEach((listener) => listener());
    });
    resizeObserver = observer;
    if (listElement) {
      observer.observe(listElement);
    }
    observedTabs.forEach((element) => observer.observe(element));
    return () => {
      observer.disconnect();
      resizeObserver = null;
    };
  });

  const context: TabsListContextValue = {
    get activateOnFocus() {
      return props.activateOnFocus ?? false;
    },
    registerIndicatorUpdateListener(listener) {
      indicatorListeners.add(listener);
      return () => indicatorListeners.delete(listener);
    },
    registerTabResizeObserverElement(element) {
      observedTabs.add(element);
      resizeObserver?.observe(element);
      return () => {
        observedTabs.delete(element);
        resizeObserver?.unobserve(element);
      };
    },
    tabsListElement,
  };

  const state: TabsListState = {
    get orientation() {
      return root.orientation;
    },
    get tabActivationDirection() {
      return root.tabActivationDirection;
    },
  };

  const defaultProps: HTMLProps = {
    role: 'tablist',
    get 'aria-orientation'() {
      return root.orientation === 'vertical' ? 'vertical' : undefined;
    },
  };

  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'activateOnFocus',
    'loopFocus',
  ) as HTMLProps;

  return (
    <TabsListContext value={context}>
      <CompositeRoot<TabsTabMetadata, TabsListState>
        render={props.render}
        class={props.class}
        style={props.style}
        state={state}
        refs={[(element: HTMLElement | null) => setTabsListElement(() => element)]}
        props={[defaultProps, elementProps]}
        stateAttributesMapping={tabsStateAttributesMapping}
        highlightedIndex={highlightedTabIndex()}
        onHighlightedIndexChange={setHighlightedTabIndex}
        enableHomeAndEndKeys
        loopFocus={props.loopFocus ?? true}
        orientation={root.orientation}
        onMapChange={root.setTabMap}
        disabledIndices={NO_DISABLED_INDICES}
      />
    </TabsListContext>
  );
}
