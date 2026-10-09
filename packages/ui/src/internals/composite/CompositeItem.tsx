// Upstream: packages/react/src/internals/composite/item/CompositeItem.tsx
//
// Renders an item of a composite widget (`useCompositeItem`) with a part's
// tag, state and props: the roving `tabindex` first, the part's props after.
import type { JSX } from '@solidjs/web';
import { untrack } from 'solid-js';

import type { PropsInput } from '../../merge-props/mergeProps.ts';
import type { StateAttributesMapping } from '../getStateAttributesProps.ts';
import type { ClassProp, ComponentRenderFn, HTMLProps, StyleProp } from '../types.ts';
import { type IntrinsicTagName, useRenderElement } from '../useRenderElement.tsx';
import { useCompositeItem } from './useCompositeItem.ts';

interface CompositeItemProps<State extends object> {
  class?: ClassProp<State> | undefined;
  style?: StyleProp<State> | undefined;
  render?: ComponentRenderFn<HTMLProps, State> | undefined;
  /** The element's props (children included), merged after the item's own. */
  props?: ReadonlyArray<PropsInput> | undefined;
  state?: State | undefined;
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
  refs?: ReadonlyArray<unknown> | undefined;
  /** @default 'div' */
  tag?: IntrinsicTagName | undefined;
}

export function CompositeItem<State extends object>(props: CompositeItemProps<State>): JSX.Element {
  const item = useCompositeItem();
  return useRenderElement(untrack(() => props.tag) ?? 'div', props, {
    get state() {
      return props.state;
    },
    // The composite ref first, so an outer item wins when nested items share a node.
    ref: [item.compositeRef, ...(untrack(() => props.refs) ?? [])],
    props: [item.compositeProps, ...(untrack(() => props.props) ?? [])],
    get stateAttributesMapping() {
      return props.stateAttributesMapping;
    },
  });
}
