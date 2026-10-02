// A file on the box answered as a request asks for it: whole, or the byte
// range it names (206, so a video seeks on a phone), with its cache policy.
// The review's files, the options' mixes and takes, the studio's attempts
// and the notes' stills are served this way.

import { Effect } from 'effect';
import { HttpServerRequest, HttpStaticServer } from 'effect/http';
import { ReviewFileUnknown } from '../core/refusals.ts';

/**
 * What the static server's own table lacks among the files the review serves:
 * a mix (m4a; a phone's Safari will not play `application/octet-stream`) and
 * a caption file.
 */
const MIME_TYPES = { m4a: 'audio/mp4', vtt: 'text/vtt; charset=utf-8' };

/**
 * The cache policy of a file that never changes under its URL: a take or an
 * attempt (named by its hash), a note's still (by its number).
 */
export const IMMUTABLE = 'max-age=86400';

/**
 * The file at `file` as `request` asks for it. A file gone since it resolved
 * is a ReviewFileUnknown naming the path the request asked for, never the
 * file's place on the box.
 */
export const serveFile = Effect.fn('review.serveFile')(function* (
  request: HttpServerRequest.HttpServerRequest,
  file: string,
  cacheControl: string,
) {
  const serve = yield* HttpStaticServer.make({ root: '/', cacheControl, mimeTypes: MIME_TYPES });
  const url = file
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return yield* serve.pipe(
    Effect.provideService(HttpServerRequest.HttpServerRequest, request.modify({ url })),
    Effect.catchTag('HttpServerError', () =>
      Effect.fail(ReviewFileUnknown.make({ ref: request.url.split('?')[0] ?? '' })),
    ),
  );
});
