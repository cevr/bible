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
import { type HttpServerRequest, HttpServerResponse, Mime } from 'effect/http';

export interface AssetsService {
  readonly serve: (
    request: HttpServerRequest.HttpServerRequest,
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse>;
}

export class Assets extends Context.Service<Assets, AssetsService>()('firsttheblade/Assets') {}

/** The files a path may name, in the order the asset layer tries them. */
export const candidates = (pathname: string): ReadonlyArray<string> => {
  if (pathname.endsWith('/')) return [`${pathname}index.html`];
  if (Option.isSome(Mime.getType(pathname))) return [pathname];
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
              contentType: Option.getOrElse(Mime.getType(file), () => 'application/octet-stream'),
            }),
          ),
          Effect.option,
        );

      const serve = Effect.fn('Assets.serve')(function* (
        request: HttpServerRequest.HttpServerRequest,
      ) {
        const notFound = HttpServerResponse.text('Not Found', { status: 404 });
        const pathname = new URL(request.url, 'http://localhost').pathname;
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
