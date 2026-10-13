/**
 * Where the site is served from, and the channel it points to. The stack
 * (`../alchemy.run.ts`) and the prerender (`./prerender.tsx`) both read it,
 * so the canonical URL, the OG URLs, the sitemap and the Worker's hostnames
 * follow one value.
 *
 * The switch is `SERVED_FROM`. firsttheblade.com is not registered yet, so
 * the site lives on its `workers.dev` URL. Once the domain is in this
 * Cloudflare account, set `SERVED_FROM = 'custom-domain'` and run
 * `bun run deploy`: the Worker takes the apex, `www` redirects to it, and the
 * `workers.dev` URL is switched off.
 */

export type ServedFrom = 'workers.dev' | 'custom-domain';

export const SERVED_FROM: ServedFrom = 'workers.dev';

/** The registered name the custom domain serves. */
export const DOMAIN = 'firsttheblade.com';

/** The Worker's script name, which names its `workers.dev` host. */
export const WORKER_NAME = 'firsttheblade';

/** The account's `workers.dev` subdomain (`<subdomain>.workers.dev`). */
export const WORKERS_DEV_SUBDOMAIN = 'seeve-c';

const ORIGINS: Record<ServedFrom, string> = {
  'workers.dev': `https://${WORKER_NAME}.${WORKERS_DEV_SUBDOMAIN}.workers.dev`,
  'custom-domain': `https://${DOMAIN}`,
};

/** The canonical origin every absolute URL the pages print starts with. */
export const ORIGIN = ORIGINS[SERVED_FROM];

export const CHANNEL = {
  name: 'First the Blade',
  handle: '@firsttheblade',
  url: 'https://www.youtube.com/@firsttheblade',
  subscribe: 'https://www.youtube.com/@firsttheblade?sub_confirmation=1',
} as const;
