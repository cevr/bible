// Upstream: packages/react/src/internals/composite/root/CompositeRoot.tsx
//
// The element of a composite widget: it owns the roving tab stop
// (`useCompositeRoot`), registers its items through a `CompositeList`, and
// gives them the tab stop through `CompositeRootContext`. A part renders it
// as a `div` with its own state and props.
import type { JSX } from '@solidjs/web';
import { untrack } from 'solid-js';

import type { PropsInput } from '../../merge-props/mergeProps.ts';
import type { ClassProp, ComponentRenderFn, HTMLProps, StyleProp } from '../types.ts';
import { useRenderElement } from '../useRenderElement.tsx';
import { CompositeList, type CompositeMetadata } from './CompositeList.tsx';
import { CompositeRootContext, type CompositeRootContextValue } from './CompositeRootContext.ts';
import { type UseCompositeRootParameters, useCompositeRoot } from './useCompositeRoot.ts';

export interface CompositeRootProps<State extends object> extends UseCompositeRootParameters {
  class?: ClassProp<State> | undefined;
  style?: StyleProp<State> | undefined;
  render?: ComponentRenderFn<HTMLProps, State> | undefined;
  /** The element's props (children included), merged after the root's own. */
  props?: ReadonlyArray<PropsInput> | undefined;
  state?: State | undefined;
}

export function CompositeRoot<State extends object>(props: CompositeRootProps<State>): JSX.Element {
  const root = useCompositeRoot({
    get orientation() {
      return props.orientation;
    },
    get loopFocus() {
      return props.loopFocus;
    },
    get enableHomeAndEndKeys() {
      return props.enableHomeAndEndKeys;
    },
  });

  const context: CompositeRootContextValue = {
    highlightedIndex: root.highlightedIndex,
    onHighlightedIndexChange: root.onHighlightedIndexChange,
  };

  // Rendered under the list so the items inside it register with it.
  function Element() {
    return useRenderElement('div', props, {
      get state() {
        return props.state;
      },
      props: [root.props, ...(untrack(() => props.props) ?? [])],
    });
  }

  return (
    <CompositeRootContext value={context}>
      <CompositeList<unknown>
        elementsRef={root.elementsRef}
        onMapChange={(map) => root.onMapChange(map as Map<Element, CompositeMetadata<unknown>>)}
      >
        <Element />
      </CompositeList>
    </CompositeRootContext>
  );
}
