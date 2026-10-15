/**
 * Where the search is served from on Cloudflare.
 *
 * The switch is `SERVED_FROM`. While Railway still serves egw.cvr.im, `prod`
 * runs on its `workers.dev` host, so it can be compared with the live site
 * before anything moves. The cutover deletes the Railway records for
 * `egw.cvr.im`, sets `SERVED_FROM = 'custom-domain'` and deploys: the Worker
 * takes the hostname and its `workers.dev` host is switched off.
 */

export type ServedFrom = 'workers.dev' | 'custom-domain';

export const SERVED_FROM: ServedFrom = 'workers.dev';

/** The hostname readers use. */
export const DOMAIN = 'egw.cvr.im';

/** The Worker's script name, which names its `workers.dev` host. */
export const WORKER_NAME = 'egw-search';
