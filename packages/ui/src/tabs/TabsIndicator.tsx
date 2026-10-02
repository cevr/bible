// Upstream: packages/react/src/tabs/indicator/TabsIndicator.tsx,
// packages/react/src/tabs/indicator/TabsIndicatorCssVars.ts
//
// A visual marker of the active tab, placed inside the tab list. It measures
// the active tab after each change of the selection and whenever the list or
// a tab resizes, and exposes the result as CSS variables
// (`--active-tab-left/right/top/bottom/width/height`, in px, relative to the
// list's padding box). It stays `hidden` until the active tab has a size, and
// renders nothing while no tab is selected.
import type { JSX } from '@solidjs/web';
import { Show, createEffect, createSignal, omit, onCleanup } from 'solid-js';

import type { BaseUIComponentProps, HTMLProps } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { type ActiveTabMeasurement, measureActiveTab } from './measure.ts';
import {
  type TabsRootState,
  type TabsTabPosition,
  type TabsTabSize,
  tabsStateAttributesMapping,
  useTabsListContext,
  useTabsRootContext,
} from './TabsRootContext.ts';

export const TabsIndicatorCssVars = {
  activeTabLeft: '--active-tab-left',
  activeTabRight: '--active-tab-right',
  activeTabTop: '--active-tab-top',
  activeTabBottom: '--active-tab-bottom',
  activeTabWidth: '--active-tab-width',
  activeTabHeight: '--active-tab-height',
} as const;

export interface TabsIndicatorState extends TabsRootState {
  /** The active tab's position in the list, or `null` while none is measured. */
  activeTabPosition: TabsTabPosition | null;
  /** The active tab's size, or `null` while none is measured. */
  activeTabSize: TabsTabSize | null;
}

export interface TabsIndicatorProps extends BaseUIComponentProps<'span', TabsIndicatorState> {}

const stateAttributesMapping = {
  ...tabsStateAttributesMapping,
  activeTabPosition: () => null,
  activeTabSize: () => null,
};

export function TabsIndicator(props: TabsIndicatorProps): JSX.Element {
  const root = useTabsRootContext();
  const list = useTabsListContext();

  const [revision, setRevision] = createSignal(0, { ownedWrite: true });
  const [measurement, setMeasurement] = createSignal<ActiveTabMeasurement | null>(null, {
    ownedWrite: true,
  });

  const unregister = list.registerIndicatorUpdateListener(() => setRevision((n) => n + 1));
  onCleanup(unregister);

  // Measured after the DOM settles, so the active tab's own styles apply.
  createEffect(
    () => {
      revision();
      const value = root.value;
      const listElement = list.tabsListElement();
      const activeTab = value == null ? null : root.getTabElementBySelectedValue(value);
      return [activeTab, listElement] as const;
    },
    ([activeTab, listElement]) => {
      setMeasurement(() =>
        activeTab != null && listElement != null && activeTab.isConnected
          ? measureActiveTab(activeTab, listElement)
          : null,
      );
    },
  );

  const state: TabsIndicatorState = {
    get orientation() {
      return root.orientation;
    },
    get tabActivationDirection() {
      return root.tabActivationDirection;
    },
    get activeTabPosition() {
      const m = measurement();
      return m ? { left: m.left, right: m.right, top: m.top, bottom: m.bottom } : null;
    },
    get activeTabSize() {
      const m = measurement();
      return m ? { width: m.width, height: m.height } : null;
    },
  };

  const ownProps: HTMLProps = {
    role: 'presentation',
    get style() {
      const m = measurement();
      if (!m) {
        return undefined;
      }
      return {
        [TabsIndicatorCssVars.activeTabLeft]: `${m.left}px`,
        [TabsIndicatorCssVars.activeTabRight]: `${m.right}px`,
        [TabsIndicatorCssVars.activeTabTop]: `${m.top}px`,
        [TabsIndicatorCssVars.activeTabBottom]: `${m.bottom}px`,
        [TabsIndicatorCssVars.activeTabWidth]: `${m.width}px`,
        [TabsIndicatorCssVars.activeTabHeight]: `${m.height}px`,
      };
    },
    // Hidden until the layout has settled on a measurable tab.
    get hidden() {
      const m = measurement();
      return !(m && m.width > 0 && m.height > 0);
    },
  };

  const elementProps = omit(props, 'class', 'style', 'render') as HTMLProps;

  function Element() {
    return useRenderElement('span', props, {
      state,
      props: [ownProps, elementProps],
      stateAttributesMapping,
    });
  }

  return (
    <Show when={root.value != null}>
      <Element />
    </Show>
  );
}
