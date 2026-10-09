// Upstream: packages/react/src/merge-props/mergeProps.ts
//
// Merges sets of props the way Base UI does, kept reactive for Solid: the
// result is a view over its sources, read key by key, so a source that is a
// Solid props object or a bag of getters stays live through the merge.
//
// The rightmost source wins, except for:
// - event handlers (`on` + an uppercase letter): all run, rightmost first; a
//   handler may call `event.preventBaseUIHandler()` to stop the handlers merged
//   to its left;
// - `class`: every source's class is kept, rightmost first (Solid's array form);
// - `style`: objects merge, rightmost properties winning;
// - `ref`: every source's ref is called (Base UI leaves refs to its caller;
//   Solid refs are callbacks, so merging them is the useful default).
//
// A source may be a function: it is called once, receives the props merged so
// far and returns the props that replace them (Base UI's props getter).
// Handlers it calls by hand are not stopped by prevention, so they read
// `event.baseUIHandlerPrevented` themselves.
import { $PROXY, createMemo, untrack } from 'solid-js';

import type { BaseUIEvent, HTMLProps } from '../internals/types.ts';

type PropsGetter = (merged: HTMLProps) => HTMLProps;
export type PropsInput = HTMLProps | PropsGetter | null | undefined | false;

type Handler = (...args: Array<unknown>) => unknown;

/** Whether `key` names an event handler prop (`onClick`, `onKeyDown`, …). */
function isEventHandlerKey(key: string): boolean {
  const code2 = key.charCodeAt(2);
  return key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && code2 >= 65 && code2 <= 90;
}

function isPropsGetter(input: PropsInput): input is PropsGetter {
  return typeof input === 'function';
}

/**
 * The sources a merge reads: a props getter is called once, with a live view
 * of the sources before it, and what it returns replaces them.
 */
function resolveSources(inputs: ReadonlyArray<PropsInput>): Array<HTMLProps> {
  let sources: Array<HTMLProps> = [];
  for (const input of inputs) {
    if (!input) {
      continue;
    }
    if (isPropsGetter(input)) {
      const before = sources;
      sources = [untrack(() => input(createView(() => before)))];
      continue;
    }
    sources.push(input);
  }
  return sources;
}

/** Marks `event` so a handler may stop the ones merged before it. */
export function makeEventPreventable<E extends Event>(event: E): BaseUIEvent<E> {
  const preventable = event as BaseUIEvent<E> & { baseUIHandlerPrevented?: boolean };
  preventable.preventBaseUIHandler = () => {
    preventable.baseUIHandlerPrevented = true;
  };
  return preventable;
}

function isEvent(value: unknown): value is Event {
  return typeof Event !== 'undefined' && value instanceof Event;
}

function callHandler(handler: unknown, args: Array<unknown>): unknown {
  if (typeof handler === 'function') {
    return (handler as Handler)(...args);
  }
  // Solid's bound handler: `[fn, data]` calls `fn(data, event)`.
  if (Array.isArray(handler) && typeof handler[0] === 'function') {
    return (handler[0] as Handler)(handler[1], ...args);
  }
  return undefined;
}

function isHandlerValue(value: unknown): boolean {
  return typeof value === 'function' || (Array.isArray(value) && typeof value[0] === 'function');
}

/** Runs `handlers` (leftmost first in the array) rightmost first, honouring prevention. */
function runHandlers(handlers: ReadonlyArray<unknown>, args: Array<unknown>): unknown {
  const event = args[0];
  if (isEvent(event)) {
    makeEventPreventable(event);
  }
  let result: unknown;
  for (let i = handlers.length - 1; i >= 0; i -= 1) {
    const value = callHandler(handlers[i], args);
    if (i === handlers.length - 1) {
      result = value;
    }
    if (isEvent(event) && (event as BaseUIEvent<Event>).baseUIHandlerPrevented) {
      break;
    }
  }
  return result;
}

const STYLE_DECLARATION = /([\w-]+)\s*:\s*([^;]*)/g;

/** A `style` string as Solid's object form. */
function styleToObject(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of style.matchAll(STYLE_DECLARATION)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      out[name] = value.trim();
    }
  }
  return out;
}

/** Merges two style values, `b`'s properties winning. */
export function mergeStyles(a: unknown, b: unknown): unknown {
  if (a == null || a === false) {
    return b;
  }
  if (b == null || b === false) {
    return a;
  }
  const left = typeof a === 'string' ? styleToObject(a) : (a as object);
  const right = typeof b === 'string' ? styleToObject(b) : (b as object);
  return { ...left, ...right };
}

/**
 * Merges two class values: `theirs` first, as Base UI's `mergeClassNames`
 * puts the class merged later first.
 */
