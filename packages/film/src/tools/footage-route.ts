// The footage route, `/footage/<name>/<sha12>/<copy>.mp4` (`footageHref`),
// for the render's server (the app's player, which the export decodes the
// mezzanine through) and the lab's (which plays the proxy) alike: which file
// a URL names, and the answer. The name is one the footage library's lock
// lists now (read per request, so a take imported while a server runs is
// served), the hash the head of its original's, the copy one `film footage
// make` makes, and the copy on disk under the outputs folder; never a path,
// never a dotfile. Any other URL under `/footage/` names none, a 404. A copy
// is answered whole or by the byte range asked (206), as a decoder seeks it;
// it is remade in place when its recipe changes, so the browser asks again
// on every load. A talk's page reads its takes through the route too: the
// lock (`/footage/library.lock.json`) and each transcript the lock names now
// (`/footage/transcripts/<file>`), never another file under the library.

import { BunHttpPlatform, BunServices } from '@effect/platform-bun';
import { Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { HttpEffect, HttpServerRequest, HttpServerResponse } from 'effect/http';
import {
  derivedFile,
  FOOTAGE_COPIES,
  FOOTAGE_LOCK_HREF,
  FootageLockJson,
  isTranscriptFile,
} from '../core/footage.ts';
import { CACHE, serveFile } from './review-file.ts';

/** Where a server finds footage: the library (`dir`, its lock) and the outputs folder its copies are made under (`out`). */
export interface FootageRoot {
  readonly dir: string;
  readonly out: string;
}

/** The route's own URLs: everything under `/footage/`. */
const FOOTAGE_PREFIX = '/footage/';

/** A copy's URL: a footage name, the head of its original's hash, and the copy. */
const FOOTAGE_URL = /^\/footage\/([a-z0-9][a-z0-9.-]*)\/([0-9a-f]{12})\/(mezzanine|proxy)\.mp4$/;

const isCopy = Schema.is(Schema.Literals(FOOTAGE_COPIES));

/** The name, hash head and copy a footage URL names, when it is a copy's. */
const named = (pathname: string) =>
  Option.flatMap(Option.fromNullishOr(FOOTAGE_URL.exec(pathname)), ([, name, sha12, copy]) =>
    Option.all({
      name: Option.fromUndefinedOr(name),
      sha12: Option.fromUndefinedOr(sha12),
      copy: Option.filter(Option.fromUndefinedOr(copy), isCopy),
    }),
  );

/** Whether `pathname` is the footage route's, and no page's: `/footage/…`. */
export const isFootageUrl = (pathname: string): boolean => pathname.startsWith(FOOTAGE_PREFIX);

const NOT_FOUND = HttpServerResponse.text('not found', {
  status: 404,
  headers: { 'cache-control': CACHE.none },
});

/** The library's lock as it stands, or none (no library yet, or one that does not read). */
const lockOf = (dir: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    return yield* fs
      .readFileString(path.join(dir, 'library.lock.json'))
      .pipe(Effect.flatMap(Schema.decodeEffect(FootageLockJson)), Effect.option);
  });

/** A transcript's URL: `/footage/transcripts/<file>`. */
const TRANSCRIPT_URL = /^\/footage\/transcripts\/([^/]+)$/;

/**
 * The library file `pathname` names, if the route serves it: the lock, or a
 * transcript the lock names now (one path segment, `isTranscriptFile`),
 * on disk.
 */
const libraryFile = Effect.fn('libraryFile')(function* (root: FootageRoot, pathname: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const onDisk = (file: string) =>
    Effect.map(fs.exists(file).pipe(Effect.orElseSucceed(() => false)), (there) =>
      Option.liftPredicate(file, () => there),
    );
  if (pathname === FOOTAGE_LOCK_HREF)
    return yield* onDisk(path.join(root.dir, 'library.lock.json'));
  const asked = Option.flatMap(Option.fromNullishOr(TRANSCRIPT_URL.exec(pathname)), (m) =>
    Option.fromUndefinedOr(m[1]),
  );
  for (const file of Option.toArray(asked))
    for (const lock of Option.toArray(yield* lockOf(root.dir))) {
      const listed = Object.values(lock.footage).some((entry) => entry.transcript === file);
      if (listed && isTranscriptFile(file))
        return yield* onDisk(path.join(root.dir, 'transcripts', file));
    }
  return Option.none<string>();
});

/** The copy `pathname` names under `root`, if it is one the route serves: listed, made and on disk. */
const footageFile = Effect.fn('footageFile')(function* (root: FootageRoot, pathname: string) {
  const fs = yield* FileSystem.FileSystem;
  const library = yield* libraryFile(root, pathname);
  if (Option.isSome(library)) return library;
  for (const { name, sha12, copy } of Option.toArray(named(pathname)))
    for (const lock of Option.toArray(yield* lockOf(root.dir)))
      for (const entry of Option.toArray(Option.fromUndefinedOr(lock.footage[name]))) {
        if (!entry.sha256.startsWith(sha12)) continue;
        const file = derivedFile(root.out, name, entry.sha256, `${copy}.mp4`);
        if (yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))
          return Option.some(file);
      }
  return Option.none<string>();
});

/** The answer to `request` for the footage URL `pathname`: its copy, whole or by range, else a 404. */
export const footageResponse = (
  root: FootageRoot,
  request: HttpServerRequest.HttpServerRequest,
  pathname: string,
) =>
  footageFile(root, pathname).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed(NOT_FOUND),
        onSome: (file) => serveFile(request, file, CACHE.fresh),
      }),
    ),
    Effect.catchTags({
      ReviewFileUnknown: () => Effect.succeed(NOT_FOUND),
      PlatformError: (error) =>
        Effect.as(Effect.logWarning(`footage.route.failed ${error.message}`), NOT_FOUND),
    }),
  );

/** The disk and the HTTP platform the route answers through in Bun. */
const RouteServices = BunHttpPlatform.layer.pipe(Layer.provideMerge(BunServices.layer));

/**
 * The route as a web handler, for a server that is not an Effect one (the
 * app's player, `Bun.serve`): a request for a footage URL answered as
 * `footageResponse` answers it.
 */
export const footageHandler = (root: FootageRoot): ((request: Request) => Promise<Response>) => {
  const handle = HttpEffect.toWebHandler(
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      return yield* footageResponse(root, request, new URL(request.url, 'http://player').pathname);
    }).pipe(Effect.provide(RouteServices)),
  );
  return (request) => handle(request);
};
