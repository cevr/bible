// Upstream: packages/react/src/floating-ui-react/hooks/useListNavigation.ts
//
// Arrow-key navigation over a popup's list of items: Arrow keys move the
// highlight (skipping disabled items, wrapping with `loopFocus`), Home/End
// jump to the ends, an arrow on the closed trigger opens the popup and
// highlights the first or last item, the cross-axis arrow opens and closes
// a nested list (a submenu), and the pointer highlights the item under it.
// The highlighted item takes focus, or with `virtual` stays a highlight
// (`aria-activedescendant`). Grid navigation is not ported (no part here
// uses it).
import { isHTMLElement } from '@floating-ui/utils/dom';
import { type Accessor, createEffect, untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { HTMLProps } from '../../internals/types.ts';
import { ownerDocument } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import { useAnimationFrame } from '../../utils/timers.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import {
  type FloatingTreeStore,
  useFloatingParentNodeId,
  useFloatingTree,
} from '../FloatingTree.tsx';
import {
  getMaxListIndex,
  getMinListIndex,
  getNextListIndex,
  isIndexOutOfListBounds,
} from '../utils/composite.ts';
import {
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  activeElement,
  contains,
  getFloatingFocusElement,
  getTarget,
  isTypeableCombobox,
  isTypeableElement,
} from '../utils/element.ts';
import { enqueueFocus, isVirtualClick, isVirtualPointerEvent, stopEvent } from '../utils/event.ts';

export type ListNavigationSource = 'imperative';

export type HighlightItemTarget = 'next' | 'previous' | 'first' | 'last' | 'none';

export type ListOrientation = 'vertical' | 'horizontal' | 'both';

export interface UseListNavigationReturn {
  reference: HTMLProps;
  floating: HTMLProps;
  item: HTMLProps;
  trigger: HTMLProps;
  /** Moves the highlight from code (a filter input's arrow keys, a command's "first"). */
  highlightItem: (target: HighlightItemTarget) => void;
}

function isStationaryWebKitPointer(event: MouseEvent | PointerEvent) {
  return platform.engine.webkit && event.movementX === 0 && event.movementY === 0;
}

function doSwitch(
  orientation: ListOrientation | undefined,
  vertical: boolean,
  horizontal: boolean,
) {
  switch (orientation) {
    case 'vertical':
      return vertical;
    case 'horizontal':
      return horizontal;
    default:
      return vertical || horizontal;
  }
}

export function isMainOrientationKey(key: string, orientation: ListOrientation | undefined) {
  const vertical = key === ARROW_UP || key === ARROW_DOWN;
  const horizontal = key === ARROW_LEFT || key === ARROW_RIGHT;
  return doSwitch(orientation, vertical, horizontal);
}

export function isMainOrientationToEndKey(
  key: string,
  orientation: ListOrientation | undefined,
  rtl: boolean,
) {
  const vertical = key === ARROW_DOWN;
  const horizontal = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  return (
    doSwitch(orientation, vertical, horizontal) || key === 'Enter' || key === ' ' || key === ''
  );
}

export function isCrossOrientationOpenKey(
  key: string,
  orientation: ListOrientation | undefined,
  rtl: boolean,
) {
  const vertical = rtl ? key === ARROW_LEFT : key === ARROW_RIGHT;
  const horizontal = key === ARROW_DOWN;
  return doSwitch(orientation, vertical, horizontal);
}

export function isCrossOrientationCloseKey(
  key: string,
  orientation: ListOrientation | undefined,
  rtl: boolean,
) {
  const vertical = rtl ? key === ARROW_RIGHT : key === ARROW_LEFT;
  const horizontal = key === ARROW_UP;
  if (orientation === 'both') {
    return key === 'Escape';
  }
  return doSwitch(orientation, vertical, horizontal);
}

