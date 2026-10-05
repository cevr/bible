// The page's window as a CSS media query sees it: whether it is a phone's
// width (the inspector's bottom sheet, the copy the review plays). The live
// adapter is `viewport-browser.ts` (the window's `matchMedia`); a server
// render has no window, and answers as the studio is designed for first: a
// phone held upright (`Viewport.layerPhone`).

import { Context, Effect, Layer, Option, Stream } from 'effect';

interface ViewportOps {
  /** Whether the window matches `query` (a CSS media query) now. */
  readonly matches: (query: string) => Effect.Effect<boolean>;
  /** Whether the window matches `query`, each time that changes. */
  readonly changes: (query: string) => Stream.Stream<boolean>;
}

/** A phone held upright: its width in CSS pixels, as the studio is designed for first. */
const PHONE_WIDTH = 390;

/** The width a `(max-width: …px)` or `(min-width: …px)` query names, and which of the two it is. */
const WIDTH_QUERY = /^\(\s*(max|min)-width\s*:\s*(\d+(?:\.\d+)?)px\s*\)$/;

/** The answers of a phone's window: its width, its finger (`pointer: coarse`), no hover. */
const PHONE_FEATURES: ReadonlyMap<string, boolean> = new Map([
  ['(pointer: coarse)', true],
  ['(pointer: fine)', false],
  ['(hover: none)', true],
  ['(hover: hover)', false],
]);

/** Whether a phone's window matches `query`; a query it does not know is no match. */
const phoneMatches = (query: string): boolean =>
  Option.match(Option.fromNullishOr(WIDTH_QUERY.exec(query.trim())), {
    onSome: ([, side, width]) => {
      if (side === 'max') return PHONE_WIDTH <= Number(width);
      return PHONE_WIDTH >= Number(width);
    },
    onNone: () => PHONE_FEATURES.get(query.trim()) === true,
  });

export class Viewport extends Context.Service<Viewport, ViewportOps>()(
  '@bible/film/browser/Viewport',
) {
  /** What a server render answers for `query`: a client's hydration shows the same first. */
  static readonly served = phoneMatches;

  /** A phone's window that never changes: what a server render answers for. */
  static readonly layerPhone: Layer.Layer<Viewport> = Layer.succeed(
    Viewport,
    Viewport.of({
      matches: (query) => Effect.succeed(phoneMatches(query)),
      changes: () => Stream.empty,
    }),
  );
}
