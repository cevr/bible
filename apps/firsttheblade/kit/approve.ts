/**
 * `bun run kit:approve --ask <id>`: turns the record of the approved stills
 * (`kit/approved-stills.json`, `./approval.ts`) from pending on that ask to
 * approved. It reads the ask from the lab (`./lab-asks.ts`): the owner's
 * answer, the steps he reached, and the lab's receipt, the SHA-256 of each
 * image block's file as the lab made the ask. It refuses a record not
 * pending on that ask, an earlier approval the record keeps that its saved
 * ask does not hold, an ask the lab does not hold, one with no receipt, one
 * he has not answered, an answer to the stills question that is not the
 * approve choice, each pinned still whose SHA-256 no image block on a step
 * he reached or earlier approval showed, and stills other than the ones the
 * record pinned, naming each. The record keeps the ask, the lab URL it
 * read, the answer's label, the SHA-256 of each file shown on the steps he
 * reached, and the earlier approvals that hold a still this ask did not
 * show; the ask is saved again as answered (`kit/fixtures/ask-<id>.json`
 * and `.shown.json`).
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
    `${RECORD}: ${Object.keys(record.stills).length} stills, each shown by ask ${input.ask} in the lab at ${record.approval.lab} or by ${record.earlier.length} earlier approvals kept, approved (${record.approval.answer})`,
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
