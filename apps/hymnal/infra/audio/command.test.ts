/**
 * The command's arguments as `bun run audio:copy` passes them, parsed by the
 * command's own definition. The handler only records the mode it was given,
 * so neither job runs.
 */
import * as BunServices from '@effect/platform-bun/BunServices';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Ref } from 'effect';
import { Command } from 'effect/cli';

import { audioCopyCommand } from './command.ts';

const selected = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const seen = yield* Ref.make<ReadonlyArray<boolean>>([]);
    const command = audioCopyCommand.pipe(
      Command.withHandler(({ dryRun }) => Ref.update(seen, (modes) => [...modes, dryRun])),
    );
    const exit = yield* Effect.exit(
      Command.runWith(command, { version: '1.0.0', renderErrors: false })(args),
    );
    return { exit, modes: yield* Ref.get(seen) };
  }).pipe(Effect.provide(BunServices.layer));

describe('audio-copy arguments', () => {
  it.effect('selects the real run with no flag', () =>
    Effect.gen(function* () {
      const { exit, modes } = yield* selected([]);
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(modes).toEqual([false]);
    }),
  );

  it.effect('selects the dry run with --dry-run', () =>
    Effect.gen(function* () {
      const { exit, modes } = yield* selected(['--dry-run']);
      expect(Exit.isSuccess(exit)).toBe(true);
      expect(modes).toEqual([true]);
    }),
  );

  it.effect('fails on an unknown flag and runs nothing', () =>
    Effect.gen(function* () {
      const { exit, modes } = yield* selected(['--dryrun']);
      expect(Exit.isFailure(exit)).toBe(true);
      expect(modes).toEqual([]);
    }),
  );
});
