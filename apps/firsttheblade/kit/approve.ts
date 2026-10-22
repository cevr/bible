/**
 * `bun run kit:approve --ask <id>`: turns the record of the approved stills
 * (`kit/approved-stills.json`, `./approval.ts`) from pending on that ask to
 * approved. It reads the ask from the lab (`./lab-asks.ts`): the owner's
 * answer, and each image block's `src`, fetched from the lab and hashed. It
 * refuses an ask the lab does not hold, one he has not answered, an answer
 * to the stills question that is not the approve choice, a record not
 * pending on that ask, each pinned still whose SHA-256 no image block of the
 * ask showed, and stills other than the ones the record pinned, naming
 * each. The record keeps the ask, the lab URL it read, the answer's label
 * and the SHA-256 of each shown file.
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
    `${RECORD}: ${Object.keys(record.stills).length} stills, each shown by ask ${input.ask} in the lab at ${record.approval.lab}, approved (${record.approval.answer})`,
  );
});

const command = Command.make(
  'kit-approve',
  {
    ask: Flag.String('ask').pipe(
      Flag.withDescription(
        'The lab ask whose image blocks showed the owner every pinned still byte for byte, and whose stills answer is approve',
      ),
    ),
  },
  approved,
).pipe(
  Command.withDescription(
    "Approve the pinned stills: the owner's stills answer is approve and each still's SHA-256 is that of a file an image block of the ask showed",
  ),
);

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(
    Effect.provide(Layer.mergeAll(BunServices.layer, layerLab)),
    BunRuntime.runMain,
  );
}
