// `film notes` as it is run: it lists the open notes the lab saved, replies
// and resolves from the command line, and `--watch` prints each new note and
// each reply from the user once. Notes go to a temporary FILMS_LAB, so the
// real lab folder is never touched. No browser, no server, no paid call.

import { BunServices } from '@effect/platform-bun';
import { ContentStore, NotesStore } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Duration,
  Effect,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';

const film = 'righteousness-by-faith';

const text = (stream: Stream.Stream<Uint8Array, unknown>) =>
  Stream.mkString(Stream.decodeText(stream));

/** `bun cli.ts ...args` with notes under `lab`: its exit code and everything it printed. */
const cli = Effect.fn('test.cli')(function* (lab: string, ...args: ReadonlyArray<string>) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const path = yield* Path.Path;
  const cwd = path.join(import.meta.dir, '..');
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* spawner.spawn(
        ChildProcess.make('bun', ['cli.ts', ...args], {
          cwd,
          env: { FILMS_LAB: lab },
          extendEnv: true,
        }),
      );
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [text(handle.stdout), text(handle.stderr), handle.exitCode],
        { concurrency: 3 },
      );
      return { exitCode: Number(exitCode), stdout, out: `${stdout}${stderr}` };
    }),
  );
});

/**
 * The store the lab server writes through, over a temporary lab folder the
 * test's CLI runs share (`labDir`), removed when the test ends.
 */
const LabStore = Layer.unwrap(
  Effect.gen(function* () {
    const lab = yield* (yield* FileSystem.FileSystem).makeTempDirectoryScoped();
    return NotesStore.layer.pipe(
      Layer.provide(ContentStore.layer),
      Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: lab }))),
    );
  }),
).pipe(Layer.provideMerge(BunServices.layer));

/** The lab folder the store writes under. */
const labDir = Effect.gen(function* () {
  const path = yield* Path.Path;
  return path.dirname((yield* NotesStore).paths(film).dir);
});

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

/** A note as the lab saves one: in the hand scene, boxed, nearest the topple cue. */
const handNote = Effect.fn('test.handNote')(function* (words: string) {
  return yield* (yield* NotesStore).add(
    film,
    {
      scene: 'hand',
      T: 230.38,
      frame: 6911,
      cue: { name: 'topple', edge: 'end' },
      mark: 'earns',
      box: { x: 860, y: 640, w: 200, h: 120 },
      text: words,
    },
    png,
  );
});

