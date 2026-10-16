// `film board import` over memory: images made elsewhere come in as tries of
// a panel, and a `--keep` that names none of them is refused before the board
// is touched (no panel, no try, no image left behind).

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Cause, ConfigProvider, Effect, Exit, Layer, Option, Path, Schema } from 'effect';
import { Command } from 'effect/cli';
import { ChildProcessSpawner } from 'effect/process';
import { board } from './board-cli.ts';
import { BoardStore } from './board-store.ts';
import { BoardRefused } from '../core/refusals.ts';
import { ContentStore } from './content-store.ts';
import { FilmFolder, FilmName, FilmRepo } from './film-repo.ts';
import { NotesStore } from './notes-store.ts';
import { memoryFileSystem, memoryLocks, text } from './testing.ts';

const film = FilmName.make('f');

/** The board's services over `files` (the terminal and stdio are Bun's): the film `f` under `/films`, one beat `cold`; no process runs. */
const over = (files: Map<string, Uint8Array>) => {
  files.set('/films/f/scenes/index.ts', text('export default []'));
  files.set('/in/a.png', text('image a'));
  files.set('/in/b.png', text('image b'));
  return Layer.mergeAll(
    BoardStore.layer,
    NotesStore.layer,
    Layer.succeed(
      FilmRepo,
      FilmRepo.of({
        load: () => Effect.die('import loads no film'),
        script: () => Effect.succeedSome([{ id: 'cold', say: 'A {room}court.', cite: [] }]),
        sound: () => Effect.die('import reads no sound'),
        scores: Effect.die('import reads no scores'),
      }),
    ),
    Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() => Effect.die('import runs no process')),
    ),
  ).pipe(
    Layer.provide(ContentStore.layer),
    Layer.provideMerge(FilmFolder.layer('/films')),
    Layer.provideMerge([
      memoryFileSystem(files),
      memoryLocks,
      Path.layer,
      ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_OUT: '/out', FILMS_LAB: '/lab' })),
    ]),
  );
};

const run = (args: ReadonlyArray<string>) =>
  Command.runWith(board, { version: '0' })(['import', 'f', '--panel', 'cold.room', ...args]).pipe(
    Effect.exit,
  );

/** Why a run was refused, if it was. */
const refused = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.match(exit, {
    onSuccess: () => Option.none<string>(),
    onFailure: (cause) =>
      Option.map(
        Option.filter(Cause.findErrorOption(cause), Schema.is(BoardRefused)),
        (e) => e.reason,
      ),
  });

describe('board import', () => {
  it.effect('a --keep naming none of the images is refused, and leaves the board as it was', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      for (const keep of ['0', '3']) {
        const exit = yield* run(['--keep', keep, '/in/a.png', '/in/b.png']);
        expect(Option.getOrUndefined(refused(exit))).toContain(`--keep ${keep}`);
      }
      expect((yield* (yield* BoardStore).read(film)).panels).toEqual([]);
      expect([...files.keys()].filter((f) => f.startsWith('/films/f/board'))).toEqual([]);
    }).pipe(Effect.provide(Layer.merge(BunServices.layer, over(files))));
  });
  it.effect('a --keep naming one of them keeps that try', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      expect(Exit.isSuccess(yield* run(['--keep', '2', '/in/a.png', '/in/b.png']))).toBe(true);
      const [panel] = (yield* (yield* BoardStore).read(film)).panels;
      expect(panel?.tries.map((t) => [t.n, t.made])).toEqual([
        [1, 'import'],
        [2, 'import'],
      ]);
      expect(panel?.kept).toBe(2);
    }).pipe(Effect.provide(Layer.merge(BunServices.layer, over(files))));
  });
});
