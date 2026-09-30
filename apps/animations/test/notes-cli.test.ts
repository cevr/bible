// `film notes` as it is run: it lists the open notes the lab saved, replies
// and resolves from the command line, and `--watch` prints each new note and
// each reply from the user once. Notes go to a temporary FILMS_LAB, so the
// real lab folder is never touched. No browser, no server, no paid call. Each
// test's timeout is its spawns' budget (`cli-run.ts`).

import { BunServices } from '@effect/platform-bun';
import { ContentStore, NotesStore } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Queue,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { FIXTURE_CLI, FIXTURE_FILM, SPAWN_MS, appDir, runCli, spawnBudget } from './cli-run.ts';

const film = FIXTURE_FILM;

/** The fixture CLI with `...args` and notes under `lab`: its exit code and everything it printed. */
const cli = (lab: string, ...args: ReadonlyArray<string>) => runCli({ FILMS_LAB: lab }, args);

/**
 * The fixture CLI's `notes <film> --watch ...flags` with notes under `lab`, running
 * until the test's scope ends: `next(n)` is the next `n` lines it prints, as
 * it prints them (none if a spawn's budget passes first). A test reads the
 * watch's first line before it makes a change, so what the watch saw at start
 * never depends on how fast it started.
 */
const watchCli = Effect.fn('test.watchCli')(function* (
  lab: string,
  ...flags: ReadonlyArray<string>
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const watch = yield* spawner.spawn(
    ChildProcess.make('bun', [FIXTURE_CLI, 'notes', film, '--watch', ...flags], {
      cwd: yield* appDir,
      env: { FILMS_LAB: lab },
      extendEnv: true,
    }),
  );
  const lines = yield* Queue.unbounded<string>();
  yield* Effect.forkScoped(
    Stream.decodeText(watch.stdout).pipe(
      Stream.splitLines,
      Stream.runForEach((line) => Queue.offer(lines, line)),
    ),
  );
  const next = (count: number) =>
    Effect.replicateEffect(Queue.take(lines), count).pipe(
      Effect.timeoutOption(Duration.millis(SPAWN_MS)),
      Effect.map(Option.getOrThrow),
    );
  return { next };
});

/** A line's first three fields: its kind, id or cursor, and change number. */
const head3 = (line: string) => line.split(' ').slice(0, 3).join(' ');

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

/** A note as the lab saves one: in the turn scene, boxed, nearest the fold cue. */
const cardNote = Effect.fn('test.cardNote')(function* (words: string) {
  return yield* (yield* NotesStore).add(
    film,
    {
      scene: 'turn',
      T: 5.35,
      frame: 160,
      cue: { name: 'fold', edge: 'end' },
      mark: 'page',
      box: { x: 860, y: 640, w: 200, h: 120 },
      text: words,
    },
    png,
  );
});