export interface UseListNavigationProps {
  /** The items in DOM order; the list owner keeps it current. */
  listRef: { current: Array<HTMLElement | null> };
  /** The highlighted index (`null` for none). Read live. */
  activeIndex: number | null;
  /** Called when navigation moves the highlight. */
  onNavigate?:
    | ((
        activeIndex: number | null,
        event: Event | undefined,
        source?: ListNavigationSource | undefined,
      ) => void)
    | undefined;
  enabled?: boolean | undefined;
  /** The selected item, highlighted when the list opens. */
  selectedIndex?: number | null | undefined;
  /** Whether opening highlights an item; `auto` does for keyboard and virtual opens. */
  focusItemOnOpen?: boolean | 'auto' | undefined;
  focusItemOnHover?: boolean | undefined;
  openOnArrowKeyDown?: boolean | undefined;
  disabledIndices?: ReadonlyArray<number> | ((index: number) => boolean) | undefined;
  allowEscape?: boolean | undefined;
  loopFocus?: boolean | undefined;
  /** Whether the list is nested in a parent list (a submenu). */
  nested?: boolean | undefined;
  parentOrientation?: ListOrientation | undefined;
  rtl?: boolean | undefined;
  virtual?: boolean | undefined;
  orientation?: ListOrientation | undefined;
  triggerOrientation?: ListOrientation | undefined;
  id?: string | undefined;
  resetOnPointerLeave?: boolean | undefined;
  externalTree?: FloatingTreeStore | undefined;
  /** Where focus returns when a nested list closes from the keyboard. */
  nestedReturnFocusRef?: { current: HTMLElement | null } | undefined;
}

