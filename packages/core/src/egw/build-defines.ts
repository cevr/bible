/**
 * Compile-time substitution targets for EGW credentials/config.
 *
 * The renderer (Vite + esbuild) replaces these identifiers with string
 * literals at build time so the packaged binary carries credentials without
 * needing a runtime .env file. In Node-hosted runs (CLI, sync workers, tests)
 * the identifiers are never declared, so the `typeof` guard returns
 * `'undefined'` and we fall through to `process.env` — Bun auto-loads the
 * sibling `.env`, so node-side code keeps working unchanged.
 *
 * IMPORTANT: keep all reads here as bare `typeof __X__ !== 'undefined' ? __X__
 * : undefined` ternaries. Bundlers must see the literal identifier on both
 * sides to substitute. Indirection (helpers, destructuring, renames) breaks
 * the substitution.
 */

declare const __EGW_AUTH_BASE_URL__: string | undefined;
declare const __EGW_API_BASE_URL__: string | undefined;
declare const __EGW_CLIENT_ID__: string | undefined;
declare const __EGW_CLIENT_SECRET__: string | undefined;
declare const __EGW_SCOPE__: string | undefined;
declare const __EGW_USER_AGENT__: string | undefined;

// Vite's `define` substitutes empty strings for keys that aren't in `.env`
// (we `JSON.stringify(env[key] ?? '')` in vite.config.ts). Treat empty as
// undefined so `bakedX() ?? fallback` actually falls through — nullish
// coalescing doesn't fire for `""`, which was silently sending OAuth requests
// to the dev-server origin and 404-ing.
const orUndefined = (value: string | undefined): string | undefined =>
  value === undefined || value === '' ? undefined : value;

// Safe `process.env` lookup. `process` is not defined in the renderer; a bare
// `process.env[...]` read throws ReferenceError there. Use this anywhere the
// node-side fallback is wanted.
// This helper centralizes the node-side env fallback that bundled-renderer
// callers can't (and shouldn't) reach — the `node/no-process-env` rule fires
// here by design, so both reads carry inline disables.
export const envVar = (key: string): string | undefined => {
  // eslint-disable-next-line node/no-process-env
  if (typeof process === 'undefined' || !process.env) return undefined;
  // eslint-disable-next-line node/no-process-env
  const value = process.env[key];
  return value === undefined || value === '' ? undefined : value;
};

export const bakedAuthBaseUrl = (): string | undefined =>
  orUndefined(typeof __EGW_AUTH_BASE_URL__ !== 'undefined' ? __EGW_AUTH_BASE_URL__ : undefined);

export const bakedApiBaseUrl = (): string | undefined =>
  orUndefined(typeof __EGW_API_BASE_URL__ !== 'undefined' ? __EGW_API_BASE_URL__ : undefined);

export const bakedClientId = (): string | undefined =>
  orUndefined(typeof __EGW_CLIENT_ID__ !== 'undefined' ? __EGW_CLIENT_ID__ : undefined);

export const bakedClientSecret = (): string | undefined =>
  orUndefined(typeof __EGW_CLIENT_SECRET__ !== 'undefined' ? __EGW_CLIENT_SECRET__ : undefined);

export const bakedScope = (): string | undefined =>
  orUndefined(typeof __EGW_SCOPE__ !== 'undefined' ? __EGW_SCOPE__ : undefined);

export const bakedUserAgent = (): string | undefined =>
  orUndefined(typeof __EGW_USER_AGENT__ !== 'undefined' ? __EGW_USER_AGENT__ : undefined);
