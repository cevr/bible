// The review's HTTP routes, served by `film review` (and beside the lab): the
// index, each file where it lies (byte ranges answered 206, so a video seeks
// on a phone), its phone copy, a frame and a length. Every route names a file
// by its ref (`Review`), never a path on the box.
//
//   GET /review/index[?fresh]                   every folder with something to review (ReviewIndex)
//   GET /review/files/<ref>                     the file, ranges answered
//   GET /review/phone/<ref>                     its 720p phone copy, once made (404 before)
//   GET /review/frame?ref=&t=&w=                a JPEG of the video at t s (10% in without), w px wide
//   GET /review/duration?ref=                   the video's length (ReviewDuration)
//
// The review is served on a host the owner reaches from a phone, so it
// answers only the hosts it is told (`FILM_REVIEW_HOSTS`, beside loopback),
// and a write (a pick, `choices.ts`) must come from one of them, same-origin,
// as JSON (`admit`).

import type { FileSystem, Path } from 'effect';
import { Config, Effect, Layer, Option, Result, Schema } from 'effect';
import type { HttpPlatform } from 'effect/unstable/http';
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
  HttpStaticServer,
} from 'effect/unstable/http';
import { REVIEW_FILES, REVIEW_PHONE, ReviewDuration, ReviewIndex } from '../core/schema.ts';
import { choiceRoutes } from './choices-http.ts';
import type { Choices } from './choices.ts';
import type { FilmRepo } from './film-repo.ts';
import { type Allowed, type LabHandler, admit, refuse, statusOf as labStatusOf } from './lab.ts';
import type { SourceWriter } from './source-writer.ts';
import type { StaticCheck } from './static-check.ts';
import { Review } from './review.ts';

const FrameQuery = Schema.Struct({
  ref: Schema.String,
  t: Schema.OptionFromOptionalKey(Schema.FiniteFromString),
  w: Schema.OptionFromOptionalKey(Schema.FiniteFromString),
});
const RefQuery = Schema.Struct({ ref: Schema.String });
const IndexQuery = Schema.Struct({ fresh: Schema.OptionFromOptionalKey(Schema.String) });

const indexJson = HttpServerResponse.schemaJson(ReviewIndex);
const durationJson = HttpServerResponse.schemaJson(ReviewDuration);

/** A file the page asks again for each time (a render is rewritten in place). */
export const FRESH = 'no-cache';
/** A derived file: named by its source's path and mtime, so it never changes. */
export const DERIVED = 'max-age=86400';

/** The ref a `/review/files/<ref>` URL names: its path after `prefix`, each segment decoded. */
export const refFromUrl = (url: string, prefix: string): Option.Option<string> => {
  const path = url.split('?')[0] ?? '';
  if (!path.startsWith(prefix)) return Option.none();
  return Result.getSuccess(
    Result.try(() => path.slice(prefix.length).split('/').map(decodeURIComponent).join('/')),
  );
};

/** The file at `file` as the request asks for it: whole, or the range it names (206). */
export const serveFile = Effect.fn('review.serveFile')(function* (
  file: string,
  cacheControl: string,
) {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const serve = yield* HttpStaticServer.make({ root: '/', cacheControl });
  const url = file
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return yield* serve.pipe(
    Effect.provideService(HttpServerRequest.HttpServerRequest, request.modify({ url })),
  );
});

/**
 * The status a failure answers with: a ref naming nothing 404 (the static
 * server's own `HttpServerError` too: a file gone since it resolved), a bad
 * query 400, a frame or length ffmpeg could not make 502; a film route's
 * failures as the lab answers them (`lab.ts`).
 */
const statusOf = (tag: string) => {
  if (tag === 'ReviewFileUnknown' || tag === 'HttpServerError') return 404;
  if (tag === 'SchemaError') return 400;
  if (tag === 'ReviewToolFailed') return 502;
  return labStatusOf(tag);
};

