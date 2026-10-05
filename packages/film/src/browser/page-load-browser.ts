// Pages loaded by the browser itself (`page-load.ts`): a load is the
// `location`'s to make, the one thing this adapter asks of it (the address
// bar's entries are `Location`'s, `@bible/url-state`).

import { Effect, Layer } from 'effect';
import { PageLoad } from './page-load.ts';

/** This tab's loads. */
export const pageLoadLayer: Layer.Layer<PageLoad> = Layer.succeed(
  PageLoad,
  PageLoad.of({
    // oxlint-disable-next-line no-restricted-globals -- PageLoad's live adapter: a load of the page anew
    reload: Effect.sync(() => location.reload()),
    open: (href) =>
      Effect.sync(() => {
        // oxlint-disable-next-line no-restricted-globals -- PageLoad's live adapter: a load of another page
        location.assign(href);
      }),
  }),
);
