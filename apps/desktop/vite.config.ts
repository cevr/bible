import { defineConfig, loadEnv } from 'vite';
import solid from 'vite-plugin-solid';
import { electronDev } from './scripts/vite-plugin-electron-dev.js';

// Renderer-process Vite config. The Electron main process is built separately
// (see scripts/build-main.ts). Renderer dev server runs on a fixed port that
// electron/main.ts loads in development.
//
// EGW credentials get baked into the bundle via `define`. We read the env
// file ourselves (no VITE_ prefix required) and substitute the typed
// `__EGW_X__` identifiers that `@bible/core/egw/build-defines.ts` declares.
// Substitution targets must appear as bare identifiers in source — that's
// why the helpers wrap each one in `typeof __X__ !== 'undefined' ? __X__ :
// undefined`, so node-side hosts (where the global is never declared) fall
// through cleanly.
export default defineConfig(({ mode }) => {
  // loadEnv with the empty `''` prefix returns every key from the .env files
  // plus any matching process.env entries — so we don't need a separate
  // process.env fallback.
  const env = loadEnv(mode, process.cwd(), '');
  const bake = (key: string): string => JSON.stringify(env[key] ?? '');

  return {
    plugins: [solid(), electronDev()],
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
    },
    build: {
      target: 'chrome120',
      outDir: 'dist/renderer',
      emptyOutDir: true,
    },
    define: {
      __EGW_AUTH_BASE_URL__: bake('EGW_AUTH_BASE_URL'),
      __EGW_API_BASE_URL__: bake('EGW_API_BASE_URL'),
      __EGW_CLIENT_ID__: bake('EGW_CLIENT_ID'),
      __EGW_CLIENT_SECRET__: bake('EGW_CLIENT_SECRET'),
      __EGW_SCOPE__: bake('EGW_SCOPE'),
      __EGW_USER_AGENT__: bake('EGW_USER_AGENT'),
    },
  };
});
