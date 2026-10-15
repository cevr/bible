import type { Config } from '@react-router/dev/config';

import { posts } from './app/content/posts.ts';

// Every known page is prerendered at build time, so Cloudflare's asset layer
// serves it and the Worker (`src/worker/Site.ts`) never spends CPU on it. The
// Worker renders only the rest through React Router: unknown paths, which get
// the not-found page and a 404. The footer's year is fixed at build time.
export default {
  ssr: true,
  prerender: ['/', '/about', '/contact', '/blog', ...posts.map((post) => `/blog/${post.slug}`)],
} satisfies Config;
