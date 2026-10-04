// Pages loaded by the browser itself (`page-load.ts`).

import { Effect, Layer } from 'effect';
import { PageLoad } from './page-load.ts';

/** This tab's loads. */
export const pageLoadLayer: Layer.Layer<PageLoad> = Layer.succeed(
  PageLoad,
  PageLoad.of({
    reload: Effect.sync(() => location.reload()),
    open: (href) =>
      Effect.sync(() => {
        location.assign(href);
      }),
  }),
);
