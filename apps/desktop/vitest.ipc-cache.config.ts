import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// ipc-cache tests exercise Solid's *reactive* runtime (createRoot, createResource,
// onCleanup) but NOT its DOM renderer — those primitives work standalone in Node.
// The default Node export of solid-js points at the server build (which expects
// an SSR hydration context); we alias straight to the client build the renderer
// actually ships. resolve.conditions alone doesn't override package exports in
// vitest 2.x, so we resolve the statically installed workspace package explicitly.
const solidClientPath = fileURLToPath(
  new URL('./node_modules/solid-js/dist/solid.js', import.meta.url),
);

export default defineConfig({
  resolve: {
    alias: [{ find: /^solid-js$/, replacement: solidClientPath }],
  },
  test: {
    environment: 'node',
    include: ['tests/ipc-cache/**/*.test.ts'],
  },
});
