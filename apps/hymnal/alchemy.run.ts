/**
 * The hymnal's cloud, declared as an Alchemy stack: one R2 bucket that serves
 * the hymn recordings at `https://hymns.cvr.im` (`infra/bucket.ts`).
 *
 * Only `prod` exists. The bucket's name and domain are fixed, so a second
 * stage would adopt the same bucket and domain; any other stage is refused.
 * `bun run plan` and `bun run deploy` run it from this directory. State lives
 * in the Cloudflare state store, so every machine sees the same resources.
 *
 * The recordings are not part of the stack: `bun run audio:copy` copies them
 * into the bucket (`infra/audio/copy.ts`).
 */
import * as Alchemy from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Stage } from 'alchemy/Stage';
import { Effect, Schema } from 'effect';

import { Hymns } from './infra/bucket.ts';
import { HYMNS_ORIGIN } from './src/remote.ts';

class StageRefused extends Schema.TaggedError<StageRefused>()('StageRefused', {
  stage: Schema.String,
}) {
  override get message() {
    return `the hymnal stack has only the stage prod, not ${this.stage}: its bucket and domain are fixed (--stage prod)`;
  }
}

export default Alchemy.Stack(
  'hymnal',
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const stage = yield* Stage;
    if (stage !== 'prod') return yield* Effect.die(StageRefused.make({ stage }));
    const bucket = yield* Hymns;
    return { bucket: bucket.bucketName, url: HYMNS_ORIGIN };
  }),
);
