import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://studies.bible.local',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  markdown: {
    smartypants: true,
  },
});
