/**
 * Where the site is served from, and the channel it points to. The stack
 * (`../alchemy.run.ts`) and the prerender (`./prerender.tsx`) both read it,
 * so the canonical URL, the OG URLs, the sitemap and the Worker's hostnames
 * follow one value.
 *
 * The switch is `SERVED_FROM`. firsttheblade.com is in this Cloudflare
 * account, so the Worker takes the apex, `www` and each of
 * `REDIRECTED_DOMAINS` redirect to it, and the `workers.dev` URL is off.
 * Setting `'workers.dev'` and deploying serves the site from that URL
 * instead.
 */

export type ServedFrom = 'workers.dev' | 'custom-domain';

export const SERVED_FROM: ServedFrom = 'custom-domain';

/** The registered name the custom domain serves. */
export const DOMAIN = 'firsttheblade.com';

/**
 * The address people write to. Cloudflare Email Routing forwards it to the
 * owner's inbox (`./worker/domain.ts`); the privacy page names it.
 */
export const CONTACT = `hello@${DOMAIN}`;

/** The other registered names: each, and its `www`, redirects to `DOMAIN`. */
export const REDIRECTED_DOMAINS = ['firsttheblade.org', 'firsttheblade.net'] as const;

/** The Worker's script name, which names its `workers.dev` host. */
export const WORKER_NAME = 'firsttheblade';

/** The account's `workers.dev` subdomain (`<subdomain>.workers.dev`). */
export const WORKERS_DEV_SUBDOMAIN = 'cvr';

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

/**
 * The channel's profiles elsewhere, in the order the footer lists them. The
 * Facebook Page is linked by its id, which stays the same if its username
 * changes.
 */
export const PROFILES = [
  { name: 'YouTube', url: CHANNEL.url },
  { name: 'Instagram', url: 'https://www.instagram.com/firsttheblade/' },
  { name: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61595704647167' },
] as const;
