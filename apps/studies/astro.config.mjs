import { defineConfig } from 'astro/config';

import bun from './adapter/index.ts';

export default defineConfig({
  site: 'https://studies.cvr.im',
  trailingSlash: 'always',
  // `output: 'static'` (default) keeps every page prerendered; on-demand routes
  // (e.g. the grading endpoint) opt out with `export const prerender = false`.
  // The in-house bun adapter serves the prerendered output and renders the
  // on-demand routes. See docs/adr/0002.
  adapter: bun(),
  build: {
    format: 'directory',
  },
  server: {
    allowedHosts: true,
  },
});
