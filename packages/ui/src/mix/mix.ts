// Not in upstream: Base UI composes a part's behaviour as props getters, and
// Remix 3 as mixins on the host element (`mix={[...]}`). Solid 2 has no `mix`
// prop, so a behaviour comes in two halves:
// - a prop mixin, a props bag with getters for its live values: spread onto
//   an element, its attributes render into the server's markup, and its
//   handlers are delegated and merged (every one runs);
// - a ref factory, for work only the DOM can do (listener options, document
//   and window listeners, observers, focus, measuring). It is made in the
//   component's body, on the server too, and registers the DOM work; the
//   callback it returns only keeps the element, because Solid calls it before
//   the element is connected and before its dynamic attributes are set, and
//   never on the server. Made inline in `ref={...}` on an element with a
//   spread, it would be made in the browser alone: the server never
//   evaluates such an element's `ref`, and the hydration ids would shift.
// A prop mixin may carry its ref factories under `ref`.
import type { JSX } from '@solidjs/web';
import { onSettled } from 'solid-js';

import { mergePropsN } from '../merge-props/mergeProps.ts';

/** The tag whose element is exactly `T` (`button` for `HTMLButtonElement`). */
type TagOf<T extends Element> = {
  [K in keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap]: [
    HTMLElementTagNameMap[K],
  ] extends [T]
    ? [T] extends [HTMLElementTagNameMap[K]]
      ? K
      : never
    : never;
}[keyof JSX.IntrinsicElements & keyof HTMLElementTagNameMap];

/** The attributes of `T`'s tag (a button's `type`), else those every HTML element takes. */
type AttributesOf<T extends Element> = [TagOf<T>] extends [never]
  ? JSX.HTMLAttributes<T>
  : JSX.IntrinsicElements[TagOf<T>];

/** The callback a ref factory returns: Solid passes it the element. */
export type RefFactory<T extends Element = HTMLElement> = (element: T) => void;

/**
 * The props a mixin gives an element of type `T`. `ref` takes callbacks only
 * (JSX's `Ref<T>` also takes a bare `T`, which makes it invariant), `style`
 * leaves out `false` (so a mixin spreads onto a part, whose `style` has no
 * `false`), and `data-*` keys are allowed in an object literal.
 */
export type Mixin<T extends Element = HTMLElement> = Omit<AttributesOf<T>, 'ref' | 'style'> & {
  ref?: RefFactory<T> | Array<RefFactory<T> | undefined> | undefined;
  style?: JSX.CSSProperties | string | undefined;
  [data: `data-${string}`]: string | undefined;
};

/**
 * Merges mixins left to right, as `mergeProps` does: the rightmost attribute
 * wins, every handler runs (rightmost first, each able to stop the ones to its
 * left with `event.preventBaseUIHandler()`), every `class` is kept, `style`
 * objects merge and every ref is called. A falsy entry is left out, so
 * `cond && mixin()` composes. Build the result in a component's body and
 * spread it; never call `mix` inside JSX.
 */
export function mix<T extends Element = HTMLElement>(
  ...mixins: ReadonlyArray<Mixin<T> | false | null | undefined>
): Mixin<T> {
  return mergePropsN(mixins) as Mixin<T>;
}

/**
 * A ref factory that runs `setup` on its element once the render has settled
 * (the element connected, its attributes set); what `setup` returns runs when
 * the owner is disposed. Make it in a component's body, under the element's
 * owner: made before its element exists (above a `<Show>`), it finds no
 * element when the render settles and does nothing.
 */
export function onElement<T extends Element = HTMLElement>(
  setup: (element: T) => void | (() => void),
): RefFactory<T> {
  let element: T | undefined;
  onSettled(() => (element ? setup(element) : undefined));
  return (next) => {
    element = next;
  };
}

interface ListenTargets {
  element: HTMLElementEventMap;
  document: DocumentEventMap;
  window: WindowEventMap;
}

/**
 * A ref factory that adds a native listener while its owner lives: on the
 * element, or on its document or window. For what Solid's `onX` props cannot
 * say: listener options (`passive: false`, `capture`) and listeners off the
 * element. A native listener runs before a delegated `onX` handler, so its
 * `stopPropagation()` silences them.
 */
export function listen<
  Where extends keyof ListenTargets,
  Type extends keyof ListenTargets[Where] & string,
>(
  target: Where,
  type: Type,
  handler: (event: ListenTargets[Where][Type]) => void,
  options?: AddEventListenerOptions,
): RefFactory<Element> {
  return onElement<Element>((element) => {
    const doc = element.ownerDocument;
    const on = target === 'element' ? element : target === 'document' ? doc : doc.defaultView;
    if (!on) {
      return undefined;
    }
    const controller = new AbortController();
    on.addEventListener(type, handler as EventListener, {
      ...options,
      signal: controller.signal,
    });
    return () => controller.abort();
  });
}
