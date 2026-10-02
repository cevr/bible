// Upstream: packages/react/src/tabs/tab/TabsTab.tsx
//
// One tab (`role="tab"`, `aria-selected`, `aria-controls` naming its mounted
// panel). A click activates it; with the list's `activateOnFocus`, so does
// keyboard focus or a main-button press (a secondary press only focuses it).
// A disabled tab stays focusable (`aria-disabled`) but cannot activate. When
// the value changes from outside while focus is not in the list, the tab
// stop moves to the active tab (unless it is disabled).
import type { JSX } from '@solidjs/web';
import { createEffect, createUniqueId, omit, onCleanup, untrack } from 'solid-js';

import { ACTIVE_COMPOSITE_ITEM } from '../internals/composite/composite.ts';
import { useCompositeItem } from '../internals/composite/useCompositeItem.ts';
import { useCompositeRootContext } from '../internals/composite/CompositeRootContext.ts';
import { createChangeEventDetails } from '../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../internals/reasons.ts';
import type { BaseUIComponentProps, HTMLProps, NativeButtonProps } from '../internals/types.ts';
import { useButton } from '../internals/useButton.ts';
import { useRenderElement } from '../internals/useRenderElement.tsx';
import { activeElement, contains, ownerDocument } from '../utils/dom.ts';
import {
  type TabsRootState,
  type TabsTabActivationDirection,
  type TabsTabMetadata,
  type TabsTabValue,
  tabsStateAttributesMapping,
  useTabsListContext,
  useTabsRootContext,
} from './TabsRootContext.ts';

export interface TabsTabState extends TabsRootState {
  /** Whether the tab ignores user interaction. */
  disabled: boolean;
  /** Whether the tab is active. */
  active: boolean;
}

export interface TabsTabProps
  extends NativeButtonProps, Omit<BaseUIComponentProps<'button', TabsTabState>, 'value'> {
  /** The tab's value, matching its panel's. */
  value: TabsTabValue;
  /**
   * Whether the tab is disabled. A disabled first tab is not selected at
   * first; the next enabled one is.
   */
  disabled?: boolean | undefined;
}

export function TabsTab(props: TabsTabProps): JSX.Element {
  const root = useTabsRootContext();
  const list = useTabsListContext();
  const composite = useCompositeRootContext();

  const generatedId = createUniqueId();
  const id = () => (typeof props.id === 'string' ? props.id : generatedId);
  const disabled = () => props.disabled ?? false;
  const active = () => props.value === root.value;

  const item = useCompositeItem<TabsTabMetadata>({
    metadata: () => ({ disabled: disabled(), id: id(), value: props.value }),
  });

  let unobserve: (() => void) | null = null;
  // From the ref, so the observer follows the element a `render` swaps in.
  const observeTabElement = (element: HTMLElement | null) => {
    unobserve?.();
    unobserve = element ? list.registerTabResizeObserverElement(element) : null;
  };
  onCleanup(() => unobserve?.());

  // The tab stop follows an activation from outside the list.
  createEffect(
    () => [active(), item.index(), composite.highlightedIndex(), disabled()] as const,
    ([isActive, index, highlightedIndex, isDisabled]) => {
      if (!(isActive && index > -1 && highlightedIndex !== index)) {
        return;
      }
      // Focus in the list keeps the roving highlight where the keyboard left it.
      const listElement = untrack(list.tabsListElement);
      if (listElement != null) {
        const focusedElement = activeElement(ownerDocument(listElement));
        if (focusedElement && contains(listElement, focusedElement)) {
          return;
        }
      }
      // A disabled tab never holds the tab stop.
      if (!isDisabled) {
        composite.onHighlightedIndexChange(index);
      }
    },
  );

  const { getButtonProps, buttonRef } = useButton({
    get disabled() {
      return disabled();
    },
    get native() {
      return props.nativeButton;
    },
    focusableWhenDisabled: true,
    composite: true,
  });

  let isPressing = false;
  let isMainButton = false;

  // Both callers guard on `!active`, so the current value is never committed again.
  const activate = (event: Event) => {
    root.onValueChange(
      untrack(() => props.value),
      createChangeEventDetails(REASONS.none, event, undefined, {
        activationDirection: 'none' as TabsTabActivationDirection,
      }),
    );
  };

  const ownProps: HTMLProps = {
    role: 'tab',
    get 'aria-controls'() {
      return root.getTabPanelIdByValue(props.value);
    },
    get 'aria-selected'() {
      return active() ? 'true' : 'false';
    },
    get id() {
      return id();
    },
    get [ACTIVE_COMPOSITE_ITEM]() {
      return active() ? '' : undefined;
    },
    onClick(event: MouseEvent) {
      if (untrack(active) || untrack(disabled)) {
        return;
      }
      activate(event);
    },
    onFocus(event: FocusEvent) {
      if (untrack(active) || untrack(disabled)) {
        return;
      }
      // Keyboard or touch focus, or a main-button press.
      if (untrack(() => list.activateOnFocus) && (!isPressing || isMainButton)) {
        activate(event);
      }
    },
    onPointerDown(event: PointerEvent) {
      if (untrack(active) || untrack(disabled)) {
        return;
      }
      isPressing = true;
      // A secondary press (context menu, middle click) may focus the tab but not activate it.
      isMainButton = event.button === 0;
      const doc = ownerDocument(event.currentTarget as Element);
      const handlePointerEnd = () => {
        isPressing = false;
        isMainButton = false;
        doc.removeEventListener('pointerup', handlePointerEnd);
        doc.removeEventListener('pointercancel', handlePointerEnd);
      };
      doc.addEventListener('pointerup', handlePointerEnd);
      doc.addEventListener('pointercancel', handlePointerEnd);
    },
  };

  const state: TabsTabState = {
    get disabled() {
      return disabled();
    },
    get active() {
      return active();
    },
    get orientation() {
      return root.orientation;
    },
    get tabActivationDirection() {
      return root.tabActivationDirection;
    },
  };

  const elementProps = omit(
    props,
    'class',
    'style',
    'render',
    'value',
    'disabled',
    'id',
    'nativeButton',
  ) as HTMLProps;

  return useRenderElement('button', props, {
    state,
    ref: [buttonRef, item.compositeRef, observeTabElement],
    props: [item.compositeProps, ownProps, elementProps, getButtonProps],
    stateAttributesMapping: tabsStateAttributesMapping,
  });
}
