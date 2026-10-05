// Upstream: packages/react/src/internals/composite/root/useCompositeRoot.ts
//
// The roving tab stop of a composite widget. One item (the highlighted one)
// has `tabindex="0"`, the rest `-1`; arrow keys along the orientation (swapped
// in right-to-left), and Home/End when enabled, move it and focus the new
// item, and the keydown stops there. Disabled items (by the DOM) are skipped,
// and a key held with a modifier is left alone. Inside a text input the arrows
// move the caret until it reaches the end the key points past. When the items
// change, the tab stop follows its item, or falls back to an enabled one when
// its item is gone.
import { createSignal, untrack } from 'solid-js';

import { useDirectionAccessor } from '../DirectionContext.ts';
import { getTarget } from '../../utils/dom.ts';
import type { HTMLProps } from '../types.ts';
import {
  ACTIVE_COMPOSITE_ITEM,
  COMPOSITE_KEYS,
  END,
  HOME,
  type CompositeOrientation,
  findNonDisabledListIndex,
  getCompositeNavigationIndex,
  getFallbackIndex,
  getNavigationKeys,
  hasModifierKey,
  isElementDisabled,
  isIndexOutOfListBounds,
  isListIndexDisabled,
  isNativeInput,
  scrollIntoViewIfNeeded,
} from './composite.ts';
import type { CompositeMetadata } from './CompositeList.tsx';

export interface UseCompositeRootParameters {
  /** @default 'both' */
  orientation?: CompositeOrientation | undefined;
  /** Whether arrowing past an end wraps to the other. @default true */
  loopFocus?: boolean | undefined;
  /** Whether Home and End move to the first and last item. @default false */
  enableHomeAndEndKeys?: boolean | undefined;
}

export interface UseCompositeRootReturnValue {
  /** The root element's props: its ref, keydown and focus handling. */
  props: HTMLProps;
  highlightedIndex: () => number;
  onHighlightedIndexChange: (index: number, shouldScrollIntoView?: boolean) => void;
  /** The items' elements by index, kept by the `CompositeList` the root renders. */
  elementsRef: { current: Array<HTMLElement | null> };
  /** Pass to the `CompositeList`'s `onMapChange`. */
  onMapChange: (map: Map<Element, CompositeMetadata<unknown>>) => void;
}

export function useCompositeRoot(
  params: UseCompositeRootParameters = {},
): UseCompositeRootReturnValue {
  const direction = useDirectionAccessor();
  const [highlightedIndex, setHighlightedIndex] = createSignal(0, { ownedWrite: true });
  const elementsRef: { current: Array<HTMLElement | null> } = { current: [] };
  let rootElement: HTMLElement | null = null;
  let hasSetDefaultIndex = false;
  let highlightedElement: HTMLElement | null = null;

  const orientation = () => params.orientation ?? 'both';

  const onHighlightedIndexChange = (index: number, shouldScrollIntoView = false) => {
    highlightedElement = elementsRef.current[index] ?? null;
    setHighlightedIndex(index);
    if (shouldScrollIntoView) {
      untrack(() =>
        scrollIntoViewIfNeeded(
          rootElement,
          elementsRef.current[index] ?? null,
          direction(),
          orientation(),
        ),
      );
    }
  };

  const onMapChange = (map: Map<Element, CompositeMetadata<unknown>>) => {
    if (map.size === 0) {
      return;
    }
    untrack(() => {
      const current = highlightedIndex();

      if (hasSetDefaultIndex) {
        const elements = elementsRef.current;
        // Items added or removed around the highlighted one shift its index;
        // the tab stop follows its element.
        const nextIndex = highlightedElement ? elements.indexOf(highlightedElement) : -1;
        if (nextIndex === -1) {
          // A replacement at the same index keeps the tab stop, unless it cannot take focus.
          const replacement = elements[current];
          if (!replacement || isListIndexDisabled(elements, current)) {
            onHighlightedIndexChange(getFallbackIndex(elements));
          } else {
            highlightedElement = replacement;
          }
        } else if (nextIndex !== current) {
          onHighlightedIndexChange(nextIndex);
        }
        return;
      }

      hasSetDefaultIndex = true;
      const sortedElements = Array.from(map.keys()) as Array<HTMLElement | null>;
      const activeItem =
        sortedElements.find((element) => element?.hasAttribute(ACTIVE_COMPOSITE_ITEM)) ?? null;
      const activeIndex = activeItem ? (map.get(activeItem)?.index ?? -1) : -1;

      if (activeIndex !== -1) {
        onHighlightedIndexChange(activeIndex);
      } else {
        highlightedElement = elementsRef.current[current] ?? null;
        if (isListIndexDisabled(sortedElements, current)) {
          // A disabled item should not be the composite's entry point.
          const firstEnabledIndex = findNonDisabledListIndex(sortedElements);
          if (!isIndexOutOfListBounds(sortedElements, firstEnabledIndex)) {
            onHighlightedIndexChange(firstEnabledIndex);
          }
        }
      }

      scrollIntoViewIfNeeded(rootElement, activeItem, direction(), orientation());
    });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    untrack(() => {
      const enableHomeAndEndKeys = params.enableHomeAndEndKeys ?? false;
      const isHomeOrEnd = event.key === HOME || event.key === END;
      if (!COMPOSITE_KEYS.has(event.key) || (!enableHomeAndEndKeys && isHomeOrEnd)) {
        return;
      }
      if (hasModifierKey(event) || !rootElement) {
        return;
      }

      const keys = getNavigationKeys(orientation(), direction());
      const target = getTarget(event);
      if (target != null && isNativeInput(target) && !isElementDisabled(target)) {
        const { selectionStart, selectionEnd, value } = target;
        // The caret's own keys: Shift selecting, an existing selection, or room to move.
        if (selectionStart == null || event.shiftKey || selectionStart !== selectionEnd) {
          return;
        }
        if (event.key !== keys.backward && selectionStart < value.length) {
          return;
        }
        if (event.key !== keys.forward && selectionStart > 0) {
          return;
        }
      }

      const current = highlightedIndex();
      const { index: nextIndex, handled } = getCompositeNavigationIndex({
        key: event.key,
        highlightedIndex: current,
        elements: elementsRef.current,
        orientation: orientation(),
        direction: direction(),
        loopFocus: params.loopFocus ?? true,
        enableHomeAndEndKeys,
      });

      if (nextIndex === current || isIndexOutOfListBounds(elementsRef.current, nextIndex)) {
        return;
      }
      event.stopPropagation();
      if (handled) {
        event.preventDefault();
      }
      onHighlightedIndexChange(nextIndex, true);
      // After any focus manager's own focus return.
      queueMicrotask(() => {
        elementsRef.current[nextIndex]?.focus();
      });
    });
  };

  const props: HTMLProps = {
    ref(element: HTMLElement | null) {
      rootElement = element;
    },
    // Focus entering a text input selects its text, as tabbing into one does.
    onFocusIn(event: FocusEvent) {
      const target = getTarget(event);
      if (!rootElement || target == null || !isNativeInput(target)) {
        return;
      }
      target.setSelectionRange(0, target.value.length);
    },
    onKeyDown,
  };

  return {
    props,
    highlightedIndex,
    onHighlightedIndexChange,
    elementsRef,
    onMapChange,
  };
}
