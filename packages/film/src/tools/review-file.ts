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
 * The cache policies the lab answers a file with, by how it changes under
 * its URL: `fresh`, asked again on every load (a render or a mix rewritten
 * in place, a film's narration); `derived`, named by what it is made of (a
 * take or an attempt by its hash, a note's still by its number, a phone
 * copy or a frame by its source's path and mtime), kept a day; `hashed`, a
 * build's script or style named by its own bytes' hash, kept a year,
 * immutable.
 */
export const CACHE = {
  fresh: 'no-cache',
  derived: 'max-age=86400',
  hashed: 'max-age=31536000, immutable',
} as const;

/** The path a request's `url` asks for, without its query. */
export const urlPath = (url: string): string => url.split('?')[0] ?? '';

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
      Effect.fail(ReviewFileUnknown.make({ ref: urlPath(request.url) })),
    ),
  );
});
