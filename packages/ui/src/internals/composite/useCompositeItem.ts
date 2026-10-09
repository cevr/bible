// Upstream: packages/react/src/internals/composite/item/useCompositeItem.ts
//
// An item of a composite widget: it registers in the root's list, holds the
// tab stop (`tabindex` 0) while highlighted and -1 otherwise, and takes the
// tab stop when it is focused.
import { type Accessor, untrack } from 'solid-js';

import type { HTMLProps } from '../types.ts';
import { useCompositeListItem } from './CompositeList.tsx';
import { useCompositeRootContext } from './CompositeRootContext.ts';

interface UseCompositeItemReturnValue {
  compositeProps: HTMLProps;
  /** Pass to the item element's `ref`. */
  compositeRef: (element: HTMLElement | null) => void;
  index: Accessor<number>;
  highlighted: Accessor<boolean>;
}

export function useCompositeItem(): UseCompositeItemReturnValue {
  const root = useCompositeRootContext();
  const listItem = useCompositeListItem();
  let element: HTMLElement | null = null;

  const highlighted = () => root.highlightedIndex() === listItem.index();

  const compositeProps: HTMLProps = {
    get tabindex() {
      return highlighted() ? 0 : -1;
    },
    onFocus() {
      root.onHighlightedIndexChange(untrack(listItem.index));
    },
  };

  return {
    compositeProps,
    compositeRef(node) {
      if (node === element) {
        return;
      }
      element = node;
      listItem.ref(node);
    },
    index: listItem.index,
    highlighted,
  };
}
