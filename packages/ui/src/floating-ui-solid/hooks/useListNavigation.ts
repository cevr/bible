// Upstream: packages/react/src/floating-ui-react/hooks/useListNavigation.ts
//
// Arrow-key navigation over a menu's vertical list of items: ArrowUp and
// ArrowDown move the highlight (skipping hidden and `:disabled` items,
// wrapping at the ends), Home/End jump to the ends, an arrow on the closed
// trigger opens the popup and highlights the first or last item, ArrowLeft
// closes a nested list (a context menu is one, as upstream marks it), and
// the pointer highlights the item under it. The highlighted item takes
// focus. Upstream's virtual focus (`aria-activedescendant`), selected index,
// horizontal lists, combobox, escape-to-none and grid modes are left out:
// Menu, the one caller, uses none of them.
import { isHTMLElement } from '@floating-ui/utils/dom';
import { type Accessor, createEffect, untrack } from 'solid-js';

import { createChangeEventDetails } from '../../internals/createBaseUIEventDetails.ts';
import { REASONS } from '../../internals/reasons.ts';
import type { HTMLProps } from '../../internals/types.ts';
import { activeElement, contains, getTarget, ownerDocument } from '../../utils/dom.ts';
import { platform } from '../../utils/platform.ts';
import { useAnimationFrame } from '../../utils/timers.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import {
  findNonDisabledListIndex,
  getMaxListIndex,
  getMinListIndex,
  isIndexOutOfListBounds,
} from '../utils/composite.ts';
import {
  ARROW_DOWN,
  ARROW_LEFT,
  ARROW_RIGHT,
  ARROW_UP,
  getFloatingFocusElement,
} from '../utils/element.ts';
import { enqueueFocus, isVirtualClick, isVirtualPointerEvent, stopEvent } from '../utils/event.ts';

interface UseListNavigationReturn {
  floating: HTMLProps;
  item: HTMLProps;
  trigger: HTMLProps;
}

function isStationaryWebKitPointer(event: MouseEvent | PointerEvent) {
  return platform.engine.webkit && event.movementX === 0 && event.movementY === 0;
}

/** Whether `key` moves along the list. */
function isListKey(key: string) {
  return key === ARROW_UP || key === ARROW_DOWN;
}

/** Whether `key` moves toward the list's end (or, opening it, starts at the first item). */
function isToEndKey(key: string) {
  return key === ARROW_DOWN || key === 'Enter' || key === ' ' || key === '';
}

interface UseListNavigationProps {
  /** The items in DOM order; the list owner keeps it current. */
  listRef: { current: Array<HTMLElement | null> };
  /** The highlighted index (`null` for none). Read live. */
  activeIndex: number | null;
  /** Called when navigation moves the highlight. */
  onNavigate?: ((activeIndex: number | null, event: Event | undefined) => void) | undefined;
  openOnArrowKeyDown?: boolean | undefined;
  /** Whether the list is nested (upstream's submenu; here a context menu, as upstream marks it). */
  nested?: boolean | undefined;
}

