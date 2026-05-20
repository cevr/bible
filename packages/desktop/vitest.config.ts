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
  },
});
