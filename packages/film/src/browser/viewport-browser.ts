// The window's media queries as the browser answers them (`viewport.ts`).

import { Effect, Layer, Queue, Stream } from 'effect';
import { Viewport } from './viewport.ts';

/** This window's answers, live. */
export const viewportLayer: Layer.Layer<Viewport> = Layer.succeed(
  Viewport,
  Viewport.of({
    matches: (query) => Effect.sync(() => matchMedia(query).matches),
    changes: (query) =>
      Stream.callback<boolean>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const list = matchMedia(query);
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
