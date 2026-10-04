// Upstream: packages/react/src/floating-ui-react/hooks/useTypeahead.ts
//
// Typing letters highlights the next item whose label starts with them.
// Keys typed within `resetMs` of each other build one string; repeating
// a first letter cycles through the items that start with it. Space counts
// as a letter while a string is being typed (so it does not press the item).
import { createEffect, untrack } from 'solid-js';

import type { HTMLProps } from '../../internals/types.ts';
import { EMPTY_ARRAY } from '../../utils/dom.ts';
import { useTimeout } from '../../utils/timers.ts';
import type { FloatingRootContext } from '../FloatingRootContext.ts';
import { type DisabledIndices, isElementVisible, isListIndexDisabled } from '../utils/composite.ts';
import { contains } from '../utils/element.ts';
import { stopEvent } from '../utils/event.ts';

export interface UseTypeaheadProps {
  /** The items' labels, in list order. */
  listRef: { current: Array<string | null> };
  activeIndex: number | null;
  onMatch?: ((index: number, event: KeyboardEvent) => void) | undefined;
  elementsRef?: { current: Array<HTMLElement | null> } | undefined;
  disabledIndices?: DisabledIndices | undefined;
  onTyping?: ((isTyping: boolean) => void) | undefined;
  enabled?: boolean | undefined;
  resetMs?: number | undefined;
  selectedIndex?: number | null | undefined;
}

export function useTypeahead(
  context: FloatingRootContext,
  props: UseTypeaheadProps,
): { reference: HTMLProps; floating: HTMLProps } {
  const timeout = useTimeout();
  let typed = '';
  const selectedIndex = () => props.selectedIndex ?? null;
  let prevIndex: number | null = untrack(selectedIndex) ?? props.activeIndex ?? -1;
  let matchIndex: number | null = null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (!(props.enabled ?? true)) {
      return;
    }

    const getElement = (index: number) => props.elementsRef?.current[index];

    const isItemAvailable = (index: number) => {
      const element = getElement(index);
      if ((element && !isElementVisible(element)) || element?.matches(':disabled')) {
        return false;
      }
      return (
        props.disabledIndices == null ||
        !isListIndexDisabled(EMPTY_ARRAY, index, props.disabledIndices)
      );
    };

    const getMatchingIndex = (list: Array<string | null>, string: string, startIndex = 0) => {
      if (list.length === 0) {
        return -1;
      }
      const normalizedStartIndex = ((startIndex % list.length) + list.length) % list.length;
      const lowerString = string.toLowerCase();
      for (let offset = 0; offset < list.length; offset += 1) {
        const index = (normalizedStartIndex + offset) % list.length;
        const text = list[index];
        if (!text?.toLowerCase().startsWith(lowerString) || !isItemAvailable(index)) {
          continue;
        }
        return index;
      }
      return -1;
    };

    const listContent = props.listRef.current;
    const activeIndex = props.activeIndex;
    const selected = untrack(selectedIndex);

    if (typed.length > 0 && event.key === ' ') {
      stopEvent(event);
      props.onTyping?.(true);
    }

    if (typed.length > 0 && typed[0] !== ' ') {
      if (getMatchingIndex(listContent, typed) === -1 && event.key !== ' ') {
        props.onTyping?.(false);
      }
    }

    if (
      listContent == null ||
      event.key.length !== 1 ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return;
    }

    if (untrack(context.open) && event.key !== ' ') {
      stopEvent(event);
      props.onTyping?.(true);
    }

    const isNewSession = typed === '';
    if (isNewSession) {
      prevIndex = selected ?? activeIndex ?? -1;
    }

    // Bail out if a label repeats its first letter ("Eggs"), else cycle.
    const allowRapidSuccessionOfFirstLetter = listContent.every((text, index) =>
      text && isItemAvailable(index) ? text[0]?.toLowerCase() !== text[1]?.toLowerCase() : true,
    );

    if (allowRapidSuccessionOfFirstLetter && typed === event.key) {
      typed = '';
      prevIndex = matchIndex;
    }

    typed += event.key;
    timeout.start(props.resetMs ?? 750, () => {
      typed = '';
      prevIndex = matchIndex;
      props.onTyping?.(false);
    });

    const from = isNewSession ? (selected ?? activeIndex ?? -1) : prevIndex;
    const startIndex = (from ?? 0) + 1;
    const index = getMatchingIndex(listContent, typed, startIndex);

    if (index !== -1) {
      props.onMatch?.(index, event);
      matchIndex = index;
    } else if (event.key !== ' ') {
      typed = '';
      props.onTyping?.(false);
    }
  };

  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget as Element | null;
    const withinComposite =
      contains(untrack(context.domReferenceElement), next) ||
      contains(untrack(context.floatingElement), next);
    if (withinComposite) {
      return;
    }
    timeout.clear();
    typed = '';
    prevIndex = matchIndex;
    props.onTyping?.(false);
  };

  createEffect(
    () => [context.open(), selectedIndex()] as const,
    ([open, selected]) => {
      if (!open && selected !== null) {
        return;
      }
      timeout.clear();
      matchIndex = null;
      if (typed !== '') {
        typed = '';
        props.onTyping?.(false);
      }
    },
  );

  const shared: HTMLProps = { onKeyDown, onFocusOut };
  return { reference: shared, floating: shared };
}
