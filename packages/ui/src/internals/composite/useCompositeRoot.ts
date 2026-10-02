// Upstream: packages/react/src/internals/composite/root/useCompositeRoot.ts
//
// The roving tab stop of a composite widget. One item (the highlighted one)
// has `tabindex="0"`, the rest `-1`; arrow keys along the orientation (swapped
// in right-to-left), and Home/End when enabled, move it and focus the new
// item. Disabled items are skipped, either by `disabledIndices` or by the DOM.
// Inside a text input the arrows move the caret until it reaches the end the
// key points past. When the items change, the tab stop follows its item, or
// falls back to an enabled one when its item is gone.
import { createEffect, createSignal, untrack } from 'solid-js';

import { useDirectionAccessor } from '../../direction-provider/DirectionContext.ts';
import { getTarget } from '../../utils/dom.ts';
import type { HTMLProps } from '../types.ts';
import {
  ACTIVE_COMPOSITE_ITEM,
  COMPOSITE_KEYS,
  END,
  HOME,
  type CompositeOrientation,
  type ModifierKey,
  findNonDisabledListIndex,
  getCompositeNavigationIndex,
  getFallbackIndex,
  getNavigationKeys,
  isElementDisabled,
  isIndexOutOfListBounds,
  isListIndexDisabled,
  isModifierKeySet,
  isNativeInput,
  scrollIntoViewIfNeeded,
} from './composite.ts';
import type { CompositeMetadata } from './CompositeList.tsx';

export interface UseCompositeRootParameters {
  /** @default 'both' */
  orientation?: CompositeOrientation | undefined;
  /** Whether arrowing past an end wraps to the other. @default true */
  loopFocus?: boolean | undefined;
  /** Called when a step wraps; returns the index to use instead. */
  onLoop?:
    | ((
        event: KeyboardEvent,
        prevIndex: number,
        nextIndex: number,
        elementsRef: { current: Array<HTMLElement | null> },
      ) => number)
    | undefined;
  /** The owner's highlighted index; the root keeps its own when undefined. */
  highlightedIndex?: number | undefined;
  onHighlightedIndexChange?: ((index: number) => void) | undefined;
  /** Whether Home and End move to the first and last item. @default false */
  enableHomeAndEndKeys?: boolean | undefined;
  /** Whether a navigation keydown the root acts on stops propagating. @default false */
  stopEventPropagation?: boolean | undefined;
  /** The disabled items' indices; when given, the DOM's disabled state is not consulted. */
  disabledIndices?: ReadonlyArray<number> | undefined;
  /** Modifier keys that, held, still let the arrows navigate. @default [] */
  modifierKeys?: ReadonlyArray<ModifierKey> | undefined;
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
  relayKeyboardEvent: (event: KeyboardEvent) => void;
}

const NO_MODIFIERS: ReadonlyArray<ModifierKey> = [];

export function useCompositeRoot(
  params: UseCompositeRootParameters = {},
): UseCompositeRootReturnValue {
  const direction = useDirectionAccessor();
  const [internalHighlightedIndex, setInternalHighlightedIndex] = createSignal(0, {
    ownedWrite: true,
  });
  const elementsRef: { current: Array<HTMLElement | null> } = { current: [] };
  let rootElement: HTMLElement | null = null;
  let hasSetDefaultIndex = false;
  let highlightedElement: HTMLElement | null = null;

  const orientation = () => params.orientation ?? 'both';
  const highlightedIndex = () => params.highlightedIndex ?? internalHighlightedIndex();

  const onHighlightedIndexChange = (index: number, shouldScrollIntoView = false) => {
    highlightedElement = elementsRef.current[index] ?? null;
    const external = untrack(() => params.onHighlightedIndexChange);
    if (external) {
      external(index);
    } else {
      setInternalHighlightedIndex(index);
    }
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
      const disabledIndices = params.disabledIndices;
      const current = highlightedIndex();

      if (hasSetDefaultIndex) {
        const elements = elementsRef.current;
        // Items added or removed around the highlighted one shift its index;
        // the tab stop follows its element.
        const nextIndex = highlightedElement ? elements.indexOf(highlightedElement) : -1;
        if (nextIndex === -1) {
          // A replacement at the same index keeps the tab stop, unless it cannot take focus.
          const replacement = elements[current];
          if (!replacement || isListIndexDisabled(elements, current, disabledIndices)) {
            onHighlightedIndexChange(getFallbackIndex(elements, disabledIndices));
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
      // The item's own index: explicit indexes may leave gaps among the keys.
      const activeIndex = activeItem ? (map.get(activeItem)?.index ?? -1) : -1;

      if (activeIndex !== -1) {
        onHighlightedIndexChange(activeIndex);
      } else {
        highlightedElement = elementsRef.current[current] ?? null;
        if (isListIndexDisabled(sortedElements, current, disabledIndices)) {
          // A disabled item should not be the composite's entry point.
          const firstEnabledIndex = findNonDisabledListIndex(sortedElements, { disabledIndices });
          if (!isIndexOutOfListBounds(sortedElements, firstEnabledIndex)) {
            onHighlightedIndexChange(firstEnabledIndex);
          }
        }
      }

      scrollIntoViewIfNeeded(rootElement, activeItem, direction(), orientation());
    });
  };

  // `disabledIndices` can resolve after the items first register (Toolbar
  // derives it from their metadata), so the default tab stop may now be on a
  // disabled item: move it to the first enabled one.
  createEffect(
    () => [params.disabledIndices, params.highlightedIndex, highlightedIndex()] as const,
    ([disabledIndices, externalIndex, current]) => {
      if (disabledIndices == null || externalIndex != null || !hasSetDefaultIndex) {
        return;
      }
      const elements = elementsRef.current;
      if (isListIndexDisabled(elements, current, disabledIndices)) {
        const firstEnabledIndex = findNonDisabledListIndex(elements, { disabledIndices });
        if (!isIndexOutOfListBounds(elements, firstEnabledIndex)) {
          onHighlightedIndexChange(firstEnabledIndex);
        }
      }
    },
  );

  const onKeyDown = (event: KeyboardEvent) => {
    untrack(() => {
      const enableHomeAndEndKeys = params.enableHomeAndEndKeys ?? false;
      const isHomeOrEnd = event.key === HOME || event.key === END;
      if (!COMPOSITE_KEYS.has(event.key) || (!enableHomeAndEndKeys && isHomeOrEnd)) {
        return;
      }
      if (isModifierKeySet(event, params.modifierKeys ?? NO_MODIFIERS)) {
        return;
      }
      if (!rootElement) {
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
      const onLoop = params.onLoop;
      const { index: nextIndex, handled } = getCompositeNavigationIndex({
        key: event.key,
        highlightedIndex: current,
        elements: elementsRef.current,
        orientation: orientation(),
        direction: direction(),
        loopFocus: params.loopFocus ?? true,
        enableHomeAndEndKeys,
        disabledIndices: params.disabledIndices,
        onLoop: onLoop ? (prev, next) => onLoop(event, prev, next, elementsRef) : undefined,
      });

      if (nextIndex === current || isIndexOutOfListBounds(elementsRef.current, nextIndex)) {
        return;
      }
      if (params.stopEventPropagation) {
        event.stopPropagation();
      }
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
    relayKeyboardEvent: onKeyDown,
  };
}
