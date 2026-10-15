import type { Config } from '@react-router/dev/config';

// Server-rendered on every request: Cloudflare's asset layer serves the hashed
// assets and public files, and the Worker (`src/worker/Site.ts`) hands every
// other request to React Router.
export default {
  ssr: true,
} satisfies Config;
