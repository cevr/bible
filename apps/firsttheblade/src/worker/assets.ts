/**
 * The site's built files (`dist/`), as the one thing the Worker's policy
 * needs from its host: a request in, the file's response out. On Cloudflare
 * it is the Worker's static-assets binding (`./Site.ts`); on a laptop it is
 * the directory itself (`./preview.ts`); in the tests it is a map.
 *
 * `serve` answers as Cloudflare's asset layer does under
 * `htmlHandling: 'auto-trailing-slash'`: `/about` serves `about.html`, `/`
 * serves `index.html`, and a path that names no file answers 404.
 */
import { Context, Effect, FileSystem, Layer, Option, Path } from 'effect';
import { HttpServerRequest, HttpServerResponse, Mime } from 'effect/http';

export interface AssetsService {
  readonly serve: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse>;
}

export class Assets extends Context.Service<Assets, AssetsService>()('firsttheblade/Assets') {}

/**
 * A request's URL. The host hands a request its path and query (`/a?b`),
 * read here after a placeholder origin, so a path that starts `//` stays a
 * path and never names a host; a whole URL is read as it is.
 */
export const requestUrl = (request: HttpServerRequest.HttpServerRequest) => {
  if (request.url.startsWith('/')) return new URL(`http://localhost${request.url}`);
  return new URL(request.url);
};

/** A request for the page at `path`, on the host `request` came to: how a route answers with a page the prerender wrote. */
export const pageRequest = (request: HttpServerRequest.HttpServerRequest, path: string) =>
  HttpServerRequest.fromWeb(new Request(new URL(path, request.originalUrl)));

/** A path whose last segment has an extension names a file, whatever its type. */
const FILE = /\.[^/.]+$/;

/** A file's type: the Mime table's, and the icon's, which the table does not know (as Cloudflare's asset layer serves it). */
const contentTypeOf = (file: string) => {
  if (file.endsWith('.ico')) return 'image/x-icon';
  return Option.getOrElse(Mime.getType(file), () => 'application/octet-stream');
};

/** The files a path may name, in the order the asset layer tries them. */
export const candidates = (pathname: string): ReadonlyArray<string> => {
  if (pathname.endsWith('/')) return [`${pathname}index.html`];
  if (FILE.test(pathname)) return [pathname];
  return [`${pathname}.html`, `${pathname}/index.html`];
};

/**
 * The directory as the asset layer serves it, for `bun run preview`: the
 * same lookups, read from disk.
 */
export const layerDirectory = (root: string) =>
  Layer.effect(
    Assets,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const base = path.resolve(root);

      const read = (file: string) =>
        fs.readFile(path.join(base, file)).pipe(
          Effect.map((bytes) =>
            HttpServerResponse.uint8Array(bytes, {
              contentType: contentTypeOf(file),
            }),
          ),
          Effect.option,
        );

      const serve = Effect.fn('Assets.serve')(function* (
        request: HttpServerRequest.HttpServerRequest,
      ) {
        const notFound = HttpServerResponse.text('Not Found', { status: 404 });
        const pathname = requestUrl(request).pathname;
        if (!path.resolve(base, `.${pathname}`).startsWith(base)) return notFound;
        for (const file of candidates(pathname)) {
          const found = yield* read(file);
          if (Option.isSome(found)) return found.value;
        }
        return notFound;
      });

      return Assets.of({ serve });
    }),
  );
