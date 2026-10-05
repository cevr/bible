// The review page's server entry (`@bible/film/review-server`, the default
// export of an app's `review.server.tsx`): the review (`page.tsx`) rendered
// by the lab for one request (`core/page-render.ts`), over a host of the
// request (`ServerHosted`: its URL, no window) and a client of the lab that
// reads through the render's own reads, so each read the page makes is read
// once, here, and sent with the page for the browser to adopt. It draws no
// film (`noStills`): a film's Project draws its stills in the browser.

import { Effect } from 'effect';
import type { PageRender } from '../../core/page-render.ts';
import { LabClient } from '../api.ts';
import { ServerHosted, pageRender } from '../page-server.tsx';
import { noStills } from './options/stills.tsx';
import { REVIEW_PAGE, reviewOn } from './page.tsx';

/** The review as the lab renders it on the server. */
export const reviewRender: PageRender = pageRender({
  ...REVIEW_PAGE,
  app: (request) => (
    <ServerHosted
      url={request.url}
      app={(host) =>
        Effect.runSync(reviewOn(host, LabClient.layerRendering(request), noStills)).app()
      }
    />
  ),
});