export function useListNavigation(
  context: FloatingRootContext,
  props: UseListNavigationProps,
): UseListNavigationReturn {
  const listRef = props.listRef;
  const enabled = () => props.enabled ?? true;
  const activeIndex = () => props.activeIndex;
  const selectedIndex = () => props.selectedIndex ?? null;
  const loopFocus = () => props.loopFocus ?? false;
  const nested = () => props.nested ?? false;
  const rtl = () => props.rtl ?? false;
  const virtual = () => props.virtual ?? false;
  const focusItemOnOpen = () => props.focusItemOnOpen ?? 'auto';
  const focusItemOnHover = () => props.focusItemOnHover ?? true;
  const openOnArrowKeyDown = () => props.openOnArrowKeyDown ?? true;
  const orientation = () => props.orientation ?? 'vertical';
  const triggerOrientation = () => props.triggerOrientation ?? orientation();
  const resetOnPointerLeave = () => props.resetOnPointerLeave ?? true;

  const dataRef = context.dataRef;
  const floatingFocusElement: Accessor<HTMLElement | null> = () =>
    getFloatingFocusElement(untrack(context.floatingElement));
  const isTypeableComboboxReference = () =>
    isTypeableCombobox(untrack(context.domReferenceElement));

  const parentId = useFloatingParentNodeId();
  const tree = useFloatingTree(props.externalTree);

  let focusItemOnOpenValue = untrack(focusItemOnOpen);
  let index = untrack(selectedIndex) ?? -1;
  let key: string | null = null;
  let isPointerModality = true;
  let previousMounted = !!untrack(context.floatingElement);
  let previousOpen = untrack(context.open);
  let forceSyncFocus = false;
  let forceScrollIntoView = false;
  let cancelQueuedFocus: (() => void) | null = null;

  const onNavigate = (event?: Event, source?: ListNavigationSource) => {
    props.onNavigate?.(index === -1 ? null : index, event, source);
  };

  const focusFrame = useAnimationFrame();
  const waitForListPopulatedFrame = useAnimationFrame();

  const focusItem = () => {
    focusFrame.cancel();

    const runFocus = (item: HTMLElement) => {
      if (!untrack(virtual)) {
        cancelQueuedFocus = enqueueFocus(item, { sync: forceSyncFocus, preventScroll: true });
      }
    };

    const initialItem = listRef.current[index];
    const scrollIntoView = forceScrollIntoView;

    if (initialItem) {
      runFocus(initialItem);
    }

    const scheduler = forceSyncFocus
      ? (callback: () => void) => callback()
      : (callback: () => void) => focusFrame.request(callback);

    scheduler(() => {
      const waitedItem = listRef.current[index] || initialItem;
      if (!waitedItem) {
        return;
      }
      if (!initialItem) {
        runFocus(waitedItem);
      }
      if (scrollIntoView || !isPointerModality) {
        waitedItem.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
    });
  };

  createEffect(orientation, (value) => {
    dataRef.current['orientation'] = value;
  });

  createEffect(
    () => [context.open(), focusItemOnOpen()] as const,
    ([open, focusOnOpen]) => {
      if (!open) {
        key = null;
      }
      if (!open || focusOnOpen !== 'auto') {
        focusItemOnOpenValue = focusOnOpen;
      }
    },
  );

  createEffect(
    () => [enabled(), context.open(), context.floatingElement(), selectedIndex()] as const,
    ([isEnabled, open, floating, selected]) => {
      if (!isEnabled) {
        return;
      }
      if (open && floating) {
        index = selected ?? -1;
        if (focusItemOnOpenValue && selected != null) {
          forceScrollIntoView = true;
          onNavigate();
        }
      } else if (previousMounted) {
        index = -1;
        onNavigate();
      }
    },
  );

  createEffect(
    () => [enabled(), context.open(), context.floatingElement(), activeIndex()] as const,
    ([isEnabled, open, floating, active]) => {
      if (!isEnabled) {
        return;
      }
      if (!open) {
        forceSyncFocus = false;
        return;
      }
      if (!floating) {
        return;
      }

      if (active == null) {
        forceSyncFocus = false;

        if (untrack(selectedIndex) != null) {
          return;
        }

        if (previousMounted) {
          index = -1;
          focusItem();
        }

        if (
          (!previousOpen || !previousMounted) &&
          focusItemOnOpenValue &&
          (key != null || (focusItemOnOpenValue === true && key == null))
        ) {
          let runs = 0;
          const waitForListPopulated = () => {
            if (listRef.current[0] == null) {
              // The items may register a frame after the popup mounts.
              if (runs < 2) {
                const scheduler = runs
                  ? (callback: () => void) => waitForListPopulatedFrame.request(callback)
                  : queueMicrotask;
                scheduler(waitForListPopulated);
              }
              runs += 1;
            } else {
              index =
                key == null ||
                isMainOrientationToEndKey(key, untrack(triggerOrientation), untrack(rtl)) ||
                untrack(nested)
                  ? getMinListIndex(listRef.current)
                  : getMaxListIndex(listRef.current);
              key = null;
              onNavigate();
            }
          };
          waitForListPopulated();
        }
      } else if (!isIndexOutOfListBounds(listRef.current, active)) {
        index = active;
        focusItem();
        forceScrollIntoView = false;
      }
    },
  );

  // A nested list that closed by pointer hands focus back to its parent popup.
  createEffect(
    () => [enabled(), context.floatingElement(), context.domReferenceElement()] as const,
    ([isEnabled, floating, domReference]) => {
      if (!isEnabled || floating || !tree || untrack(virtual) || !previousMounted) {
        return;
      }
      const nodes = tree.nodesRef.current;
      const parent = nodes.find((node) => node.id === parentId)?.context?.elements.floating;
      const activeEl = activeElement(ownerDocument(domReference ?? parent ?? null));
      const treeContainsActiveEl = nodes.some(
        (node) => node.context && contains(node.context.elements.floating, activeEl),
      );
      if (parent && !treeContainsActiveEl && isPointerModality) {
        parent.focus({ preventScroll: true });
      }
    },
  );

  createEffect(
    () => [context.open(), context.floatingElement()] as const,
    ([open, floating]) => {
      previousOpen = open;
      previousMounted = !!floating;
    },
  );

  const syncCurrentTarget = (event: Event) => {
    if (!untrack(enabled) || !untrack(context.open)) {
      return;
    }
    const itemIndex = listRef.current.indexOf(event.currentTarget as HTMLElement);
    if (itemIndex !== -1 && (index !== itemIndex || untrack(activeIndex) !== itemIndex)) {
      index = itemIndex;
      onNavigate(event);
    }
  };

  const getParentOrientation = (): ListOrientation | undefined =>
    props.parentOrientation ??
    (tree?.nodesRef.current.find((node) => node.id === parentId)?.context?.dataRef?.current[
      'orientation'
    ] as ListOrientation | undefined);

  const commonOnKeyDown = (event: KeyboardEvent) => {
    isPointerModality = false;
    forceSyncFocus = true;

    // An IME composition's keys are not navigation.
    if (event.isComposing || event.keyCode === 229) {
      return;
    }

    if (!untrack(context.open) && event.currentTarget === floatingFocusElement()) {
      return;
    }

    const currentOrientation = untrack(orientation);
    const isRtl = untrack(rtl);

    if (untrack(nested) && isCrossOrientationCloseKey(event.key, currentOrientation, isRtl)) {
      if (!isMainOrientationKey(event.key, getParentOrientation())) {
        stopEvent(event);
      }
      context.setOpen(false, createChangeEventDetails(REASONS.listNavigation, event));
      const returnElement =
        props.nestedReturnFocusRef?.current ?? untrack(context.domReferenceElement);
      if (isHTMLElement(returnElement)) {
        returnElement.focus();
      }
      return;
    }

    const active = untrack(activeIndex);
    if (active != null && active !== index && !isIndexOutOfListBounds(listRef.current, active)) {
      index = active;
    }

    const currentIndex = index;
    const disabledIndices = props.disabledIndices;
    const minIndex = getMinListIndex(listRef.current, disabledIndices);
    const maxIndex = getMaxListIndex(listRef.current, disabledIndices);

    if (!isTypeableComboboxReference()) {
      if (event.key === 'Home') {
        stopEvent(event);
        index = minIndex;
        onNavigate(event);
      }
      if (event.key === 'End') {
        stopEvent(event);
        index = maxIndex;
        onNavigate(event);
      }
    }

    if (isMainOrientationKey(event.key, currentOrientation)) {
      stopEvent(event);

      const currentTarget = event.currentTarget as Element;
      const focusedElement = activeElement(currentTarget.ownerDocument);
      if (
        untrack(context.open) &&
        !untrack(virtual) &&
        contains(currentTarget, focusedElement) &&
        !listRef.current.some((item) => item != null && contains(item, focusedElement))
      ) {
        index = isMainOrientationToEndKey(event.key, currentOrientation, isRtl)
          ? minIndex
          : maxIndex;
        onNavigate(event);
        return;
      }

      const next = getNextListIndex(listRef.current, currentIndex, {
        decrement: !isMainOrientationToEndKey(event.key, currentOrientation, isRtl),
        loopFocus: untrack(loopFocus),
        allowEscape: props.allowEscape ?? false,
        disabledIndices,
        minIndex,
        maxIndex,
      });
      if (next.wrapped) {
        forceSyncFocus = false;
      }
      index = next.index;
      onNavigate(event);
    }
  };

  const highlightItem = (target: HighlightItemTarget) => {
    if (!untrack(enabled) || !untrack(context.open)) {
      return;
    }
    const list = listRef.current;

    if (target === 'none') {
      cancelQueuedFocus?.();
      cancelQueuedFocus = null;
      index = -1;
      isPointerModality = false;
      forceSyncFocus = false;
      onNavigate(undefined, 'imperative');
      if (!untrack(virtual)) {
        const floatingFocusEl = floatingFocusElement();
        const activeEl = activeElement(ownerDocument(floatingFocusEl));
        if (floatingFocusEl && list.some((item) => item && contains(item, activeEl))) {
          floatingFocusEl.focus({ preventScroll: true });
        }
      }
      return;
    }

    if (list.length === 0) {
      return;
    }

    const disabled = props.disabledIndices;
    const minIndex = getMinListIndex(list, disabled);
    const maxIndex = getMaxListIndex(list, disabled);
    const decrement = target === 'previous';

    let nextIndex: number;
    if (target === 'first') {
      nextIndex = minIndex;
    } else if (target === 'last') {
      nextIndex = maxIndex;
    } else if (isIndexOutOfListBounds(list, index)) {
      nextIndex = decrement ? maxIndex : minIndex;
    } else {
      nextIndex = getNextListIndex(list, index, {
        decrement,
        loopFocus: untrack(loopFocus),
        allowEscape: false,
        disabledIndices: disabled,
        minIndex,
        maxIndex,
      }).index;
    }

    if (isIndexOutOfListBounds(list, nextIndex)) {
      return;
    }

    index = nextIndex;
    isPointerModality = false;
    forceSyncFocus = false;
    forceScrollIntoView = true;
    onNavigate(undefined, 'imperative');
  };

  const item: HTMLProps = {
    onFocus(event: FocusEvent) {
      forceSyncFocus = true;
      syncCurrentTarget(event);
    },
    onClick(event: MouseEvent) {
      if (!untrack(virtual)) {
        (event.currentTarget as HTMLElement).focus({ preventScroll: true });
      }
    },
    onMouseMove(event: MouseEvent) {
      if (isStationaryWebKitPointer(event)) {
        return;
      }
      forceSyncFocus = true;
      forceScrollIntoView = false;
      if (untrack(focusItemOnHover)) {
        syncCurrentTarget(event);
      }
    },
    onPointerLeave(event: PointerEvent) {
      if (!untrack(context.open) || !isPointerModality || event.pointerType === 'touch') {
        return;
      }
      forceSyncFocus = true;
      const relatedTarget = event.relatedTarget as HTMLElement | null;
      if (!untrack(focusItemOnHover) || listRef.current.includes(relatedTarget)) {
        return;
      }
      if (!untrack(resetOnPointerLeave)) {
        return;
      }
      cancelQueuedFocus?.();
      cancelQueuedFocus = null;
      index = -1;
      onNavigate(event);
      if (!untrack(virtual)) {
        const floatingFocusEl = floatingFocusElement();
        const activeEl = activeElement(ownerDocument(floatingFocusEl));
        if (floatingFocusEl && contains(floatingFocusEl, activeEl)) {
          floatingFocusEl.focus({ preventScroll: true });
        }
      }
    },
  };

  const activeDescendant = () => {
    const active = activeIndex();
    return virtual() && context.open() && active != null ? `${props.id}-${active}` : undefined;
  };

  const floating: HTMLProps = {
    get 'aria-activedescendant'() {
      return isTypeableComboboxReference() ? undefined : activeDescendant();
    },
    onKeyDown(event: KeyboardEvent) {
      if (!untrack(enabled)) {
        return;
      }
      if (event.key === 'Tab' && event.shiftKey && untrack(context.open) && !untrack(virtual)) {
        const target = getTarget(event) as Element | null;
        if (target && !contains(floatingFocusElement(), target)) {
          return;
        }
        stopEvent(event);
        const details = createChangeEventDetails(REASONS.focusOut, event);
        context.setOpen(false, details);
        const returnElement =
          props.nestedReturnFocusRef?.current ?? untrack(context.domReferenceElement);
        if (!details.isCanceled && isHTMLElement(returnElement)) {
          returnElement.focus();
        }
        return;
      }
      commonOnKeyDown(event);
    },
    onPointerMove(event: PointerEvent) {
      if (isStationaryWebKitPointer(event)) {
        return;
      }
      isPointerModality = true;
    },
  };

  const openOnNavigationKeyDown = (event: KeyboardEvent) => {
    context.setOpen(
      true,
      createChangeEventDetails(REASONS.listNavigation, event, event.currentTarget as HTMLElement),
    );
  };

  const checkVirtualMouse = (event: MouseEvent) => {
    if (untrack(focusItemOnOpen) === 'auto' && isVirtualClick(event)) {
      focusItemOnOpenValue = !untrack(virtual);
    }
  };

  const checkVirtualPointer = (event: PointerEvent) => {
    focusItemOnOpenValue = untrack(focusItemOnOpen);
    if (untrack(focusItemOnOpen) === 'auto' && isVirtualPointerEvent(event)) {
      focusItemOnOpenValue = true;
    }
  };

  const trigger: HTMLProps = {
    onKeyDown(event: KeyboardEvent) {
      if (!untrack(enabled)) {
        return;
      }
      const currentOpen = untrack(context.open);
      isPointerModality = false;
      const isRtl = untrack(rtl);
      const isNested = untrack(nested);

      const isArrowKey = event.key.startsWith('Arrow');
      const isParentCrossOpenKey = isCrossOrientationOpenKey(
        event.key,
        getParentOrientation(),
        isRtl,
      );
      const isMainKey = isMainOrientationKey(
        event.key,
        currentOpen ? untrack(orientation) : untrack(triggerOrientation),
      );
      const isNavigationKey =
        (isNested ? isParentCrossOpenKey : isMainKey) ||
        event.key === 'Enter' ||
        event.key.trim() === '';

      if (
        untrack(virtual) &&
        currentOpen &&
        (!isNested || isTypeableElement(event.currentTarget))
      ) {
        commonOnKeyDown(event);
        return;
      }

      if (!currentOpen && !untrack(openOnArrowKeyDown) && isArrowKey) {
        return;
      }

      if (isNavigationKey) {
        const isParentMainKey = isMainOrientationKey(event.key, getParentOrientation());
        key = isNested && isParentMainKey ? null : event.key;
      }

      if (isNested) {
        if (isParentCrossOpenKey) {
          stopEvent(event);
          if (currentOpen) {
            index = getMinListIndex(listRef.current, props.disabledIndices);
            onNavigate(event);
            if (untrack(virtual)) {
              floatingFocusElement()?.focus();
            }
          } else {
            openOnNavigationKeyDown(event);
          }
        }
        return;
      }

      if (isMainKey) {
        const selected = untrack(selectedIndex);
        if (selected != null) {
          index = selected;
        }
        stopEvent(event);
        if (!currentOpen && untrack(openOnArrowKeyDown)) {
          openOnNavigationKeyDown(event);
        } else {
          commonOnKeyDown(event);
        }
        if (currentOpen) {
          onNavigate(event);
        }
      }
    },
    onFocus(event: FocusEvent) {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (untrack(enabled) && untrack(context.open) && !untrack(virtual)) {
        index = -1;
        onNavigate(event);
      }
    },
    onPointerDown: checkVirtualPointer,
    onPointerEnter: checkVirtualPointer,
    onMouseDown: checkVirtualMouse,
    onClick: checkVirtualMouse,
  };

  const reference: HTMLProps = {
    get 'aria-activedescendant'() {
      return activeDescendant();
    },
    ...trigger,
  };

  return { reference, floating, item, trigger, highlightItem };
}
