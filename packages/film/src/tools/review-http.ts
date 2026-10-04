// The renders' routes, served by `film lab` (`LabHttpApi` in `core/api.ts`):
// the index of every folder under the roots, each file where it lies (byte
// ranges answered 206, so a video seeks on a phone), its phone copy, a frame
// and a length, and a say on a version of a set. Every route names a file or
// a folder by its ref (`Review`), never a path on the box.

import { Effect, Option, Result } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { REVIEW_FILES, REVIEW_PHONE, LabHttpApi } from '../core/api.ts';
import { PhoneCopyUnmade, ReviewFileUnknown } from '../core/refusals.ts';
import { answered } from './api-server.ts';
import { serveFile } from './review-file.ts';
import { Review } from './review.ts';

/** A file the page asks again for each time (a render is rewritten in place). */
const FRESH = 'no-cache';
/** A derived file: named by its source's path and mtime, so it never changes. */
const DERIVED = 'max-age=86400';

/** The ref a `/api/review/files/<ref>` URL names: its path after `prefix`, each segment decoded. */
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
    )
    .handle('say', ({ params, payload }) =>
      answered(
        Effect.flatMap(Review, (review) => review.say(params.folder, params.point, payload)),
      ),
    ),
);
