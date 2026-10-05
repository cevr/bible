// Upstream: packages/react/src/internals/composite/item/useCompositeItem.ts
//
// An item of a composite widget: it registers in the root's list, holds the
// tab stop (`tabindex` 0) while highlighted and -1 otherwise, takes the tab
// stop when it is focused, and, when the root asks, takes focus on hover.
// Its metadata is re-registered whenever it changes, so the root's map stays
// current.
import { type Accessor, createEffect, createMemo, untrack } from 'solid-js';

import type { HTMLProps } from '../types.ts';
import { useCompositeListItem } from './CompositeList.tsx';
import { useCompositeRootContext } from './CompositeRootContext.ts';

export interface UseCompositeItemParameters<Metadata> {
  /** The item's metadata, read reactively. */
  metadata?: (() => Metadata) | undefined;
}

export interface UseCompositeItemReturnValue {
  compositeProps: HTMLProps;
  /** Pass to the item element's `ref`. */
  compositeRef: (element: HTMLElement | null) => void;
  index: Accessor<number>;
  highlighted: Accessor<boolean>;
}

export function useCompositeItem<Metadata>(
  params: UseCompositeItemParameters<Metadata> = {},
): UseCompositeItemReturnValue {
  const root = useCompositeRootContext();
  const metadataFn = params.metadata;
  const metadata = metadataFn ? createMemo(metadataFn) : undefined;
  const listItem = useCompositeListItem<Metadata>({
    get metadata() {
      return metadata ? untrack(metadata) : undefined;
    },
  });
  let element: HTMLElement | null = null;

  if (metadata) {
    createEffect(metadata, () => {
      if (element) {
        listItem.ref(element);
      }
    });
  }

  const highlighted = () => root.highlightedIndex() === listItem.index();

  const compositeProps: HTMLProps = {
    get tabindex() {
      return highlighted() ? 0 : -1;
    },
    onFocus() {
      root.onHighlightedIndexChange(untrack(listItem.index));
    },
    onMouseMove() {
      if (!element || !untrack(root.highlightItemOnHover)) {
        return;
      }
      const disabled =
        element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
      if (!untrack(highlighted) && !disabled) {
        element.focus();
      }
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