describe('film notes', () => {
  it.live(
    'lists open notes, replies with a still, resolves, and fails on an unknown id',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const lab = yield* labDir;
        const empty = yield* cli(lab, 'notes', film);
        expect(empty.exitCode).toBe(0);
        // No notes: only the cursor a watch resumes from.
        expect(empty.stdout).toBe('cursor seq=0\n');

        yield* cardNote('the card sits too low');
        const listed = yield* cli(lab, 'notes', film);
        expect(listed.exitCode).toBe(0);
        expect(listed.stdout.trim().split('\n')).toEqual([
          `note id=n1 seq=1 status=open scene=turn T=5.35 frame=160 cue=fold:end mark=page box=860,640,200x120 replies=0 still=${lab}/${film}/stills/n1.png text="the card sits too low"`,
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
    spawnBudget(6),
  );

  it.live(
    'a reply prints what the user said since the agent last replied: new notes and user replies',
    () =>
      Effect.gen(function* () {
        const notes = yield* NotesStore;
        const lab = yield* labDir;
        yield* cardNote('the card sits too low');
        // The agent's first reply: its cursor is 0, and the only note is the one it answers,
        // whose line it already printed.
        const first = yield* cli(lab, 'notes', 'reply', film, 'n1', 'raised it');
        expect(first.exitCode).toBe(0);
        expect(first.stdout.trim().split('\n').map(head3)).toEqual([
          'note id=n1 seq=2',
          'cursor seq=2',
        ]);
        // While the agent worked: a user reply on the first note, and two new notes (a note's
        // id is its change number: n4, n5).
        yield* notes.reply(film, 'n1', { by: 'user', text: 'lower still', still: Option.none() });
        yield* cardNote('and the cup');
        yield* cardNote('and the saucer');
        const second = yield* cli(lab, 'notes', 'reply', film, 'n4', 'moved the cup');
        const lines = second.stdout.trim().split('\n');
        // The note it answered, then what came past its last reply (seq 2) but that one, then
        // the cursor.
        expect(lines.map(head3)).toEqual([
          'note id=n4 seq=6',
          'reply id=n1 seq=3',
          'note id=n5 seq=5',
          'cursor seq=6',
        ]);
        expect(lines[1]).toContain('by=user');
        expect(lines[1]).toContain('text="lower still"');
        // --since picks the cursor instead: past 6, nothing new.
        const since = yield* cli(lab, 'notes', 'reply', film, 'n1', 'ok', '--since', '6');
        expect(since.stdout.trim().split('\n').map(head3)).toEqual([
          'note id=n1 seq=7',
          'cursor seq=7',
        ]);
      }).pipe(Effect.provide(LabStore)),
    spawnBudget(3),
  );

  it.live(
    '--watch prints each new note and user reply once, and not the agent’s',
    () =>
      Effect.gen(function* () {
        const notes = yield* NotesStore;
        const lab = yield* labDir;
        // One note before the watch starts: it is not new, so it is not printed.
        yield* cardNote('before');
        const watch = yield* watchCli(lab);
        // The cursor it starts from, read before anything changes.
        expect(yield* watch.next(1)).toEqual(['watch since=1']);
        yield* cardNote('after');
        yield* notes.reply(film, 'n1', { by: 'agent', text: 'mine', still: Option.none() });
        yield* notes.reply(film, 'n2', { by: 'user', text: 'and lower', still: Option.none() });
        // Each line carries its own change number.
        const got = yield* watch.next(2);
        expect(got.map(head3)).toEqual(['note id=n2 seq=2', 'reply id=n2 seq=4']);
        expect(got[1]).toContain('by=user');
        expect(got[1]).toContain('text="and lower"');
      }).pipe(Effect.scoped, Effect.provide(LabStore)),
    spawnBudget(1),
  );

  it.live(
    'list, then watch from the cursor it printed: a note made between the two is not lost',
    () =>
      Effect.gen(function* () {
        const notes = yield* NotesStore;
        const lab = yield* labDir;
        yield* cardNote('seen by the list');
        const listed = yield* cli(lab, 'notes', film);
        const cursor = /^cursor seq=(\d+)$/m.exec(listed.stdout)?.[1];
        expect(cursor).toBe('1');
        // Made after the list, before the watch starts: the gap a Monitor used to fall into.
        yield* cardNote('made in the gap');
        yield* notes.reply(film, 'n2', { by: 'user', text: 'and this', still: Option.none() });
        const watch = yield* watchCli(lab, '--since', `${cursor}`);
        expect((yield* watch.next(3)).map(head3)).toEqual([
          'watch since=1',
          'note id=n2 seq=2',
          'reply id=n2 seq=3',
        ]);
        // A watcher that restarts resumes past the last seq it printed: nothing twice, nothing lost.
        const resumed = yield* watchCli(lab, '--since', '2');
        expect((yield* resumed.next(2)).map(head3)).toEqual(['watch since=2', 'reply id=n2 seq=3']);
      }).pipe(Effect.scoped, Effect.provide(LabStore)),
    spawnBudget(3),
  );
});
