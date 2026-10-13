/**
 * The stack: one Cloudflare Worker serving the built site (`src/worker/Site.ts`).
 * `bun run deploy` builds and deploys `prod`; any other stage is a throwaway
 * copy (`bunx alchemy deploy alchemy.run.ts --stage <name>`), destroyed with
 * `bunx alchemy destroy alchemy.run.ts --stage <name>`.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';

import Site from './src/worker/Site.ts';

export default Alchemy.Stack(
  'firsttheblade',
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    const site = yield* Site;
    return { url: site.url, urls: site.urls };
  }),
);
