import type { Config } from '@react-router/dev/config';

// Server-rendered on every request: the server (`src/server/site.ts`) serves the
// hashed assets and public files, and hands every other request to React Router.
export default {
  ssr: true,
} satisfies Config;
