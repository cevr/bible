// Upstream: packages/react/src/types.ts, packages/react/src/internals/types.ts
//
// The shared prop and event types. A part's props are Solid's: `class` and
// `style` (each may be a function of the part's state), lowercase attribute
// names (`tabindex`), and a `render` function in place of React's element.
import type { JSX } from '@solidjs/web';

/** A bag of props as the parts merge them: any attribute, handler or `ref`. */
export type HTMLProps = Record<string, unknown>;

/** A DOM event a merged handler may stop the handlers merged before it from seeing. */
export type BaseUIEvent<E extends Event> = E & {
  preventBaseUIHandler: () => void;
  readonly baseUIHandlerPrevented?: boolean;
};

/** The `render` prop: the element to render, given the merged props and the part's state. */
export type ComponentRenderFn<Props, State> = (props: Props, state: State) => JSX.Element;

/** `class` as a part takes it: Solid's class value, or one computed from the state. */
export type ClassProp<State> = JSX.ClassValue | ((state: State) => JSX.ClassValue);

/** `style` as a part takes it: Solid's style value, or one computed from the state. */
export type StyleProp<State> =
  | JSX.CSSProperties
  | string
  | ((state: State) => JSX.CSSProperties | string | undefined);

/**
 * A part's props: the intrinsic element's attributes, with `class` and `style`
 * that may read the state, and `render` to replace the element.
 */
export type BaseUIComponentProps<
  Tag extends keyof JSX.IntrinsicElements,
  State,
  RenderFunctionProps = HTMLProps,
> = Omit<JSX.IntrinsicElements[Tag], 'class' | 'style'> & {
  class?: ClassProp<State> | undefined;
  style?: StyleProp<State> | undefined;
  render?: ComponentRenderFn<RenderFunctionProps, State> | undefined;
};

export interface NativeButtonProps {
  /**
   * Whether the part renders a native `<button>`. Set to `false` when `render`
   * swaps in another element, so the part adds `role="button"` and key handling.
   */
  nativeButton?: boolean | undefined;
}

export interface FloatingUIOpenChangeDetails {
  open: boolean;
  reason: string;
  nativeEvent: Event;
  triggerElement?: Element | undefined;
}
