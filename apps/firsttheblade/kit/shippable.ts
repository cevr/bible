/**
 * `bun run kit:shippable`: exits 0 only when the record of the approved
 * stills (`kit/approved-stills.json`, `./approval.ts`) is approved and holds
 * every still the site would serve. The prod deploy runs it first, so a
 * pending record or a still the owner did not approve never ships; a stage
 * deploy does not run it.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, Path } from 'effect';

import { RECORD, shippable } from './approval.ts';

export const checked = Effect.gen(function* () {
  const path = yield* Path.Path;
  const approval = yield* shippable(path.dirname(import.meta.dir));
  yield* Console.log(`${RECORD}: approved on ask ${approval.ask}, every still held`);
});

if (import.meta.main) checked.pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