describe('film notes', () => {
  it.live('lists open notes, replies with a still, resolves, and fails on an unknown id', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const lab = yield* labDir;
      const empty = yield* cli(lab, 'notes', film);
      expect(empty.exitCode).toBe(0);
      // No notes: only the cursor a watch resumes from.
      expect(empty.stdout).toBe('cursor seq=0\n');

      yield* handNote('the hand sits too low');
      const listed = yield* cli(lab, 'notes', film);
      expect(listed.exitCode).toBe(0);
      expect(listed.stdout.trim().split('\n')).toEqual([
        `note id=n1 seq=1 status=open scene=hand T=230.38 frame=6911 cue=topple:end mark=earns box=860,640,200x120 replies=0 still=${lab}/${film}/stills/n1.png text="the hand sits too low"`,
        'cursor seq=1',
      ]);

      const after = `${lab}/after.png`;
      yield* fs.writeFile(after, png);
      const replied = yield* cli(
        lab,
        'notes',
        'reply',
        film,
        'n1',
        'raised it 40px',
        '--still',
        after,
      );
      expect(replied.exitCode).toBe(0);
      expect(replied.stdout).toContain('status=replied');
      expect(replied.stdout).toContain('replies=1');
      expect(yield* fs.readFile(`${lab}/${film}/stills/n1.r2.png`)).toEqual(png);

      const unknown = yield* cli(lab, 'notes', 'resolve', film, 'n9');
      expect(unknown.exitCode).not.toBe(0);
      expect(unknown.out).toContain('has no note "n9"; its notes are n1');

      expect((yield* cli(lab, 'notes', 'resolve', film, 'n1')).exitCode).toBe(0);
      expect((yield* cli(lab, 'notes', film)).stdout).toBe('cursor seq=3\n');
    }).pipe(Effect.provide(LabStore)),
  );

  it.live('--watch prints each new note and user reply once, and not the agent’s', () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const notes = yield* NotesStore;
      const lab = yield* labDir;
      // One note before the watch starts: it is not new, so it is not printed.
      yield* handNote('before');
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const watch = yield* spawner.spawn(
        ChildProcess.make('bun', ['cli.ts', 'notes', film, '--watch'], {
          cwd: path.join(import.meta.dir, '..'),
          env: { FILMS_LAB: lab },
          extendEnv: true,
        }),
      );
      const lines = yield* Effect.forkChild(
        Stream.decodeText(watch.stdout).pipe(
          Stream.splitLines,
          Stream.take(3),
          Stream.runCollect,
          Effect.timeoutOption(Duration.seconds(20)),
        ),
      );
      // Let the watch read its starting cursor.
      yield* Effect.sleep('1500 millis');
      yield* handNote('after');
      yield* notes.reply(film, 'n1', { by: 'agent', text: 'mine', still: Option.none() });
      yield* notes.reply(film, 'n2', { by: 'user', text: 'and lower', still: Option.none() });
      const got = Option.getOrThrow(yield* Fiber.join(lines));
      // First the cursor it starts from; then each line carries its own change number.
      expect(got.map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
        'watch since=1',
        'note id=n2 seq=2',
        'reply id=n2 seq=4',
      ]);
      expect(got[2]).toContain('by=user');
      expect(got[2]).toContain('text="and lower"');
    }).pipe(Effect.scoped, Effect.provide(LabStore)),
  );

  it.live(
    'list, then watch from the cursor it printed: a note made between the two is not lost',
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const notes = yield* NotesStore;
        const lab = yield* labDir;
        yield* handNote('seen by the list');
        const listed = yield* cli(lab, 'notes', film);
        const cursor = /^cursor seq=(\d+)$/m.exec(listed.stdout)?.[1];
        expect(cursor).toBe('1');
        // Made after the list, before the watch starts: the gap a Monitor used to fall into.
        yield* handNote('made in the gap');
        yield* notes.reply(film, 'n2', { by: 'user', text: 'and this', still: Option.none() });
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const watch = yield* spawner.spawn(
          ChildProcess.make('bun', ['cli.ts', 'notes', film, '--watch', '--since', `${cursor}`], {
            cwd: path.join(import.meta.dir, '..'),
            env: { FILMS_LAB: lab },
            extendEnv: true,
          }),
        );
        const got = Option.getOrThrow(
          yield* Stream.decodeText(watch.stdout).pipe(
            Stream.splitLines,
            Stream.take(3),
            Stream.runCollect,
            Effect.timeoutOption(Duration.seconds(20)),
          ),
        );
        expect(got.map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
          'watch since=1',
          'note id=n2 seq=2',
          'reply id=n2 seq=3',
        ]);
        // A watcher that restarts resumes past the last seq it printed: nothing twice, nothing lost.
        const resumed = yield* spawner.spawn(
          ChildProcess.make('bun', ['cli.ts', 'notes', film, '--watch', '--since', '2'], {
            cwd: path.join(import.meta.dir, '..'),
            env: { FILMS_LAB: lab },
            extendEnv: true,
          }),
        );
        const again = Option.getOrThrow(
          yield* Stream.decodeText(resumed.stdout).pipe(
            Stream.splitLines,
            Stream.take(2),
            Stream.runCollect,
            Effect.timeoutOption(Duration.seconds(20)),
          ),
        );
        expect(again.map((l) => l.split(' ').slice(0, 3).join(' '))).toEqual([
          'watch since=2',
          'reply id=n2 seq=3',
        ]);
      }).pipe(Effect.scoped, Effect.provide(LabStore)),
  );
});
