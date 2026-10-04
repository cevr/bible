// Upstream: packages/react/src/tabs/root/TabsRootContext.ts,
// packages/react/src/tabs/list/TabsListContext.ts,
// packages/react/src/tabs/root/stateAttributesMapping.ts,
// packages/react/src/tabs/tab/TabsTab.tsx (the shared types)
//
// What the tab parts share: the root's selected value and how to change it,
// the tab and panel ids each side's ARIA wiring needs, and the direction of
// the last activation; and from the tab list, whether focus activates a tab
// and the hooks the indicator measures by.
import { type Accessor, createContext, useContext } from 'solid-js';

import type { BaseUIChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import type { CompositeMetadata } from '../internals/composite/CompositeList.tsx';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps.ts';
import type { REASONS } from '../internals/reasons.ts';
import type { Orientation } from '../internals/types.ts';

/** A tab's value: anything compared by identity; `null` selects no tab. */
export type TabsTabValue = unknown;

export type TabsTabActivationDirection = 'left' | 'right' | 'up' | 'down' | 'none';

export interface TabsTabPosition {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface TabsTabSize {
  width: number;
  height: number;
}

export interface TabsTabMetadata {
  disabled: boolean;
  id: string | undefined;
  value: TabsTabValue;
}

export type TabsRootChangeEventReason =
  | typeof REASONS.none
  | typeof REASONS.disabled
  | typeof REASONS.missing
  | typeof REASONS.initial;

export type TabsRootChangeEventDetails = BaseUIChangeEventDetails<
  TabsRootChangeEventReason,
  { activationDirection: TabsTabActivationDirection }
>;

export type TabMap = Map<Element, CompositeMetadata<TabsTabMetadata>>;

export interface TabsRootState {
  /** The tabs' orientation. */
  orientation: Orientation;
  /** Where the active tab sits relative to the one active before it. */
  tabActivationDirection: TabsTabActivationDirection;
}

export interface TabsRootContextValue {
  readonly value: TabsTabValue;
  onValueChange: (value: TabsTabValue, eventDetails: TabsRootChangeEventDetails) => void;
  readonly orientation: Orientation;
  readonly tabActivationDirection: TabsTabActivationDirection;
  getTabElementBySelectedValue: (selectedValue: TabsTabValue) => HTMLElement | null;
  /** The `id` of the tab for a panel's value: the panel's `aria-labelledby`. */
  getTabIdByPanelValue: (panelValue: TabsTabValue) => string | undefined;
  /** The `id` of the mounted panel for a tab's value: the tab's `aria-controls`. */
  getTabPanelIdByValue: (tabValue: TabsTabValue) => string | undefined;
  registerMountedTabPanel: (panelValue: TabsTabValue, panelId: string) => () => void;
  setTabMap: (map: TabMap) => void;
}

export const TabsRootContext = createContext<TabsRootContextValue | null>(null);

export function useTabsRootContext(): TabsRootContextValue {
  const context = useContext(TabsRootContext);
  if (context === null) {
    throw new Error(
      'Base UI: TabsRootContext is missing. Tabs parts must be placed within <Tabs.Root>.',
    );
  }
  return context;
}

export interface TabsListContextValue {
  readonly activateOnFocus: boolean;
  /** Called whenever the list or a tab resizes; returns the unregistration. */
  registerIndicatorUpdateListener: (listener: () => void) => () => void;
  registerTabResizeObserverElement: (element: HTMLElement) => () => void;
  tabsListElement: Accessor<HTMLElement | null>;
}

export const TabsListContext = createContext<TabsListContextValue | null>(null);

export function useTabsListContext(): TabsListContextValue {
  const context = useContext(TabsListContext);
  if (context === null) {
    throw new Error(
      'Base UI: TabsListContext is missing. TabsList parts must be placed within <Tabs.List>.',
    );
  }
  return context;
}

export const tabsStateAttributesMapping: StateAttributesMapping<TabsRootState> = {
  tabActivationDirection: (direction) => ({ 'data-activation-direction': direction }),
};
