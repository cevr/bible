/**
 * The stack: one Cloudflare Worker serving the built site and its email list
 * (`src/worker/Site.ts`), with the list's D1 database, queue, rate limit and
 * Email Sending binding (`src/worker/mail.ts`), and the domain's mail: the
 * sending domain and, in prod, the contact address (`src/worker/domain.ts`).
 * Deploying needs the list's two secrets in `.env`, and prod the contact's
 * inbox too (README, The email list).
 * On stage `prod` the stack first runs the prod state check
 * (`scripts/prod-state.ts` `prodStateGate`): it refuses a run whose Alchemy
 * state does not record the live Worker, D1 and queue, so a checkout without
 * the main checkout's state cannot plan them as new. Then it runs the stills
 * gate (`kit/shippable.ts` `prodGate`): it builds the site and refuses an approval that is not given
 * on the bytes the owner was shown, or a built image the record does not
 * hold (a defect that stops the run), before any resource is planned or
 * deployed. `bun run deploy` deploys `prod`; any other stage is a throwaway
 * copy of a `dist/` built beforehand
 * (`bunx alchemy deploy alchemy.run.ts --stage <name>`), destroyed with
 * `bunx alchemy destroy alchemy.run.ts --stage <name>`.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Effect } from 'effect';

import { prodGate } from './kit/shippable.ts';
import { prodStateGate } from './scripts/prod-state.ts';
import { MailDomain } from './src/worker/domain.ts';
import Site from './src/worker/Site.ts';

export default Alchemy.Stack(
  'firsttheblade',
  {
    providers: Cloudflare.providers(),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    yield* prodStateGate().pipe(Effect.orDie);
    yield* prodGate(import.meta.dir).pipe(Effect.orDie);
    const mail = yield* MailDomain;
    const site = yield* Site;
    return { url: site.url, urls: site.urls, sending: mail.sending };
  }),
);
