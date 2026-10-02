// Upstream: packages/react/src/internals/composite/root/CompositeRoot.tsx
//
// The element of a composite widget: it owns the roving tab stop
// (`useCompositeRoot`), registers its items through a `CompositeList`, and
// gives them the tab stop through `CompositeRootContext`. A part renders it
// with its own tag, state and props.
import type { JSX } from '@solidjs/web';
import { untrack } from 'solid-js';

import type { PropsInput } from '../../merge-props/mergeProps.ts';
import type { StateAttributesMapping } from '../getStateAttributesProps.ts';
import type { ClassProp, ComponentRenderFn, HTMLProps, StyleProp } from '../types.ts';
import { type IntrinsicTagName, useRenderElement } from '../useRenderElement.tsx';
import { CompositeList, type CompositeMetadata } from './CompositeList.tsx';
import { CompositeRootContext, type CompositeRootContextValue } from './CompositeRootContext.ts';
import { type UseCompositeRootParameters, useCompositeRoot } from './useCompositeRoot.ts';

export interface CompositeRootProps<
  Metadata,
  State extends object,
> extends UseCompositeRootParameters {
  class?: ClassProp<State> | undefined;
  style?: StyleProp<State> | undefined;
  render?: ComponentRenderFn<HTMLProps, State> | undefined;
  /** The element's props (children included), merged after the root's own. */
  props?: ReadonlyArray<PropsInput> | undefined;
  state?: State | undefined;
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
  /** Refs the element is passed to. */
  refs?: ReadonlyArray<unknown> | undefined;
  /** @default 'div' */
  tag?: IntrinsicTagName | undefined;
  onMapChange?: ((map: Map<Element, CompositeMetadata<Metadata>>) => void) | undefined;
  /** Whether hovering an enabled item focuses it. @default false */
  highlightItemOnHover?: boolean | undefined;
}

export function CompositeRoot<Metadata, State extends object>(
  props: CompositeRootProps<Metadata, State>,
): JSX.Element {
  const root = useCompositeRoot({
    get orientation() {
      return props.orientation;
    },
    get loopFocus() {
      return props.loopFocus;
    },
    get onLoop() {
      return props.onLoop;
    },
    get highlightedIndex() {
      return props.highlightedIndex;
    },
    get onHighlightedIndexChange() {
      return props.onHighlightedIndexChange;
    },
    get enableHomeAndEndKeys() {
      return props.enableHomeAndEndKeys;
    },
    get stopEventPropagation() {
      return props.stopEventPropagation ?? true;
    },
    get disabledIndices() {
      return props.disabledIndices;
    },
    get modifierKeys() {
      return props.modifierKeys;
    },
  });

  const context: CompositeRootContextValue = {
    highlightedIndex: root.highlightedIndex,
    onHighlightedIndexChange: root.onHighlightedIndexChange,
    highlightItemOnHover: () => props.highlightItemOnHover ?? false,
    relayKeyboardEvent: root.relayKeyboardEvent,
  };

  // Rendered under the list so the items inside it register with it.
  function Element() {
    return useRenderElement(untrack(() => props.tag) ?? 'div', props, {
      get state() {
        return props.state;
      },
      ref: untrack(() => props.refs),
      props: [root.props, ...(untrack(() => props.props) ?? [])],
      get stateAttributesMapping() {
        return props.stateAttributesMapping;
      },
    });
  }

  return (
    <CompositeRootContext value={context}>
      <CompositeList<Metadata>
        elementsRef={root.elementsRef}
        onMapChange={(map) => {
          props.onMapChange?.(map);
          root.onMapChange(map as Map<Element, CompositeMetadata<unknown>>);
        }}
      >
        <Element />
      </CompositeList>
    </CompositeRootContext>
  );
}
