// The window's media queries as the browser answers them (`viewport.ts`):
// the one reader of `matchMedia` on the pages.

import { Effect, Layer, Queue, Stream } from 'effect';
import { Viewport } from './viewport.ts';

/** The window's answer to `query`, live. */
const listFor = (query: string): MediaQueryList =>
  // oxlint-disable-next-line no-restricted-globals -- Viewport's live adapter: the window's media queries
  matchMedia(query);

/** This window's answers, live. */
export const viewportLayer: Layer.Layer<Viewport> = Layer.succeed(
  Viewport,
  Viewport.of({
    matches: (query) => Effect.sync(() => listFor(query).matches),
    changes: (query) =>
      Stream.callback<boolean>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const list = listFor(query);
            const changed = () => {
              Queue.offerUnsafe(queue, list.matches);
            };
            list.addEventListener('change', changed);
            return { list, changed };
          }),
          ({ list, changed }) => Effect.sync(() => list.removeEventListener('change', changed)),
        ),
      ),
  }),
);
