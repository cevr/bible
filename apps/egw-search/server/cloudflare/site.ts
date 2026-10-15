/**
 * Where the search is served from on Cloudflare.
 *
 * The switch is `SERVED_FROM`. `'custom-domain'` binds `egw.cvr.im` to the
 * Worker and switches its `workers.dev` host off. `'workers.dev'` serves `prod`
 * from its `workers.dev` host alone, for a deploy that must not take the
 * hostname.
 */

export type ServedFrom = 'workers.dev' | 'custom-domain';

export const SERVED_FROM: ServedFrom = 'custom-domain';

/** The hostname readers use. */
export const DOMAIN = 'egw.cvr.im';

/** The Worker's script name, which names its `workers.dev` host. */
export const WORKER_NAME = 'egw-search';
