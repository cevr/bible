/**
 * The hymn recordings' bucket: R2 `cvr-hymns`, served publicly at its custom
 * domain (`src/remote.ts`), never at the rate-limited `r2.dev` host.
 *
 * The bucket outlives any one deploy: the recordings are copied in once by
 * `bun run audio:copy`, not by the stack, so the bucket is adopted when it
 * exists and retained when the stack is destroyed. `forceDestroy` stays off,
 * so R2 itself refuses to delete it while it holds objects.
 *
 * CORS lets the web build read the recordings from any origin, with range
 * reads for seeking. The content is public and fetched without credentials;
 * narrow the origins once the web build's host is settled.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';

import { HYMNS_HOST } from '../src/remote.ts';

export const Hymns = Cloudflare.R2.Bucket('Hymns', {
  name: 'cvr-hymns',
  domains: [{ name: HYMNS_HOST }],
  publicAccess: false,
  cors: [
    {
      allowedMethods: ['GET', 'HEAD'],
      allowedOrigins: ['*'],
      allowedHeaders: ['range'],
      exposeHeaders: ['content-length', 'content-range', 'etag', 'accept-ranges'],
    },
  ],
}).pipe(Alchemy.AdoptPolicy.adopt(true), Alchemy.RemovalPolicy.retain());
