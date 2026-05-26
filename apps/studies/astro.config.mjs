import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://studies.cvr.im',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  markdown: {
    smartypants: true,
  },
  server: {
    allowedHosts: true,
  },
});
