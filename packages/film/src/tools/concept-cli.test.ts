// `film concept brief` reads the app's own house block wherever it runs,
// and names a sheet's layout once: a turnaround's by its pronoun, a poses or
// heads sheet's by its file and its kind.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Cause, Console, Effect, Exit, FileSystem, Layer, Option, Path, Queue } from 'effect';
import { Command } from 'effect/cli';
import { concept } from './concept-cli.ts';
import { memoryFileSystem, printingTo, text } from './testing.ts';

const HOUSE = { text: '/app/docs/ref/house-look.txt', image: '/app/docs/ref/house-look.png' };

/** The house block as the app keeps it. */
const houseBlock = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  return yield* fs.readFileString(
    new URL('../../../../apps/animations/docs/ref/house-look.txt', import.meta.url).pathname,
  );
}).pipe(Effect.provide(BunServices.layer));

/** A memory store holding the app's house block, a look, references and a layout; nothing under the shell's folder. */
const over = () =>
  Layer.mergeAll(
    BunServices.layer,
    Layer.unwrap(
      Effect.map(houseBlock, (house) =>
        memoryFileSystem(
          new Map<string, Uint8Array>([
            [HOUSE.text, text(house)],
            ['/m/look.md', text('He wears a cream robe.')],
            ['/m/refs.md', text('Image 1 is the house look.')],
            ['/m/poses.md', text('Draw Him twice: standing, then seated.')],
          ]),
        ),
      ),
    ),
    Path.layer,
  );

/** `film concept …args`: its exit and what it printed. */
const run = (args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<string>();
    const exit = yield* Command.runWith(concept(HOUSE), { version: '0' })(args).pipe(
      Effect.provideService(Console.Console, printingTo(lines)),
      Effect.exit,
    );
    return { exit, printed: (yield* Queue.clear(lines)).join('\n') };
  });

/** The tag of the typed failure a run ended on, `none` when it succeeded. */
const failureTag = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => 'none',
    onFailure: (cause) =>
      Option.match(Cause.findErrorOption(cause), {
        onNone: () => 'defect',
        onSome: (e) => String(Option.getOrElse(Option.fromUndefinedOr(Object(e)._tag), () => '')),
      }),
  });

const LOOK = ['--look', '/m/look.md', '--references', '/m/refs.md'];

describe('film concept brief', () => {
  it.effect("reads the app's house block, not one under the shell's folder", () =>
    Effect.gen(function* () {
      const { exit, printed } = yield* run(['brief', '--turnaround', 'Him', ...LOOK]);
      expect(failureTag(exit)).toBe('none');
      expect(printed).toStartWith('A character model sheet');
    }).pipe(Effect.provide(over())),
  );

  it.effect('briefs a pose sheet from its layout file and its kind', () =>
    Effect.gen(function* () {
      const { exit, printed } = yield* run([
        'brief',
        '--layout',
        '/m/poses.md',
        '--kind',
        'poses',
        ...LOOK,
      ]);
      expect(failureTag(exit)).toBe('none');
      expect(printed).toContain('each pose takes the height its pose gives it');
    }).pipe(Effect.provide(over())),
  );

  it.effect('refuses a layout with no kind', () =>
    Effect.gen(function* () {
      const { exit } = yield* run(['brief', '--layout', '/m/poses.md', ...LOOK]);
      expect(failureTag(exit)).toBe('LayoutUnset');
    }).pipe(Effect.provide(over())),
  );
});
