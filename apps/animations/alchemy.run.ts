/**
 * The films' private store on Cloudflare, declared as an Alchemy stack: one
 * private R2 bucket and the bucket-scoped key the film tools reach it with
 * (`./infra/store.ts`). No Worker and no public route: the tools talk to R2's
 * S3 API from this machine.
 *
 *   bun run plan            what a prod deploy would change
 *   bun run deploy          the prod bucket and key (the owner's call)
 *   bun run store:keys      the key pair into ./.env, for `sfx`/`media`/`score`
 *
 * A throwaway stage (`bunx alchemy deploy alchemy.run.ts --stage agent-store`)
 * gets its own bucket and key, both deleted by its `destroy`.
 *
 * The outputs carry the token's value as `Redacted`; the deploy prints it as
 * `<redacted>`, and only `infra/keys.ts` unwraps it, into `.env`.
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Effect from 'effect/Effect';

import { FilmStore } from './infra/store.ts';

export default Alchemy.Stack(
  'film-store',
  { providers: Cloudflare.providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    const { bucket, key, accountId } = yield* FilmStore;
    return {
      bucket: bucket.bucketName,
      accountId,
      keyId: key.tokenId,
      token: key.value,
    };
  }),
);