/** Answer every failure a route can have with its status and message, logged. */
export const answered = <E extends { readonly _tag: string; readonly message: string }, R>(
  route: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  route.pipe(
    Effect.catch((error) => {
      const status = statusOf(error._tag);
      return Effect.logWarning(
        `review.request.failed tag=${error._tag} status=${status} reason="${error.message}"`,
      ).pipe(Effect.as(HttpServerResponse.text(`${error._tag}: ${error.message}`, { status })));
    }),
  );

/** A route over the ref its path names after `prefix` (a 404 when it names none), answered. */
const byRef = <E extends { readonly _tag: string; readonly message: string }, R>(
  prefix: string,
  answer: (ref: string) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  answered(
    Effect.flatMap(HttpServerRequest.HttpServerRequest, (request) =>
      Option.match(refFromUrl(request.url, prefix), {
        onNone: () => Effect.succeed(HttpServerResponse.text('no such file', { status: 404 })),
        onSome: answer,
      }),
    ),
  );

/** The routes over the review's roots. */
export const reviewRoutes = HttpRouter.addAll([
  HttpRouter.route(
    'GET',
    '/review/index',
    answered(
      Effect.gen(function* () {
        const query = yield* HttpServerRequest.schemaSearchParams(IndexQuery);
        return yield* indexJson(yield* (yield* Review).index(Option.isSome(query.fresh)));
      }),
    ),
  ),
  HttpRouter.route(
    'GET',
    `${REVIEW_FILES}*`,
    byRef(REVIEW_FILES, (ref) =>
      Effect.flatMap(Review, (review) =>
        Effect.flatMap(review.resolve(ref), (file) => serveFile(file, FRESH)),
      ),
    ),
  ),
  HttpRouter.route(
    'GET',
    `${REVIEW_PHONE}*`,
    byRef(REVIEW_PHONE, (ref) =>
      Effect.flatMap(Review, (review) =>
        Effect.flatMap(review.phone(ref), (copy) =>
          Option.match(copy, {
            onNone: () => Effect.succeed(HttpServerResponse.text('not made yet', { status: 404 })),
            onSome: (file) => serveFile(file, DERIVED),
          }),
        ),
      ),
    ),
  ),
  HttpRouter.route(
    'GET',
    '/review/frame',
    answered(
      Effect.gen(function* () {
        const query = yield* HttpServerRequest.schemaSearchParams(FrameQuery);
        const width = Option.getOrElse(query.w, () => 960);
        const frame = yield* (yield* Review).frame(query.ref, query.t, width);
        return yield* serveFile(frame, DERIVED);
      }),
    ),
  ),
  HttpRouter.route(
    'GET',
    '/review/duration',
    answered(
      Effect.gen(function* () {
        const query = yield* HttpServerRequest.schemaSearchParams(RefQuery);
        return yield* durationJson({ seconds: yield* (yield* Review).duration(query.ref) });
      }),
    ),
  ),
]);

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
 * The review's routes as a web handler over the services the caller runs
 * with, answering only what `admit` lets through with `allowed`; closed with
 * the scope.
 */
export const reviewHandler = Effect.fn('film.review.handler')(function* (allowed: Allowed) {
  const services = yield* Effect.context<
    | Review
    | FileSystem.FileSystem
    | Path.Path
    | HttpPlatform.HttpPlatform
    | Choices
    | FilmRepo
    | SourceWriter
    | StaticCheck
  >();
  const { handler } = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(Layer.mergeAll(reviewRoutes, choiceRoutes(answered, serveFile)), {
        disableLogger: true,
      }),
    ),
    (web) => Effect.promise(() => web.dispose()),
  );
  const review: LabHandler = (request, server) =>
    Option.match(admit(request, server, allowed), {
      onNone: () => handler(request, services),
      onSome: (refusal) => refuse(services, request, refusal),
    });
  return review;
});
