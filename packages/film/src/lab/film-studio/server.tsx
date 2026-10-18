// A film's studio page's server entry (`@bible/film/play-server`, the
// default export of an app's `play.server.tsx`): the studio's frame
// (`page.tsx`) rendered by the lab for one request over a host of its URL
// (`ServerHosted`). The studio itself is the browser's: the server reads no
// film's modules and stages nothing (`SERVER_BODY`), so the header names the
// film over a quiet line until the browser has staged it. A server render
// never sees `#t=` (a browser never sends it).

import { Effect } from 'effect';
import type { PageRender } from '../../core/page-render.ts';
import { ServerHosted, pageRender } from '../page-server.tsx';
import { type FilmBody, STUDIO_PAGE, studioPageOn } from './page.tsx';

/** The body of a page the server renders: never loaded, as the server stages no film. */
const SERVER_BODY: FilmBody = () =>
  Effect.runPromise(Effect.die('a page rendered on the server stages no film'));

/** A film's studio as the lab renders it on the server: its frame, the film's name and a quiet line. */
export const studioRender: PageRender = pageRender({
  ...STUDIO_PAGE,
  app: (request) => (
    <ServerHosted
      asked={request}
      app={(host) => Effect.runSync(studioPageOn(host, SERVER_BODY)).app()}
    />
  ),
});
