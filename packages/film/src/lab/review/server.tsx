// The review page's server entry (`@bible/film/review-server`, the default
// export of an app's `review.server.tsx`): the review (`page.tsx`) rendered
// by the lab for one request (`core/page-render.ts`), over a host of the
// request (`host-server.ts`: its URL, no window) and a client of the lab
// that reads through the render's own reads, so each read the page makes is
// read once, here, and sent with the page for the browser to adopt. It
// draws no film: a film's Project draws its stills in the browser.

import { Effect, Exit, Layer, Scope } from 'effect';
import { onCleanup } from 'solid-js';
import type { PageRender, PageRequest } from '../../core/page-render.ts';
import { ServerHost } from '../../browser/host-server.ts';
import { LabClient } from '../api.ts';
import { pageRender } from '../page-server.tsx';
import { REVIEW_PAGE, reviewOn } from './page.tsx';

/** The review for `request`: its host lives as long as the render does. */
const ReviewServed = (props: { readonly request: PageRequest }) => {
  const scope = Scope.makeUnsafe();
  onCleanup(() => {
    Effect.runFork(Scope.close(scope, Exit.void));
  });
  const host = Effect.runSync(Layer.buildWithScope(ServerHost.layer(props.request.url), scope));
  const { app } = Effect.runSync(reviewOn(host, LabClient.layerRendering(props.request), {}));
  return app();
};

/** The review as the lab renders it on the server. */
export const reviewRender: PageRender = pageRender({
  ...REVIEW_PAGE,
  app: (request) => <ReviewServed request={request} />,
});