export function mergeClassNames(ours: unknown, theirs: unknown): unknown {
  if (theirs == null || theirs === false || theirs === '') {
    return ours;
  }
  if (ours == null || ours === false || ours === '') {
    return theirs;
  }
  return [theirs, ours];
}

function hasKey(source: HTMLProps, key: string): boolean {
  return key in source;
}

/** A merged, reactive view over the sources `read` returns. */
function createView(read: () => ReadonlyArray<HTMLProps>): HTMLProps {
  const handlers = new Map<string, Handler>();
  // The index of the source a key is read from (-1: none). The search runs from the
  // right and stops at the first source that has the key, so a reader asking for a key
  // does not track the sources it shadows (a state attributes view reruns on every
  // state change).
  const ownerOf = (key: string): number => {
    const sources = read();
    for (let i = sources.length - 1; i >= 0; i -= 1) {
      const source = sources[i];
      if (source !== undefined && hasKey(source, key)) {
        return i;
      }
    }
    return -1;
  };

  const handlerFor = (key: string): Handler => {
    const cached = handlers.get(key);
    if (cached) {
      return cached;
    }
    const handler: Handler = (...args) => {
      const values = untrack(() =>
        read()
          .filter((source) => hasKey(source, key))
          .map((source) => source[key])
          .filter(isHandlerValue),
      );
      return runHandlers(values, args);
    };
    handlers.set(key, handler);
    return handler;
  };

  const refFn = (el: unknown) => {
    const all = untrack(() => read().map((source) => source['ref']));
    for (const ref of all) {
      applyRef(ref, el);
    }
  };

  const get = (key: string): unknown => {
    const sources = read();
    switch (key) {
      case 'class': {
        let merged: unknown;
        for (const source of sources) {
          if (hasKey(source, 'class')) {
            merged = mergeClassNames(merged, source['class']);
          }
        }
        return merged;
      }
      case 'style': {
        let merged: unknown;
        for (const source of sources) {
          if (hasKey(source, 'style')) {
            merged = mergeStyles(merged, source['style']);
          }
        }
        return merged;
      }
      case 'ref':
        return sources.some((source) => source['ref'] != null) ? refFn : undefined;
      default:
        break;
    }
    if (isEventHandlerKey(key)) {
      const present = sources.some((source) => hasKey(source, key) && isHandlerValue(source[key]));
      return present ? handlerFor(key) : undefined;
    }
    const index = ownerOf(key);
    return index === -1 ? undefined : sources[index]?.[key];
  };

  const keys = (): Array<string> => {
    const seen = new Set<string>();
    for (const source of read()) {
      for (const key of Object.keys(source)) {
        seen.add(key);
      }
    }
    return [...seen];
  };

  // The view carries Solid's $PROXY marker (and no record), as a store does: Solid's spread
  // then treats its key set as dynamic, so a key that appears later (a store's `children`)
  // still renders.
  const view: HTMLProps = new Proxy<HTMLProps>(
    {},
    {
      get: (_, key) => {
        if (key === $PROXY) {
          return view;
        }
        return typeof key === 'string' ? get(key) : undefined;
      },
      has: (_, key) => key === $PROXY || (typeof key === 'string' && ownerOf(key) !== -1),
      ownKeys: () => keys(),
      // A descriptor answers presence without tracking it; the key set is tracked
      // through `ownKeys`.
      getOwnPropertyDescriptor: (_, key) => {
        if (typeof key !== 'string' || untrack(() => ownerOf(key)) === -1) {
          return undefined;
        }
        return { configurable: true, enumerable: true, get: () => get(key) };
      },
      set: () => false,
      deleteProperty: () => false,
    },
  );
  return view;
}

/** Calls a Solid ref (a callback, or an array of them) with `el`. */
function applyRef(ref: unknown, el: unknown): void {
  if (typeof ref === 'function') {
    (ref as (el: unknown) => void)(el);
    return;
  }
  if (Array.isArray(ref)) {
    for (const entry of ref) {
      applyRef(entry, el);
    }
  }
}

/**
 * Merges sets of props. The rightmost wins, except for event handlers (all
 * run, rightmost first, each able to stop the ones to its left), `class`
 * (all kept), `style` (merged) and `ref` (all called).
 */
export function mergeProps(...inputs: ReadonlyArray<PropsInput>): HTMLProps {
  return mergePropsN(inputs);
}

/** `mergeProps` over an array of sources. */
export function mergePropsN(inputs: ReadonlyArray<PropsInput>): HTMLProps {
  const sources = resolveSources(inputs);
  return createView(() => sources);
}

/** `mergeProps` over the sources `read` returns, merged again when they change. */
export function mergePropsLive(read: () => ReadonlyArray<PropsInput>): HTMLProps {
  const sources = createMemo(() => resolveSources(read()));
  return createView(sources);
}
