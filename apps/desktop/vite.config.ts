import { agentTail } from 'vite-plugin-agent-tail';
import { defineConfig, loadEnv } from 'vite';
import solid from 'vite-plugin-solid';
import { Schema } from 'effect';
import { electronDev } from './scripts/vite-plugin-electron-dev.js';

// Renderer-process Vite config. The Electron main process is built separately
// (see scripts/build-main.ts). Renderer dev server runs on a fixed port that
// electron/main.ts loads in development.
//
// EGW credentials get baked into the bundle via `define`. We read the env
// file ourselves (no VITE_ prefix required) and substitute the typed
// `globalThis.__EGW_X__` member expressions that
// `@bible/core/egw/build-defines.ts` reads. Substitution targets must appear
// as literal `globalThis.__EGW_X__` reads in source; node-side hosts (where
// the global is never assigned) see `undefined` and fall through cleanly.
export default defineConfig(({ mode }) => {
  // loadEnv with the empty `''` prefix returns every key from the .env files
  // plus any matching process.env entries — so we don't need a separate
  // process.env fallback.
  const env = loadEnv(mode, process.cwd(), '');
  const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
  const bake = (key: string): string => encodeJson(env[key] ?? '');

  return {
    base: './',
    plugins: [
      agentTail({
        logDir: '../../tmp/logs',
        logFileName: 'desktop-renderer.log',
        excludes: ['[vite] connected.', '[vite] connecting...'],
      }),
      solid(),
      electronDev(),
    ],
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
      'globalThis.__EGW_AUTH_BASE_URL__': bake('EGW_AUTH_BASE_URL'),
      'globalThis.__EGW_API_BASE_URL__': bake('EGW_API_BASE_URL'),
      'globalThis.__EGW_CLIENT_ID__': bake('EGW_CLIENT_ID'),
      'globalThis.__EGW_CLIENT_SECRET__': bake('EGW_CLIENT_SECRET'),
      'globalThis.__EGW_SCOPE__': bake('EGW_SCOPE'),
      'globalThis.__EGW_USER_AGENT__': bake('EGW_USER_AGENT'),
    },
  };
});
