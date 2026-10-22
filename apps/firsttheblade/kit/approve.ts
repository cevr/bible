/**
 * `bun run kit:approve --ask <id> [--answer <his words>]`: writes the record
 * of the approved field stills (`kit/approved-stills.json`, `./approval.ts`)
 * from the served stills as they stand. With no answer the approval is
 * pending on the ask named; with one it holds his answer verbatim.
 *
 * Only the coordinator runs it, once the owner has looked at the stills in
 * that lab ask (1:1 crops) and answered. The kit never writes the record.
 */
import { BunRuntime, BunServices } from '@effect/platform-bun';
import { Console, Effect, Option, Path } from 'effect';
import { Command, Flag } from 'effect/cli';

import { type Approval, RECORD, approve } from './approval.ts';

export const approved = Effect.fn('KitApprove.run')(function* (input: {
  readonly ask: string;
  readonly answer: Option.Option<string>;
}) {
  const path = yield* Path.Path;
  const approval = Option.match(input.answer, {
    onNone: (): Approval => ({ status: 'pending', ask: input.ask }),
    onSome: (answer): Approval => ({ status: 'approved', ask: input.ask, answer }),
  });
  const record = yield* approve(path.dirname(import.meta.dir), approval);
  yield* Console.log(
    `${RECORD}: ${Object.keys(record.stills).length} stills, ${approval.status} on ask ${approval.ask}`,
  );
});

const command = Command.make(
  'kit-approve',
  {
    ask: Flag.String('ask').pipe(
      Flag.withDescription('The lab ask that showed the owner these stills'),
    ),
    answer: Flag.String('answer').pipe(
      Flag.optional,
      Flag.withDescription('His answer, verbatim; with none the approval is pending'),
    ),
  },
  approved,
).pipe(Command.withDescription('Record the field stills as they stand, under the ask named'));

if (import.meta.main) {
  Command.run(command, { version: '1.0.0' }).pipe(
    Effect.provide(BunServices.layer),
    BunRuntime.runMain,
  );
}
