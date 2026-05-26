import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

// Component tests use Solid's SSR (`renderToString`) — no jsdom needed.
// `vite-plugin-solid` in `ssr` mode swaps the JSX runtime to the server one
// that emits strings. Pure .test.ts files (parser, services) keep using node.
export default defineConfig({
  plugins: [solid({ ssr: true })],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // ipc-cache tests need Solid's client build (createResource + createRoot
    // run standalone, no DOM, no SSR hydration context). They run via a
    // dedicated vitest config — see vitest.ipc-cache.config.ts.
    exclude: ['tests/ipc-cache/**', 'node_modules/**'],
  },
});
