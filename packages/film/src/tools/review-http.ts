// The renders' routes, served by `film lab` (`LabHttpApi` in `core/api.ts`):
// the index of every folder under the roots, each file where it lies (byte
// ranges answered 206, so a video seeks on a phone), its phone copy, a frame
// and a length, and a say on a version of a set. Every route names a file or
// a folder by its ref (`Review`), never a path on the box.

import { Effect, Option, Path, Result } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { REVIEW_FILES, REVIEW_PHONE, LabHttpApi } from '../core/api.ts';
import type { Project } from '../core/catalogue.ts';
import { PhoneCopyUnmade, ReviewFileUnknown } from '../core/refusals.ts';
import { answered } from './api-server.ts';
import { FilmFolder } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { CACHE, serveFile, urlPath } from './review-file.ts';
import { type ProjectRead, Review } from './review.ts';

/** The ref a `/api/review/files/<ref>` URL names: its path after `prefix`, each segment decoded. */
export const refFromUrl = (url: string, prefix: string): Option.Option<string> => {
  const path = urlPath(url);
  if (!path.startsWith(prefix)) return Option.none();
  return Result.getSuccess(
    Result.try(() => path.slice(prefix.length).split('/').map(decodeURIComponent).join('/')),
  );
};

/** The ref the request's path names after `prefix`, or ReviewFileUnknown naming the path. */
const refOf = (request: HttpServerRequest.HttpServerRequest, prefix: string) =>
  Effect.fromOption(refFromUrl(request.url, prefix)).pipe(
    Effect.mapError(() => ReviewFileUnknown.make({ ref: urlPath(request.url) })),
  );

/** The review's own handlers. */
export const reviewGroup = HttpApiBuilder.group(LabHttpApi, 'review', (handlers) =>
  handlers
    .handle('index', ({ query }) =>
      answered(
        Effect.flatMap(Review, (review) =>
          review.index(Option.isSome(Option.fromUndefinedOr(query.fresh))),
        ),
      ),
    )
    .handle('file', ({ request }) =>
      answered(
        Effect.gen(function* () {
          const ref = yield* refOf(request, REVIEW_FILES);
          // A render is rewritten in place: asked again each time.
          return yield* serveFile(request, yield* (yield* Review).resolve(ref), CACHE.fresh);
        }),
      ),
    )
    .handle('phone', ({ request }) =>
      answered(
        Effect.gen(function* () {
          const ref = yield* refOf(request, REVIEW_PHONE);
          const copy = yield* (yield* Review).phone(ref);
          if (Option.isNone(copy)) return yield* PhoneCopyUnmade.make({ ref });
          // Named by its render's ref, not the render's version: asked again each time, as the render is.
          return yield* serveFile(request, copy.value, CACHE.fresh);
        }),
      ),
    )
    .handle('frame', ({ query, request }) =>
      answered(
        Effect.gen(function* () {
          const frame = yield* (yield* Review).frame(
            query.ref,
            Option.fromUndefinedOr(query.t),
            query.w ?? 960,
          );
          // Named by its render's ref, a time and a width, not the render's version: asked again each time.
          return yield* serveFile(request, frame, CACHE.fresh);
        }),
      ),
    )
    .handle('duration', ({ query }) =>
      answered(
        Effect.map(
          Effect.flatMap(Review, (review) => review.duration(query.ref)),
          (seconds) => ({ seconds }),
        ),
      ),
    )
    .handle('say', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const review = yield* Review;
          const fresh = yield* FreshFilm;
          const folders = yield* FilmFolder;
          const path = yield* Path.Path;
          // An approve is judged by the film's sources now, read in a fresh process: only for a
          // folder that is this checkout's own for the film, the one whose sources are here.
          const project: ProjectRead = (film, out) =>
            Effect.gen(function* () {
              if (path.resolve(folders.paths(film).out) !== path.resolve(out))
                return Option.none<Project>();
              return Option.some(yield* fresh.project([film, '--json']));
            }).pipe(Effect.mapError((failure) => failure.message));
          return yield* review.say(params.folder, params.point, payload, project);
        }),
      ),
    ),
);
