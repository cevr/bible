/**
 * `bun run kit:shippable`: exits 0 only when the record of the approved
 * stills (`kit/approved-stills.json`, `./approval.ts`) is approved, each
 * approval it keeps is held by its saved ask, each still's SHA-256 is that
 * of a file the approving ask or an earlier approval it keeps showed, and a
 * fresh `bun run build` holds no image (found by its bytes under `dist/`,
 * `./build-walk.ts`) the record and `OUTSIDE` do not hold. It prints the lab
 * the approval was read from.
 *
 * `prodGate` runs it first in `alchemy.run.ts` on stage `prod`, so every
 * prod deploy and plan runs it, whatever command starts it; any other stage
 * skips it.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Stage } from 'alchemy/Stage';
import { Console, Effect, Option, Path } from 'effect';

import { RECORD, shippable } from './approval.ts';

/** `shippable` over the app at `app`, its approval printed with the lab it was read from. */
export const checked = Effect.fn('KitShippable.run')(function* (app: string) {
  const approval = yield* shippable(app);
  yield* Console.log(
    `${RECORD}: approved on ask ${approval.ask} (${approval.answer}) in the lab at ${approval.lab}; every image of the build held`,
  );
  return approval;
});

/** The prod deploy's gate: `checked` on stage `prod`, nothing on any other stage. */
export const prodGate = Effect.fn('KitShippable.prodGate')(function* (app: string) {
  if ((yield* Stage) !== 'prod') return Option.none();
  return Option.some(yield* checked(app));
});

if (import.meta.main)
  Effect.gen(function* () {
    const path = yield* Path.Path;
    yield* checked(path.dirname(import.meta.dir));
  }).pipe(Effect.provide(BunServices.layer), BunRuntime.runMain);
