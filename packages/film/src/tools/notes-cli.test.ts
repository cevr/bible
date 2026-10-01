// `film notes` names its film first: a misspelt or outside name answers
// FilmUnknown with the films there are, and no lab folder is made for it.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Cause, ConfigProvider, Effect, Exit, Layer, Option, Path } from 'effect';
import { Command } from 'effect/cli';
import { ContentStore } from './content-store.ts';
import { FilmUnknown } from './errors.ts';
import { FilmFolder } from './film-repo.ts';
import { notes } from './notes-cli.ts';
import { NotesStore } from './notes-store.ts';
import { memoryFileSystem, text } from './testing.ts';

/** One film, `f`, under `/films`; notes under `/lab`. */
const notesOver = (files: Map<string, Uint8Array>, folders: Set<string>) => {
  files.set('/films/f/scenes/index.ts', text('export default []'));
  return Layer.mergeAll(NotesStore.layer, FilmFolder.layer('/films')).pipe(
    Layer.provide(ContentStore.layer),
    Layer.provideMerge([
      memoryFileSystem(files, folders),
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: '/lab' })),
    ]),
  );
};

/** `film notes …args` over the memory store; its exit and the lab folders it made. */
const run = (args: ReadonlyArray<string>) => {
  const files = new Map<string, Uint8Array>();
  const folders = new Set<string>();
  return Command.runWith(notes, { version: '0' })(args).pipe(
    // The terminal and stdio are Bun's; the files are the memory store's.
    Effect.provide(Layer.merge(BunServices.layer, notesOver(files, folders))),
    Effect.exit,
    Effect.map((exit) => ({
      exit,
      lab: [...folders, ...files.keys()].filter((p) => p.startsWith('/lab')),
    })),
  );
};

/** The typed failure a run ended on, if any. */
const failureOf = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, { onSuccess: Option.none, onFailure: Cause.findErrorOption });

describe('film notes', () => {
  for (const [film, args] of [
    ['f-typo', ['f-typo']],
    ['f-typo', ['f-typo', '--watch']],
    ['f-typo', ['reply', 'f-typo', 'n1', 'hello']],
    ['f-typo', ['resolve', 'f-typo', 'n1']],
    ['../escape', ['../escape']],
  ] as const)
    it.effect(`\`notes ${args.join(' ')}\` answers FilmUnknown and makes no lab folder`, () =>
      Effect.gen(function* () {
        const { exit, lab } = yield* run(args);
        expect(failureOf(exit)).toEqual(Option.some(FilmUnknown.make({ film, known: ['f'] })));
        expect(lab).toEqual([]);
      }),
    );

  it.effect('a known film lists its notes', () =>
    Effect.gen(function* () {
      const { exit } = yield* run(['f']);
      expect(Exit.isSuccess(exit)).toBe(true);
    }),
  );
});
