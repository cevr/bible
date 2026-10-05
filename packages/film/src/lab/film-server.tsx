// A film's pages' server entry (`@bible/film/lab-server`: `labRender` and
// `playRender`, the default exports of an app's `lab.server.tsx` and
// `play.server.tsx`): the studio's shell around a film's page
// (`film-page.tsx`), rendered by the lab for one request over a host of its
// URL (`ServerHosted`). The page's body is the browser's: the server reads
// no film's modules and stages nothing (`SERVER_BODY`), so the body's place
// is a quiet line until the browser has staged the film. A server render
// never sees `#t=` (a browser never sends it): the header's timecode is the
// browser's too.

import { Effect } from 'effect';
import type { PageRender } from '../core/page-render.ts';
import { LAB_PAGE, PLAY_PAGE, SERVER_BODY, labOn, playOn } from './film-page.tsx';
import { ServerHosted, pageRender } from './page-server.tsx';

/** The Lab as the lab renders it on the server. */
export const labRender: PageRender = pageRender({
  ...LAB_PAGE,
  app: (request) => (
    <ServerHosted
      url={request.url}
      app={(host) => Effect.runSync(labOn(host, [], SERVER_BODY)).app()}
    />
  ),
});

/** The Scenes and Play pages as the lab renders them on the server. */
export const playRender: PageRender = pageRender({
  ...PLAY_PAGE,
  app: (request) => (
    <ServerHosted
      url={request.url}
      app={(host) => Effect.runSync(playOn(host, [], SERVER_BODY)).app()}
    />
  ),
});
