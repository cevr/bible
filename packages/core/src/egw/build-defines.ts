/**
 * Compile-time substitution targets for EGW credentials/config.
 *
 * The renderer (Vite + esbuild) replaces the `globalThis.__EGW_X__` member
 * expressions below with string literals at build time (see the `define`
 * block in apps/desktop/vite.config.ts) so the packaged binary carries
 * credentials without needing a runtime .env file. In Node-hosted runs (CLI,
 * sync workers, tests) the globals are never defined, so the property reads
 * yield `undefined` and we fall through to `process.env` — Bun auto-loads the
 * sibling `.env`, so node-side code keeps working unchanged.
 *
 * IMPORTANT: keep every read as a literal `globalThis.__EGW_X__` member
 * expression. Bundlers must see that exact source text to substitute.
 * Indirection (helpers, destructuring, renames) breaks the substitution.
 */

import { Option } from 'effect';

declare global {
  /** Populated by bundler `define`s; absent (undefined) in Node-hosted runs. */
  // eslint-disable-next-line no-var
  var __EGW_AUTH_BASE_URL__: string;
  // eslint-disable-next-line no-var
  var __EGW_API_BASE_URL__: string;
  // eslint-disable-next-line no-var
  var __EGW_CLIENT_ID__: string;
  // eslint-disable-next-line no-var
  var __EGW_CLIENT_SECRET__: string;
  // eslint-disable-next-line no-var
  var __EGW_SCOPE__: string;
  // eslint-disable-next-line no-var
  var __EGW_USER_AGENT__: string;
}

// Vite's `define` substitutes empty strings for keys that aren't in `.env`
// (we `JSON.stringify(env[key] ?? '')` in vite.config.ts). Treat empty as
// absent so `Option.orElse` fallbacks actually fire — a bare `""` was
// silently sending OAuth requests to the dev-server origin and 404-ing.
const nonEmpty = (value: string): Option.Option<string> => {
  if (value === '') return Option.none();
  return Option.some(value);
};

const baked = (value: string): Option.Option<string> =>
  Option.fromNullishOr(value).pipe(Option.flatMap(nonEmpty));

// Safe `process.env` lookup. `process` is not defined in the renderer; the
// `globalThis.process` property read yields `undefined` there instead of the
// ReferenceError a bare `process.env[...]` read would throw. Use this
// anywhere the node-side fallback is wanted.
// The `node/no-process-env` rule fires here by design, so the read carries an
// inline disable.
export const envVar = (key: string): Option.Option<string> =>
  Option.fromNullishOr(globalThis.process).pipe(
    // eslint-disable-next-line node/no-process-env
    Option.flatMap((proc) => Option.fromNullishOr(proc.env[key])),
    Option.flatMap(nonEmpty),
  );

export const bakedAuthBaseUrl = (): Option.Option<string> =>
  baked(globalThis.__EGW_AUTH_BASE_URL__);

export const bakedApiBaseUrl = (): Option.Option<string> => baked(globalThis.__EGW_API_BASE_URL__);

export const bakedClientId = (): Option.Option<string> => baked(globalThis.__EGW_CLIENT_ID__);

export const bakedClientSecret = (): Option.Option<string> =>
  baked(globalThis.__EGW_CLIENT_SECRET__);

export const bakedScope = (): Option.Option<string> => baked(globalThis.__EGW_SCOPE__);

export const bakedUserAgent = (): Option.Option<string> => baked(globalThis.__EGW_USER_AGENT__);
