/**
 * Live Frame inspection for development: the dev server hands the page the
 * gateway's attach capability.
 *
 * The effect-frame gateway writes its attach capability to a mode-0600 file
 * in its state directory and never prints it. The page cannot read that
 * file, so this route reads it on each request (a restarted gateway rotates
 * it) and answers `{ url, token }` for `index.dev.tsx`. The route exists only
 * with `EGW_INSPECT=1` outside production; otherwise it is not mounted and
 * `/__inspect` falls through to the SPA like any unknown path.
 *
 * The attach capability only lets a root connect to the gateway. Reading a
 * snapshot takes the separate read capability, which never leaves the file.
 */

import { Effect, FileSystem, Layer, Option } from 'effect';
import { HttpRouter, HttpServerResponse } from 'effect/unstable/http';

export const inspectPath = '/__inspect';

export interface InspectConfig {
  /** The gateway the page dials. */
  readonly url: string;
  /** The gateway's state directory, which holds `attach-token`. */
  readonly stateDir: string;
}

type Env = Readonly<Partial<Record<string, string>>>;

const read = (env: Env, name: string): Option.Option<string> =>
  Option.filter(Option.fromNullishOr(env[name]), (value) => value.length > 0);

/** The gateway's default state directory, as the effect-frame CLI picks it. */
const defaultStateDir = (env: Env): Option.Option<string> =>
  Option.orElse(
    Option.map(
      Option.filter(read(env, 'XDG_STATE_HOME'), (dir) => dir.startsWith('/')),
      (dir) => `${dir}/effect-frame/inspect`,
    ),
    () =>
      Option.map(
        Option.filter(read(env, 'HOME'), (dir) => dir.startsWith('/')),
        (dir) => `${dir}/.local/state/effect-frame/inspect`,
      ),
  );

/** Inspection is offered only when asked for, and never in production. */
export const inspectConfig = (env: Env): Option.Option<InspectConfig> => {
  if (env['NODE_ENV'] === 'production' || env['EGW_INSPECT'] !== '1') {
    return Option.none();
  }
  return Option.map(
    Option.orElse(read(env, 'EGW_INSPECT_STATE_DIR'), () => defaultStateDir(env)),
    (stateDir) => ({
      stateDir,
      url: Option.getOrElse(read(env, 'EGW_INSPECT_GATEWAY'), () => 'ws://127.0.0.1:4318'),
    }),
  );
};

/** `GET /__inspect`: the current attach capability, or 404 with no gateway. */
export const inspectRoute = (config: InspectConfig) =>
  HttpRouter.use((router) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      yield* router.add('GET', inspectPath, () =>
        fs.readFileString(`${config.stateDir}/attach-token`).pipe(
          Effect.option,
          Effect.map((token) =>
            Option.match(token, {
              onNone: () => HttpServerResponse.empty({ status: 404 }),
              onSome: (value) =>
                HttpServerResponse.jsonUnsafe(
                  { url: config.url, token: value.trim() },
                  { headers: { 'cache-control': 'no-store' } },
                ),
            }),
          ),
        ),
      );
    }),
  );

/** The route when inspection is on, nothing otherwise. */
export const InspectRouteLive = (env: Env) =>
  Option.match(inspectConfig(env), {
    onNone: () => Layer.empty,
    onSome: inspectRoute,
  });
