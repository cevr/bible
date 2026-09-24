/**
 * Bucket-only variant of the EGW Search stack.
 *
 * It declares the adopted project and the new `egw-celld` bucket, and nothing
 * else. It shares the stack name and stage with `alchemy.run.ts`, so both
 * files write to one state and the bucket has one owner.
 *
 * Deploy this first. On a first run it creates the bucket, and the project
 * reconcile makes no change: the name matches and no description is declared
 * (`Project.ts:419-435`). If you run it after a full deploy, the plan lists
 * the service and the domain as `orphaned`. That only forgets them, because
 * they are retained, and the next full deploy adopts them again.
 */
import * as Alchemy from 'alchemy';
import { providers } from 'alchemy/Railway/Providers';
import * as Effect from 'effect/Effect';

import { BibleStudies, EgwCelld, bucketOutputs } from './infra/railway.ts';

export default Alchemy.Stack(
  'egw-search',
  { providers: providers(), state: Alchemy.localState() },
  Effect.gen(function* () {
    yield* BibleStudies;
    const bucket = yield* EgwCelld;
    return { bucket: bucketOutputs(bucket) };
  }),
);