export function useListNavigation(
  context: FloatingRootContext,
  props: UseListNavigationProps,
): UseListNavigationReturn {
  const listRef = props.listRef;
  const activeIndex = () => props.activeIndex;
  const nested = () => props.nested ?? false;
  const openOnArrowKeyDown = () => props.openOnArrowKeyDown ?? true;

  const floatingFocusElement: Accessor<HTMLElement | null> = () =>
    getFloatingFocusElement(untrack(context.floatingElement));

  // Whether opening highlights an item: `auto` does for a keyboard open (a
  // key is pending), `true` for a virtual (screen reader) click or pointer.
  let focusItemOnOpen: boolean | 'auto' = 'auto';
  let index = -1;
  let key: string | null = null;
  let isPointerModality = true;
  let previousMounted = !!untrack(context.floatingElement);
  let previousOpen = untrack(context.open);
  let forceSyncFocus = false;
  let forceScrollIntoView = false;
  let cancelQueuedFocus: (() => void) | null = null;

  const onNavigate = (event?: Event) => {
    props.onNavigate?.(index === -1 ? null : index, event);
  };

  const focusFrame = useAnimationFrame();
  const waitForListPopulatedFrame = useAnimationFrame();

  const focusItem = () => {
    focusFrame.cancel();

    const runFocus = (item: HTMLElement) => {
      cancelQueuedFocus = enqueueFocus(item, { sync: forceSyncFocus, preventScroll: true });
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

  createEffect(context.open, (open) => {
    if (!open) {
      key = null;
      focusItemOnOpen = 'auto';
    }
  });

  createEffect(
    () => [context.open(), context.floatingElement()] as const,
    ([open, floating]) => {
      if (open && floating) {
        index = -1;
      } else if (previousMounted) {
        index = -1;
        onNavigate();
      }
    },
  );

  createEffect(
    () => [context.open(), context.floatingElement(), activeIndex()] as const,
    ([open, floating, active]) => {
      if (!open) {
        forceSyncFocus = false;
        return;
      }
      if (!floating) {
        return;
      }

      if (active == null) {
        forceSyncFocus = false;

        if (previousMounted) {
          index = -1;
          focusItem();
        }

        if (
          (!previousOpen || !previousMounted) &&
          focusItemOnOpen &&
          (key != null || (focusItemOnOpen === true && key == null))
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
                key == null || isToEndKey(key) || untrack(nested)
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

  createEffect(
    () => [context.open(), context.floatingElement()] as const,
    ([open, floating]) => {
      previousOpen = open;
      previousMounted = !!floating;
    },
  );

  const syncCurrentTarget = (event: Event) => {
    if (!untrack(context.open)) {
      return;
    }
    const itemIndex = listRef.current.indexOf(event.currentTarget as HTMLElement);
    if (itemIndex !== -1 && (index !== itemIndex || untrack(activeIndex) !== itemIndex)) {
      index = itemIndex;
      onNavigate(event);
    }
  };

  const returnFocusToTrigger = () => {
    const returnElement = untrack(context.domReferenceElement);
    if (isHTMLElement(returnElement)) {
      returnElement.focus();
    }
  };

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

    if (untrack(nested) && event.key === ARROW_LEFT) {
      // No list sits in a parent list, so the arrow is left to the page.
      context.setOpen(false, createChangeEventDetails(REASONS.listNavigation, event));
      returnFocusToTrigger();
      return;
    }

    const active = untrack(activeIndex);
    if (active != null && active !== index && !isIndexOutOfListBounds(listRef.current, active)) {
      index = active;
    }

    const currentIndex = index;
    const minIndex = getMinListIndex(listRef.current);
    const maxIndex = getMaxListIndex(listRef.current);

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

    if (isListKey(event.key)) {
      stopEvent(event);

      const currentTarget = event.currentTarget as Element;
      const focusedElement = activeElement(currentTarget.ownerDocument);
      if (
        untrack(context.open) &&
        contains(currentTarget, focusedElement) &&
        !listRef.current.some((item) => item != null && contains(item, focusedElement))
      ) {
        index = isToEndKey(event.key) ? minIndex : maxIndex;
        onNavigate(event);
        return;
      }

      // Past either end the highlight wraps to the other.
      const decrement = event.key === ARROW_UP;
      const wraps = decrement ? currentIndex <= minIndex : currentIndex >= maxIndex;
      if (wraps) {
        forceSyncFocus = false;
        index = decrement ? maxIndex : minIndex;
      } else {
        index = findNonDisabledListIndex(listRef.current, {
          startingIndex: currentIndex,
          decrement,
        });
      }
      if (isIndexOutOfListBounds(listRef.current, index)) {
        index = -1;
      }
      onNavigate(event);
    }
  };

  const item: HTMLProps = {
    onFocus(event: FocusEvent) {
      forceSyncFocus = true;
      syncCurrentTarget(event);
    },
    onClick(event: MouseEvent) {
      (event.currentTarget as HTMLElement).focus({ preventScroll: true });
    },
    onMouseMove(event: MouseEvent) {
      if (isStationaryWebKitPointer(event)) {
        return;
      }
      forceSyncFocus = true;
      forceScrollIntoView = false;
      syncCurrentTarget(event);
    },
    onPointerLeave(event: PointerEvent) {
      if (!untrack(context.open) || !isPointerModality || event.pointerType === 'touch') {
        return;
      }
      forceSyncFocus = true;
      const relatedTarget = event.relatedTarget as HTMLElement | null;
      if (listRef.current.includes(relatedTarget)) {
        return;
      }
      cancelQueuedFocus?.();
      cancelQueuedFocus = null;
      index = -1;
      onNavigate(event);
      const floatingFocusEl = floatingFocusElement();
      const activeEl = activeElement(ownerDocument(floatingFocusEl));
      if (floatingFocusEl && contains(floatingFocusEl, activeEl)) {
        floatingFocusEl.focus({ preventScroll: true });
      }
    },
  };

  const floating: HTMLProps = {
    onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Tab' && event.shiftKey && untrack(context.open)) {
        const target = getTarget(event) as Element | null;
        if (target && !contains(floatingFocusElement(), target)) {
          return;
        }
        stopEvent(event);
        const details = createChangeEventDetails(REASONS.focusOut, event);
        context.setOpen(false, details);
        if (!details.isCanceled) {
          returnFocusToTrigger();
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
    if (isVirtualClick(event)) {
      focusItemOnOpen = true;
    }
  };

  const checkVirtualPointer = (event: PointerEvent) => {
    focusItemOnOpen = isVirtualPointerEvent(event) ? true : 'auto';
  };

  const trigger: HTMLProps = {
    onKeyDown(event: KeyboardEvent) {
      const currentOpen = untrack(context.open);
      isPointerModality = false;
      const isNested = untrack(nested);

      const isArrowKey = event.key.startsWith('Arrow');
      // A nested list has no parent list, so either arrow axis opens it.
      const isParentCrossOpenKey = event.key === ARROW_RIGHT || event.key === ARROW_DOWN;
      const isMainKey = isListKey(event.key);
      const isNavigationKey =
        (isNested ? isParentCrossOpenKey : isMainKey) ||
        event.key === 'Enter' ||
        event.key.trim() === '';

      if (!currentOpen && !untrack(openOnArrowKeyDown) && isArrowKey) {
        return;
      }

      if (isNavigationKey) {
        key = isNested && isArrowKey ? null : event.key;
      }

      if (isNested) {
        if (isParentCrossOpenKey) {
          stopEvent(event);
          if (currentOpen) {
            index = getMinListIndex(listRef.current);
            onNavigate(event);
          } else {
            openOnNavigationKeyDown(event);
          }
        }
        return;
      }

      if (isMainKey) {
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
      if (untrack(context.open)) {
        index = -1;
        onNavigate(event);
      }
    },
    onPointerDown: checkVirtualPointer,
    onPointerEnter: checkVirtualPointer,
    onMouseDown: checkVirtualMouse,
    onClick: checkVirtualMouse,
  };

  return { floating, item, trigger };
}
