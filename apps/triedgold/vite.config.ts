import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
    // The production server runs the build on Node (Railway) and on Bun (the
    // local `start`). `react-dom/server` resolves to its Bun build under Bun,
    // which has no `renderToPipeableStream`; the Node build runs on both.
    alias: { 'react-dom/server': 'react-dom/server.node' },
  },
});
