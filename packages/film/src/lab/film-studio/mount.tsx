// The studio page's browser entry (`@bible/film/play`, `mountFilmStudio`):
// the page mounted as every studio page is (`mountStudio`), hydrated over
// the server's markup or rendered anew, then the studio in its body once
// the film is staged. A film the registry holds is staged and its preview
// mounted under the studio's keys, so the viewer draws its scenes and the
// clock plays its narration; a film that does not stage leaves the studio
// on its timeline alone, its Board panels in the viewer and its clock
// silent. The render page (`player/render.ts`) loads none of this.

import { Place } from '@bible/url-state';
import { Effect, type Layer, Option } from 'effect';
import type { HttpClient } from 'effect/http';
import type { Host } from '../../browser/host.ts';
import { addressOn } from '../../browser/host.ts';
import { Places } from '../../core/api.ts';
import { type Films, mountPreview, stageFilm } from '../../player/main.ts';
import type { TimeInUrl } from '../../player/t-in-url.ts';
import { LabClient } from '../api.ts';
import type { FilmBody } from '../film-page.tsx';
import { mountStudio } from '../page-client.tsx';
import { Root, type StagedFilm } from './context.tsx';
import { STUDIO_PAGE, studioPageOn } from './page.tsx';
import { Studio } from './parts.tsx';

/**
 * The preview's time: read from the studio's `#t=`, never written by the
 * preview (the studio writes its own address, `context.tsx`).
 */
const studioTime: TimeInUrl = {
  at: (href) =>
    Option.getOrElse(
      Option.flatMap(Place.decode(Places.studio, href), (v) => v.hash.t),
      () => 0,
    ),
  write: () => {},
};

/**
 * The studio's body for `pages` over `host`: the film its path names
 * staged (or not), then the studio over it, its reads through `client`.
 */
const studioBody =
  (
    pages: Films,
    host: Host,
    client: Layer.Layer<LabClient | HttpClient.HttpClient>,
    fail: (why: string) => Effect.Effect<void>,
  ): FilmBody =>
  (hub) =>
    Effect.runPromiseWith(host)(
      Effect.tryPromise(() => stageFilm(pages, addressOn(host).href())).pipe(
        Effect.map((staged): Option.Option<StagedFilm> => {
          // The studio keys its own transport over the preview's clock.
          const player = mountPreview(staged, host, studioTime, hub, fail, 'page');
          player.bar.remove();
          return Option.some({ staged, player });
        }),
        Effect.tap((staged) =>
          Effect.logInfo(
            `studio.staged film=${staged.pipe(
              Option.map((s) => s.staged.name),
              Option.getOrElse(() => ''),
            )}`,
          ),
        ),
        Effect.catch((cause) =>
          Effect.as(
            Effect.logWarning(`studio.unstaged why=${String(cause.cause)}`),
            Option.none<StagedFilm>(),
          ),
        ),
        Effect.map((staged) => {
          const film = Option.getOrElse(
            Option.map(Place.decode(Places.studio, addressOn(host).href()), (v) => v.path.film),
            () => '',
          );
          return {
            default: () => (
              <Root film={film} host={host} hub={hub} client={client} staged={staged}>
                <Studio.Page />
              </Root>
            ),
          };
        }),
      ),
    );

/** Mount a film's studio page for `pages` (its films and their shorts), on the film its path names. */
export const mountFilmStudio = (pages: Films): void =>
  mountStudio({
    page: STUDIO_PAGE,
    event: 'studio.page',
    on: (host, fail) => studioPageOn(host, studioBody(pages, host, LabClient.layer, fail)),
  });
