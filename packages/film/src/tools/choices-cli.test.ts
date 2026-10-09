// `film options` names its film first, as the review's fresh runs ask it: a
// film that is not one of the films answers FilmUnknown, as one line of JSON
// on stdout (a refusal as itself) and a failed run, whichever subcommand asks.
// A verb it does not know is the command line's refusal, before any film is read.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  Cause,
  Console,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Queue,
  References,
  Schema,
} from 'effect';
import { Command } from 'effect/cli';
import { FilmUnknown } from '../core/refusals.ts';
import { options } from './choices-cli.ts';
import { ElevenLabs } from './elevenlabs.ts';
import { filmServices } from './film-services.ts';

/** The console a run prints to: each line it logs, offered to `lines`. */
const printingTo = (lines: Queue.Queue<string>): Console.Console => ({
  ...globalThis.console,
  log: (...args: ReadonlyArray<unknown>) => {
    Queue.offerUnsafe(lines, args.map(String).join(' '));
  },
});

/**
 * The film services on a temp folder with one film, `f`. Nothing that costs
 * anything is reached: ElevenLabs is unimplemented.
 */
const world = Layer.unwrap(
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped();
    const films = path.join(root, 'films');
    yield* fs.makeDirectory(path.join(films, 'f', 'scenes'), { recursive: true });
    yield* fs.writeFileString(path.join(films, 'f', 'scenes', 'index.ts'), 'export {};\n');
    return filmServices({
      films,
      sounds: path.join(root, 'sounds'),
      folders: { out: path.join(root, 'out'), lab: path.join(root, 'lab') },
      self: ['bun', 'cli.ts'],
      roots: Effect.succeed([]),
      elevenLabs: Layer.mock(ElevenLabs)({}),
    });
  }),
).pipe(Layer.provideMerge(BunServices.layer));

/** `film options …args` run to its end: its exit, and the lines it printed. */
const cli = (...args: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const lines = yield* Queue.unbounded<string>();
    const exit = yield* Command.runWith(options, { version: '0' })(args).pipe(
      Effect.provideService(Console.Console, printingTo(lines)),
      Effect.provideService(References.MinimumLogLevel, 'None'),
      Effect.exit,
    );
    return { exit, lines: yield* Queue.clear(lines) };
  });

const parsed = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown));

describe('film options', () => {
  for (const args of [
    ['list', 'f-typo'],
    ['list', 'f-typo', '--check'],
    ['take', 'f-typo', '--point', 'take:coins', '--variant', 'abc', '--verb', 'pick'],
    ['mix', 'f-typo', '--point', 'score', '--variant', 'piano', '--to', '/out/mix.m4a'],
    ['keep-voice', 'f-typo', 'a', 'a.0123456789ab.flac'],
  ] as const)
    it.live(`\`options ${args.join(' ')}\` answers FilmUnknown, printed as itself`, () =>
      Effect.gen(function* () {
        const { exit, lines } = yield* cli(...args);
        const failed = Exit.match(exit, {
          onSuccess: Option.none,
          onFailure: Cause.findErrorOption,
        });
        expect(failed).toEqual(Option.some(FilmUnknown.make({ film: 'f-typo', known: ['f'] })));
        expect(lines.map((line) => parsed(line))).toEqual([
          { _tag: 'FilmUnknown', film: 'f-typo', known: ['f'] },
        ]);
      }).pipe(Effect.provide(world)),
    );

  it.live(
    'a verb it does not know is refused by the command line, which prints its usage and no answer',
    () =>
      Effect.gen(function* () {
        const { exit, lines } = yield* cli(
          'take',
          'f',
          '--point',
          'take:coins',
          '--variant',
          'abc',
          '--verb',
          'frob',
        );
        expect(Exit.isFailure(exit)).toBe(true);
        // The command line's usage is printed; no answer line of JSON is.
        expect(lines.join('\n')).toContain('pick, unpick, reject');
        expect(lines.filter((line) => line.startsWith('{'))).toEqual([]);
      }).pipe(Effect.provide(world)),
  );
});
