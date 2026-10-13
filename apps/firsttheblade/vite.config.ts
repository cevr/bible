/**
 * Two builds from one config (the package's `build` script runs both):
 *
 * - the browser's: `src/client.tsx`, the phone menu's island and the site's
 *   stylesheet, into `dist/assets` with a manifest the prerender reads;
 * - the prerender's (`--ssr src/prerender.tsx`): the pages as Solid server
 *   code into `.prerender`, emitting the art they import, which the
 *   prerender copies into `dist/assets` beside the browser's files.
 */
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid({ ssr: true })],
  publicDir: 'public',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    manifest: true,
    ssrEmitAssets: true,
    assetsInlineLimit: 0,
    rollupOptions: { input: 'src/client.tsx' },
  },
});
