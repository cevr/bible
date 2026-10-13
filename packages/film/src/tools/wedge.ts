// A wedge (a printer's term: one strip printed at each of several grades, to
// choose one): a film drawn with a look at another level than the one it
// plays, its pick never written. The film's `palette.ts` is read as a pick of
// that level would write it (`editPick`, the very edit a pick makes) and
// swapped in only where the pages are built: the lab's warm pages for a look
// (`LabPage.wedge`, `tools/easel.ts`), and for a render (`film render
// --level`) the render page alone, built here and served on loopback for as
// long as the render runs, in place of the app's PreviewServer; `check
// --level` draws on that server too, and its `--draw` leg, which draws in
// this process, imports the film's module built with the swap
// (`wedge-module.ts`, kept apart: the lab reads this file, and imports no film).

import { Array as Arr, Context, Effect, FileSystem, Layer, Option, Path, Result } from 'effect';
import { HttpServer, HttpServerRequest, HttpServerResponse } from 'effect/http';
import { NetAddress } from 'effect/net';
import { BunHttpServer } from '@effect/platform-bun';
import { LookFailed, LookLevelUnknown, PagesBroken } from '../core/easel.ts';
import type { SourceRefused } from '../core/refusals.ts';
import { editPick, lookLevels, lookPlay } from './choice-source.ts';
import { PageBundler } from './lab-page.ts';
import { isNarrationUrl, narrationFile } from './narration-route.ts';
import { CACHE, urlPath } from './review-file.ts';

/** The module a film declares its looks in (`export const looks`), in its folder. */
export const PALETTE_FILE = 'palette.ts';

type Wedged = Result.Result<string, LookLevelUnknown | SourceRefused>;

/**
 * `source` (the palette at `file`) as a pick of each of `levels` would write
 * it, each look and level checked against the ones it declares.
 */
const wedgedPalette = (
  file: string,
  source: string,
  levels: Readonly<Record<string, string>>,
): Wedged =>
  Result.flatMap(lookLevels(file, source), (declared) =>
    Object.entries(levels).reduce<Wedged>(
      (text, [look, level]) =>
        Result.flatMap(text, (now): Wedged =>
          Option.match(Option.fromUndefinedOr(declared.get(look)), {
            onNone: (): Wedged =>
              Result.fail(
                LookLevelUnknown.make({
                  look,
                  level,
                  missing: 'look',
                  known: [...declared.keys()],
                }),
              ),
            onSome: (known): Wedged => {
              if (!known.includes(level))
                return Result.fail(LookLevelUnknown.make({ look, level, missing: 'level', known }));
              return editPick(file, now, lookPlay(look), level);
            },
          }),
        ),
      Result.succeed(source),
    ),
  );

/**
 * The files a wedge at `levels` reads as other text than they hold, by their
 * real path (the bundler names a file so): the film's palette (`file`, its
 * `PALETTE_FILE`) as the picks would write it, read through `fs`. None for no
 * levels; the file itself is only read.
 */
export const paletteSwaps = Effect.fn('wedge.paletteSwaps')(function* (
  fs: FileSystem.FileSystem,
  file: string,
  levels: Readonly<Record<string, string>>,
) {
  const entries = Object.entries(levels);
  if (!Arr.isArrayNonEmpty(entries)) return new Map<string, string>();
  if (!(yield* fs.exists(file).pipe(Effect.orElseSucceed(() => false)))) {
    const [look, level] = Arr.headNonEmpty(entries);
    return yield* LookLevelUnknown.make({ look, level, missing: 'look', known: [] });
  }
  const real = yield* fs.realPath(file).pipe(Effect.orElseSucceed(() => file));
  const source = yield* fs
    .readFileString(real)
    .pipe(Effect.mapError((error) => LookFailed.make({ reason: error.message })));
  const text = yield* Effect.fromResult(wedgedPalette(real, source, levels));
  return new Map([[real, text]]);
});

/** A narration file's media type, by its extension. */
const AUDIO = new Map([
  ['.flac', 'audio/flac'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.json', 'application/json'],
]);

const NOT_FOUND = HttpServerResponse.text('not found', { status: 404 });

/** The built file a request's path asks for: the root is the page itself, `html`. */
const builtPath = (pathname: string, html: string): string => {
  if (pathname === '/') return `/${html}`;
  return pathname;
};

/**
 * The render page `page` (the app's HTML entry, `LabPageSpec.pages.render`)
 * built with each file of `swaps` read as its text there, and served with
 * the films' narration (`films`) on loopback until the scope closes: the
 * server's root URL, which the renderer opens as it opens the PreviewServer's
 * (`/?film=<name>&export`). A build that fails, or that reads none of
 * `swaps`, is `PagesBroken`.
 */
const serveWedge = Effect.fn('wedge.serve')(function* (
  page: string,
  films: string,
  swaps: ReadonlyMap<string, string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = path.dirname(page);
  const made = yield* (yield* PageBundler)
    .bundle([page], root, { publicPath: '/', swaps, servers: [] })
    .pipe(Effect.mapError((failed) => PagesBroken.make({ reason: failed.reason })));
  const html = path.relative(root, page);
  const files = new Map(made.outputs.map(({ path: name, ...file }) => [`/${name}`, file]));
  const answer = Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const pathname = urlPath(request.url);
    if (isNarrationUrl(pathname)) {
      const found = yield* narrationFile(films, pathname).pipe(
        Effect.orElseSucceed(() => Option.none<string>()),
      );
      if (Option.isNone(found)) return NOT_FOUND;
      const bytes = yield* fs.readFile(found.value).pipe(Effect.option);
      return Option.match(bytes, {
        onNone: () => NOT_FOUND,
        onSome: (b) =>
          HttpServerResponse.uint8Array(b, {
            contentType: Option.getOrElse(
              Option.fromUndefinedOr(AUDIO.get(path.extname(found.value))),
              () => 'application/octet-stream',
            ),
            headers: { 'cache-control': CACHE.fresh },
          }),
      });
    }
    return Option.match(Option.fromUndefinedOr(files.get(builtPath(pathname, html))), {
      onNone: () => NOT_FOUND,
      onSome: (file) =>
        HttpServerResponse.uint8Array(file.bytes, {
          contentType: file.type,
          headers: { 'cache-control': CACHE.none },
        }),
    });
  });
  const server = Context.get(
    yield* Layer.build(BunHttpServer.layerServer({ hostname: '127.0.0.1', port: 0 })),
    HttpServer.HttpServer,
  );
  yield* server.serve(answer);
  const url = `${NetAddress.formatUrlUnsafe(server.address)}/`;
  yield* Effect.log(
    `render.wedge.served url=${url} files=${files.size} swaps=${[...swaps.keys()].map((f) => path.basename(f)).join(',')}`,
  );
  return url;
});

/**
 * The server a render draws on for `swaps`: a wedge's (`serveWedge`), held
 * for the scope, or none for no swaps, so the PreviewServer draws the
 * sources as written.
 */
export const wedgeServer = (page: string, films: string, swaps: ReadonlyMap<string, string>) => {
  if (swaps.size === 0) return Effect.succeedNone;
  return Effect.asSome(serveWedge(page, films, swaps));
};
