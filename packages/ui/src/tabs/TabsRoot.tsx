// Upstream: packages/react/src/tabs/root/TabsRoot.tsx
//
// Groups the tabs and their panels and owns the selected value. An
// uncontrolled root keeps its selection valid: when the selected tab is
// disabled or missing it falls back to the first enabled tab (reason
// `initial`, `disabled` or `missing`; such changes cannot be canceled). An
// explicit `defaultValue` may select a disabled tab on mount. A controlled
// root keeps exactly the value its owner gives. The root also tracks the
// direction of each activation (`data-activation-direction`), from the old
// and new tabs' positions.
import type { JSX } from '@solidjs/web';
import { createEffect, createMemo, createSignal, omit, untrack } from 'solid-js';

import { CompositeList } from '../internals/composite/CompositeList.tsx';
import { createChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../internals/reasons.ts';
import type { BaseUIComponentProps, HTMLProps, Orientation } from '../internals/types.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { useControlled } from '../utils/useControlled.ts';
import {
  type TabMap,
  TabsRootContext,
  type TabsRootChangeEventDetails,
  type TabsRootChangeEventReason,
  type TabsRootContextValue,
  type TabsRootState,
  type TabsTabActivationDirection,
  type TabsTabValue,
  tabsStateAttributesMapping,
} from './TabsRootContext.ts';

export interface TabsRootProps extends BaseUIComponentProps<'div', TabsRootState> {
  /** The active tab's value (controlled); `null` selects none. */
  value?: TabsTabValue | undefined;
  /** The tab active at first (uncontrolled); `null` selects none. @default 0 */
  defaultValue?: TabsTabValue | undefined;
  /** @default 'horizontal' */
  orientation?: Orientation | undefined;
  /**
   * Called when the value changes: reason `none` for a click or key, or, in an
   * uncontrolled root, `initial`, `disabled` or `missing` for an automatic
   * fallback (which `cancel()` does not stop).
   */
  onValueChange?:
    | ((value: TabsTabValue, eventDetails: TabsRootChangeEventDetails) => void)
    | undefined;
}

function findTabElement(tabMap: TabMap, value: TabsTabValue): HTMLElement | null {
  for (const [element, metadata] of tabMap) {
    if (metadata.value === value) {
      return element as HTMLElement;
    }
  }
  return null;
}

function computeActivationDirection(
  oldValue: TabsTabValue,
  newValue: TabsTabValue,
  orientation: Orientation,
  tabMap: TabMap,
): TabsTabActivationDirection {
  if (oldValue == null || newValue == null) {
    return 'none';
  }
  const [side, backward, forward] =
    orientation === 'horizontal'
      ? (['left', 'left', 'right'] as const)
      : (['top', 'up', 'down'] as const);
  const oldTab = findTabElement(tabMap, oldValue);
  const newTab = findTabElement(tabMap, newValue);
  if (oldTab == null || newTab == null) {
    // A tab added and selected at once is not registered yet: compare the values.
    if (
      oldTab !== newTab &&
      (typeof oldValue === 'number' || typeof oldValue === 'string') &&
      typeof oldValue === typeof newValue
    ) {
      return (newValue as number | string) > oldValue ? forward : backward;
    }
    return 'none';
  }
  const oldPosition = oldTab.getBoundingClientRect()[side];
  const newPosition = newTab.getBoundingClientRect()[side];
  if (newPosition < oldPosition) {
    return backward;
  }
  if (newPosition > oldPosition) {
    return forward;
  }
  return 'none';
}

export function TabsRoot(props: TabsRootProps): JSX.Element {
  const orientation = () => props.orientation ?? 'horizontal';
  const hasExplicitDefaultValue = untrack(() => props.defaultValue !== undefined);
  const defaultValue = () => (props.defaultValue === undefined ? 0 : props.defaultValue);
  const initialDefaultValue = untrack(defaultValue);

  const [value, setValue] = useControlled<TabsTabValue>({
    controlled: () => props.value,
    default: defaultValue,
  });
  const isControlled = () => props.value !== undefined;

  const [tabMap, setTabMap] = createSignal<TabMap>(new Map(), { ownedWrite: true });
  const [mountedTabPanels, setMountedTabPanels] = createSignal(new Map<TabsTabValue, string>(), {
    ownedWrite: true,
  });
  const tabPanelRefs: { current: Array<HTMLElement | null> } = { current: [] };

  // An automatic fallback is not a directional move: its value activates with no direction.
  let undirectedValue: { value: TabsTabValue } | null = null;

  // The direction follows each change of the value; while the new tab is not
  // registered yet, the old value is kept so the direction is computed again
  // from the tabs' positions once it is.
  const activation = createMemo<{ previous: TabsTabValue; direction: TabsTabActivationDirection }>(
    (prev) => {
      const current = value();
      const map = tabMap();
      if (prev === undefined) {
        return { previous: current, direction: 'none' };
      }
      if (undirectedValue && undirectedValue.value === current) {
        undirectedValue = null;
        return { previous: current, direction: 'none' };
      }
      if (prev.previous === current) {
        return prev;
      }
      const direction = untrack(() =>
        computeActivationDirection(prev.previous, current, orientation(), map),
      );
      const incomplete =
        prev.previous != null && current != null && findTabElement(map, current) == null;
      return { previous: incomplete ? prev.previous : current, direction };
    },
  );
  const tabActivationDirection = () => activation().direction;

  const onValueChange = (newValue: TabsTabValue, eventDetails: TabsRootChangeEventDetails) => {
    untrack(() => {
      eventDetails.activationDirection = computeActivationDirection(
        value(),
        newValue,
        orientation(),
        tabMap(),
      );
      props.onValueChange?.(newValue, eventDetails);
      if (eventDetails.isCanceled) {
        return;
      }
      setValue(newValue);
    });
  };

  const notifyAutomaticValueChange = (
    nextValue: TabsTabValue,
    reason: TabsRootChangeEventReason,
  ) => {
    untrack(() => props.onValueChange)?.(
      nextValue,
      createChangeEventDetails(reason, undefined, undefined, {
        activationDirection: 'none' as TabsTabActivationDirection,
      }),
    );
  };

  const registerMountedTabPanel = (panelValue: TabsTabValue, panelId: string) => {
    setMountedTabPanels((prev) => new Map(prev).set(panelValue, panelId));
    return () => {
      setMountedTabPanels((prev) => {
        // Another panel with the same value took over in the meantime.
        if (prev.get(panelValue) !== panelId) {
          return prev;
        }
        const next = new Map(prev);
        next.delete(panelValue);
        return next;
      });
    };
  };

  // Implicit uncontrolled selections are automatic changes: notify once when
  // the tabs first register. An explicit default belongs to the owner.
  let shouldNotifyInitialValueChange = !hasExplicitDefaultValue;
  // An explicit default may point at a disabled tab on mount; once the
  // selection is valid, later disabled states fall back.
  let shouldHonorDisabledDefaultValue = hasExplicitDefaultValue;
  let didRegisterTabs = false;
  let lastKnownTabElement: Element | undefined;

  createEffect(
    () => [tabMap(), value(), isControlled()] as const,
    ([map, current, controlled]) => {
      if (controlled) {
        return;
      }

      const commitAutomaticValueChange = (
        fallbackValue: TabsTabValue,
        reason: TabsRootChangeEventReason,
      ) => {
        undirectedValue = { value: fallbackValue };
        setValue(fallbackValue);
        notifyAutomaticValueChange(fallbackValue, reason);
        shouldNotifyInitialValueChange = false;
      };

      if (map.size === 0) {
        if (didRegisterTabs && current !== null && !lastKnownTabElement?.isConnected) {
          commitAutomaticValueChange(null, REASONS.missing);
        }
        return;
      }

      didRegisterTabs = true;
      lastKnownTabElement = map.keys().next().value;

      let selected: { disabled: boolean } | undefined;
      let firstEnabledValue: TabsTabValue | undefined;
      for (const metadata of map.values()) {
        if (selected === undefined && metadata.value === current) {
          selected = metadata;
        }
        if (firstEnabledValue === undefined && !metadata.disabled) {
          firstEnabledValue = metadata.value;
        }
      }

      const selectionIsDisabled = selected?.disabled ?? false;
      const selectionIsMissing = selected == null && current !== null;

      if (!selectionIsDisabled && current === initialDefaultValue) {
        shouldHonorDisabledDefaultValue = false;
      }
      if (
        shouldHonorDisabledDefaultValue &&
        selectionIsDisabled &&
        current === initialDefaultValue
      ) {
        return;
      }

      if (selectionIsDisabled || selectionIsMissing) {
        const fallbackValue = firstEnabledValue ?? null;
        if (current === fallbackValue) {
          shouldNotifyInitialValueChange = false;
          return;
        }
        let reason: TabsRootChangeEventReason = REASONS.missing;
        if (shouldNotifyInitialValueChange) {
          reason = REASONS.initial;
        } else if (selectionIsDisabled) {
          reason = REASONS.disabled;
        }
        commitAutomaticValueChange(fallbackValue, reason);
        return;
      }

      if (shouldNotifyInitialValueChange && selected != null) {
        notifyAutomaticValueChange(current, REASONS.initial);
        shouldNotifyInitialValueChange = false;
      }
    },
  );

  const context: TabsRootContextValue = {
    get value() {
      return value();
    },
    onValueChange,
    get orientation() {
      return orientation();
    },
    get tabActivationDirection() {
      return tabActivationDirection();
    },
    getTabElementBySelectedValue: (selectedValue) => findTabElement(tabMap(), selectedValue),
    getTabIdByPanelValue(panelValue) {
      for (const metadata of tabMap().values()) {
        if (metadata.value === panelValue) {
          return metadata.id;
        }
      }
      return undefined;
    },
    getTabPanelIdByValue: (tabValue) => mountedTabPanels().get(tabValue),
    registerMountedTabPanel,
    setTabMap: (map) => setTabMap(() => map),
  };

  const state: TabsRootState = {
    get orientation() {
      return orientation();
    },
    get tabActivationDirection() {
      return tabActivationDirection();
    },
  };

  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'value',
    'defaultValue',
    'orientation',
    'onValueChange',
  ) as HTMLProps;

  function Element() {
    return useRenderElement('div', props, {
      state,
      props: [elementProps],
      stateAttributesMapping: tabsStateAttributesMapping,
    });
  }

  return (
    <TabsRootContext value={context}>
      <CompositeList elementsRef={tabPanelRefs}>
        <Element />
      </CompositeList>
    </TabsRootContext>
  );
}
