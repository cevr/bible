// The review's routes, served by `film review`: the handlers of the review
// API (`ReviewHttpApi` in `core/api.ts`): the index, each file where it lies
// (byte ranges answered 206, so a video seeks on a phone), its phone copy, a
// frame and a length; each film's options (`choices-http.ts`); and the lab's
// undo, redo and check for the film named. Every route names a file by its
// ref (`Review`), never a path on the box.
//
// The review runs for days, and Bun keeps a module as it first imported it,
// so its handlers run with no service that imports a film module
// (`ReviewContext`): a film is read, and its takes and voices kept, by the
// film CLI in a fresh process (`FreshFilm`), and a handler that reached for
// `FilmRepo` or `SoundLibrary` would not compile.
//
// The review is served on a host the owner reaches from a phone, so it
// answers only the hosts it is told (`FILM_REVIEW_HOSTS`, beside loopback),
// on every path, the app's page included: the gate in `api-server.ts` stands
// in front of all of it.

import type { FileSystem, Path } from 'effect';
import { Config, Effect, Layer, Option, Result } from 'effect';
import type { HttpPlatform, HttpServerRequest } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { REVIEW_FILES, REVIEW_PHONE, ReviewHttpApi } from '../core/api.ts';
import { PhoneCopyUnmade, ReviewFileUnknown } from '../core/refusals.ts';
import {
  type Allowed,
  FilmScope,
  type LabHandler,
  answered,
  serveApi,
  withServices,
} from './api-server.ts';
import { choicesGroup } from './choices-http.ts';
import type { Choices } from './choices.ts';
import type { FilmFolder } from './film-repo.ts';
import type { FreshFilm } from './fresh-film.ts';
import { projectGroup } from './project-http.ts';
import { serveFile } from './review-file.ts';
import { Review } from './review.ts';
import type { SourceWriter } from './source-writer.ts';
import { stepHandlers } from './steps-http.ts';

/** A file the page asks again for each time (a render is rewritten in place). */
const FRESH = 'no-cache';
/** A derived file: named by its source's path and mtime, so it never changes. */
const DERIVED = 'max-age=86400';

/** The ref a `/review/files/<ref>` URL names: its path after `prefix`, each segment decoded. */
export const refFromUrl = (url: string, prefix: string): Option.Option<string> => {
  const path = url.split('?')[0] ?? '';
  if (!path.startsWith(prefix)) return Option.none();
  return Result.getSuccess(
    Result.try(() => path.slice(prefix.length).split('/').map(decodeURIComponent).join('/')),
  );
};

/** The ref the request's path names after `prefix`, or ReviewFileUnknown naming the path. */
const refOf = (request: HttpServerRequest.HttpServerRequest, prefix: string) =>
  Effect.fromOption(refFromUrl(request.url, prefix)).pipe(
    Effect.mapError(() => ReviewFileUnknown.make({ ref: request.url.split('?')[0] ?? '' })),
  );

/** The review's own handlers. */
const reviewGroup = HttpApiBuilder.group(ReviewHttpApi, 'review', (handlers) =>
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
          return yield* serveFile(request, yield* (yield* Review).resolve(ref), FRESH);
        }),
      ),
    )
    .handle('phone', ({ request }) =>
      answered(
        Effect.gen(function* () {
          const ref = yield* refOf(request, REVIEW_PHONE);
          const copy = yield* (yield* Review).phone(ref);
          if (Option.isNone(copy)) return yield* PhoneCopyUnmade.make({ ref });
          return yield* serveFile(request, copy.value, DERIVED);
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
          return yield* serveFile(request, frame, DERIVED);
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
    ),
);

/** The lab's undo, redo and check, for the film named. */
const stepsGroup = HttpApiBuilder.group(ReviewHttpApi, 'steps', (handlers) =>
  handlers
    .handle('undo', stepHandlers.undo)
    .handle('redo', stepHandlers.redo)
    .handle('check', stepHandlers.check)
    .handle('steps', stepHandlers.steps),
);

/**
 * The hosts the review answers to beside loopback: `FILM_REVIEW_HOSTS`,
 * comma-separated Host values (`bite-cristian.exe.xyz:8229`); a page served
 * through one may write from `http://` or `https://` it.
 */
export const reviewAllowed = Config.String('FILM_REVIEW_HOSTS').pipe(
  Config.withDefault(''),
  Config.map((text): Allowed => ({
    hosts: text
      .split(',')
      .map((host) => host.trim())
      .filter((host) => host.length > 0),
  })),
);

/**
 * What the review's handlers run with: paths and files, the review's own
 * index and cache, the choices, the source writer and fresh runs of the film
 * CLI. None imports a film module or the app's sound library.
 */
export type ReviewContext =
  | Review
  | FileSystem.FileSystem
  | Path.Path
  | HttpPlatform.HttpPlatform
  | Choices
  | FilmFolder
  | SourceWriter
  | FreshFilm;

/**
 * The review's whole server as one web handler over the services the caller
 * runs with: every request passes the gate with `allowed` first, the page and
 * its assets included, so a foreign Host reads nothing; then the review's
 * routes answer theirs, and `page` (the app's page, its assets and whatever
 * else it serves) the rest. Closed with the scope.
 */
export const reviewHandler = Effect.fn('film.review.handler')(function* (
  allowed: Allowed,
  page: LabHandler,
) {
  const services = yield* Effect.context<ReviewContext>();
  const routes = HttpApiBuilder.layer(ReviewHttpApi).pipe(
    Layer.provide(Layer.mergeAll(reviewGroup, choicesGroup, projectGroup, stepsGroup)),
    withServices(services, yield* FilmScope.repo),
  );
  return yield* serveApi(ReviewHttpApi, routes, { allowed, page });
});
