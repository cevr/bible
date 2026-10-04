// Upstream: packages/react/src/internals/useRenderElement.tsx
//
// Renders a part's element: its state as `data-*` attributes, its internal
// props merged under the user's, `class` and `style` resolved against the
// state, and either the default tag or the user's `render` function.
//
// `params` may hold getters: `enabled`, `state` and `props` are read inside
// a reactive scope, so a part passes live values without rebuilding the
// element. `render` is called once per change of the `render` prop, with the
// merged props and the state (both live views: spread or read them in a reactive scope).
import { type JSX, dynamic } from '@solidjs/web';
import { createMemo, untrack } from 'solid-js';

import {
  mergeClassNames,
  mergePropsLive,
  mergePropsN,
  mergeStyles,
  type PropsInput,
} from '../merge-props/mergeProps.ts';
import { getStateAttributesProps, type StateAttributesMapping } from './getStateAttributesProps.ts';
import type { ClassProp, ComponentRenderFn, HTMLProps, StyleProp } from './types.ts';

export type IntrinsicTagName = keyof JSX.IntrinsicElements;

export interface UseRenderElementComponentProps<State> {
  class?: ClassProp<State> | undefined;
  style?: StyleProp<State> | undefined;
  render?: ComponentRenderFn<HTMLProps, State> | undefined;
}

export interface UseRenderElementParameters<State> {
  /** When `false`, nothing renders. */
  enabled?: boolean | undefined;
  /** The state the `data-*` attributes, `class`, `style` and `render` read. */
  state?: State | undefined;
  /** Refs the rendered element is passed to, besides any in `props`. */
  ref?: unknown;
  /** The element's props: one set, or several merged left to right. */
  props?: PropsInput | ReadonlyArray<PropsInput> | undefined;
  /** Replaces the default `data-*` attribute of a state key. */
  stateAttributesMapping?: StateAttributesMapping<State> | undefined;
}

const EMPTY_STATE = {};

function resolveClass<State>(value: ClassProp<State> | undefined, state: State) {
  return typeof value === 'function' ? value(state) : value;
}

function resolveStyle<State>(value: StyleProp<State> | undefined, state: State) {
  return typeof value === 'function' ? value(state) : value;
}

/** A live props view over a computed record, its keys free to change. */
export function propsFromAccessor(read: () => HTMLProps): HTMLProps {
  return new Proxy<HTMLProps>(
    {},
    {
      get: (_, key) => (typeof key === 'string' ? read()[key] : undefined),
      has: (_, key) => typeof key === 'string' && key in read(),
      ownKeys: () => Object.keys(read()),
      getOwnPropertyDescriptor: (_, key) => {
        if (typeof key !== 'string' || !(key in read())) {
          return undefined;
        }
        return { configurable: true, enumerable: true, get: () => read()[key] };
      },
    },
  );
}

/** The merged props a part's element receives (without rendering it). */
export function useRenderElementProps<State extends object>(
  componentProps: UseRenderElementComponentProps<State>,
  params: UseRenderElementParameters<State>,
): HTMLProps {
  const state = () => (params.state ?? EMPTY_STATE) as State;
  const stateAttributes = createMemo(() =>
    getStateAttributesProps(state(), params.stateAttributesMapping),
  );
  const resolved = mergePropsLive(() => {
    const inputs = params.props;
    return Array.isArray(inputs) ? (inputs as ReadonlyArray<PropsInput>) : [inputs as PropsInput];
  });
  const own: HTMLProps = {
    get class() {
      return mergeClassNames(resolved['class'], resolveClass(componentProps.class, state()));
    },
    get style() {
      return mergeStyles(resolved['style'], resolveStyle(componentProps.style, state()));
    },
    ref: untrack(() => params.ref),
  };
  return mergePropsN([propsFromAccessor(stateAttributes), resolved, own]);
}

/** Renders a part's element, or the user's `render` in its place. */
export function useRenderElement<State extends object>(
  element: IntrinsicTagName | undefined,
  componentProps: UseRenderElementComponentProps<State>,
  params: UseRenderElementParameters<State> = {},
): JSX.Element {
  const props = useRenderElementProps(componentProps, params);
  const state = propsFromAccessor(() => (params.state ?? EMPTY_STATE) as HTMLProps) as State;
  const tag = element ?? 'div';
  const Tag = dynamic(() => tag, { static: true });
  const defaults = tag === 'button' ? { type: 'button' } : tag === 'img' ? { alt: '' } : undefined;
  const tagProps = defaults ? mergePropsN([defaults, props]) : props;

  return createMemo(() => {
    if (params.enabled === false) {
      return undefined;
    }
    const render = componentProps.render;
    return untrack(() => (render ? render(props, state) : <Tag {...tagProps} />));
  }) as unknown as JSX.Element;
}
