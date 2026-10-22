/**
 * `bun run kit:approve --ask <id>`: turns the record of the approved stills
 * (`kit/approved-stills.json`, `./approval.ts`) from pending on that ask to
 * approved, reading the owner's answer from the lab (`./lab-asks.ts`). It
 * refuses an ask the lab does not hold, one he has not answered, an answer
 * to the stills question that is not the approve choice, a record not
 * pending on that ask, and stills other than the ones the record pinned,
 * naming each.
 *
 * Only the coordinator runs it, once the owner has answered. The kit never
 * writes the record.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, Layer, Path } from 'effect';
import { Command, Flag } from 'effect/cli';

import { RECORD, approve } from './approval.ts';
import { layerLab } from './lab-asks.ts';

export const approved = Effect.fn('KitApprove.run')(function* (input: { readonly ask: string }) {
  const path = yield* Path.Path;
  const record = yield* approve(path.dirname(import.meta.dir), input.ask);
  yield* Console.log(
    `${RECORD}: ${Object.keys(record.stills).length} stills, approved on ask ${input.ask}`,
  );
});

const command = Command.make(
  'kit-approve',
  {
    ask: Flag.String('ask').pipe(
      Flag.withDescription('The lab ask that showed the owner the stills the record pins'),
    ),
  },
  approved,
).pipe(Command.withDescription("Approve the pinned stills from the owner's answer in the lab"));

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, layerLab)),
    BunRuntime.runMain,
  );
}
