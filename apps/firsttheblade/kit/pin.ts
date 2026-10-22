/**
 * `bun run kit:pin --ask <id>`: writes the record of the approved stills
 * (`kit/approved-stills.json`, `./approval.ts`) pending on that ask, from the
 * stills as they stand, keeping each earlier approval that showed a pinned
 * still's bytes, and saves the ask as the lab gives it with the hash of each
 * file it shows (`kit/fixtures/ask-<id>.json` and `.shown.json`). It refuses
 * an ask the lab does not hold (`./lab-asks.ts`). Pinning binds nothing:
 * `kit:approve` approves only the stills whose bytes an image block of that
 * ask or of a kept approval showed, so a pin to bytes no ask showed is
 * refused there, whenever it was made.
 *
 * Only the coordinator runs it. The kit never writes the record.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, Layer, Path } from 'effect';
import { Command, Flag } from 'effect/cli';

import { RECORD, pin } from './approval.ts';
import { layerLab } from './lab-asks.ts';

export const pinned = Effect.fn('KitPin.run')(function* (input: { readonly ask: string }) {
  const path = yield* Path.Path;
  const record = yield* pin(path.dirname(import.meta.dir), input.ask);
  yield* Console.log(
    `${RECORD}: ${Object.keys(record.stills).length} stills, pending on ask ${input.ask}, ${record.earlier.length} earlier approvals kept`,
  );
});

const command = Command.make(
  'kit-pin',
  {
    ask: Flag.String('ask').pipe(
      Flag.withDescription(
        'The lab ask whose image blocks show the owner each still byte for byte',
      ),
    ),
  },
  pinned,
).pipe(Command.withDescription('Pin the stills as they stand, pending on the ask that shows them'));

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, layerLab)),
    BunRuntime.runMain,
  );
}
