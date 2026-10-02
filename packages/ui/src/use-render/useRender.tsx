// Upstream: packages/react/src/use-render/useRender.ts
//
// Renders an element the Base UI way for a component of your own: `render`
// replaces the default tag, the state becomes `data-*` attributes, and props
// merge as `mergeProps` merges them.
import type { JSX } from '@solidjs/web';

import type { PropsInput } from '../merge-props/mergeProps.ts';
import type { StateAttributesMapping } from '../internals/getStateAttributesProps.ts';
import type { ComponentRenderFn, HTMLProps } from '../internals/types.ts';
import { type IntrinsicTagName, useRenderElement } from '../internals/useRenderElement.tsx';

export type UseRenderRenderProp<State = Record<string, unknown>> = ComponentRenderFn<
  HTMLProps,
  State
>;

export interface UseRenderParameters<State> {
  /** Replaces the default element: called with the merged props and the state. */
  render?: UseRenderRenderProp<State> | undefined;
  /** Refs the rendered element is passed to. */
  ref?: unknown;
  /** The state, passed to `render` and turned into `data-*` attributes. */
  state?: State | undefined;
  /** Maps a state key to its own `data-*` attributes. */
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
  /** Props for the element, merged as `mergeProps` merges them. */
  props?: PropsInput | ReadonlyArray<PropsInput> | undefined;
  /** When `false`, nothing renders. */
  enabled?: boolean | undefined;
  /** The tag rendered when there is no `render`. @default 'div' */
  defaultTagName?: IntrinsicTagName | undefined;
}

/** Renders a Base UI element. */
export function useRender<State extends object = Record<string, unknown>>(
  params: UseRenderParameters<State>,
): JSX.Element {
  return useRenderElement(
    params.defaultTagName ?? 'div',
    {
      get render() {
        return params.render;
      },
    },
    params,
  );
}
