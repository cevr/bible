// NotesStore: notes saved together all land, in one process or two; a crash
// mid-write leaves the last good file; a file that does not decode is refused,
// never overwritten; a wait reports each change past its cursor once.

import { BunServices } from '@effect/platform-bun';
import { test } from 'bun:test';
import { describe, expect, it } from 'effect-bun-test';
import {
  Clock,
  ConfigProvider,
  DateTime,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import { type NoteDraft, NotesFileJson } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { LockOwnerJson, NotesStore, lockVerdict } from './notes-store.ts';
import { crashingFileSystem, memoryFileSystem, text } from './testing.ts';

const film = 'f';
const draft = (text: string): NoteDraft => ({ scene: 'a', T: 1.5, frame: 45, text });
const png = text('png');

const labAt = (dir: string) => ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: dir }));

/** A store over `fs`, with notes under `/lab`. */
const storeOver = <E, R>(fs: Layer.Layer<FileSystem.FileSystem, E, R>) =>
  NotesStore.layer.pipe(
    Layer.provide(ContentStore.layer),
    Layer.provide([fs, Path.layer, labAt('/lab')]),
  );

describe('NotesStore', () => {
  it.effect('notes saved at once all land, each with its still', () => {
    const files = new Map<string, Uint8Array>();
    return Effect.gen(function* () {
      const notes = yield* NotesStore;
      const texts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      yield* Effect.forEach(texts, (t) => notes.add(film, draft(t), png), {
        concurrency: texts.length,
      });
      const file = yield* notes.read(film);
      expect(file.seq).toBe(8);
      expect(file.notes.map((n) => n.text).toSorted()).toEqual(texts);
      expect(file.notes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8']);
      for (const n of file.notes) expect(files.has(`/lab/f/stills/${n.still}`)).toBe(true);
      // No lock is left behind and no partial file.
      expect([...files.keys()].some((k) => k.endsWith('.partial'))).toBe(false);
    }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
  });

  it.effect('a reply names its still by its change; the agent’s marks the note replied', () =>
    Effect.gen(function* () {
      const notes = yield* NotesStore;
      yield* notes.add(film, draft('lower the hand'), png);
      const replied = yield* notes.reply(film, 'n1', {
        by: 'agent',
        text: 'lowered 40px',
        still: Option.some(png),
      });
      expect(replied.status).toBe('replied');
      expect(replied.thread).toEqual([
        { seq: 2, by: 'agent', text: 'lowered 40px', still: 'n1.r2.png', at: expect.any(String) },
      ]);
      expect(yield* notes.still(film, 'n1.r2.png')).toEqual(Option.some('/lab/f/stills/n1.r2.png'));
      // A name that is not a still is never a path.
      expect(yield* notes.still(film, '../notes.json')).toEqual(Option.none());
      const resolved = yield* notes.resolve(film, 'n1');
      expect(resolved.status).toBe('resolved');
    }).pipe(Effect.provide(storeOver(memoryFileSystem(new Map())))),
  );

  it.effect('an unknown note fails, naming the notes there are', () =>
    Effect.gen(function* () {
      const notes = yield* NotesStore;
      yield* notes.add(film, draft('x'), png);
      const error = yield* Effect.flip(notes.resolve(film, 'n9'));
      expect(error).toMatchObject({ _tag: 'NoteNotFound', id: 'n9', known: ['n1'] });
    }).pipe(Effect.provide(storeOver(memoryFileSystem(new Map())))),
  );

  it.effect('a crash while renaming notes.json leaves the last good file', () => {
    const files = new Map<string, Uint8Array>();
    const first = Effect.gen(function* () {
      yield* (yield* NotesStore).add(film, draft('kept'), png);
    }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
    // Writes: the still's partial (1), its rename (2), notes.json's partial (3), its rename (4).
    const crashing = crashingFileSystem(files, 4);
    const second = Effect.gen(function* () {
      return yield* Effect.exit((yield* NotesStore).add(film, draft('lost'), png));
    }).pipe(Effect.provide(storeOver(crashing.layer)));
    return Effect.gen(function* () {
      yield* first;
      const exit = yield* second;
      expect(Exit.isFailure(exit)).toBe(true);
      const file = yield* Schema.decodeEffect(NotesFileJson)(
        new TextDecoder().decode(files.get('/lab/f/notes.json')),
      );
      expect(file.notes.map((n) => n.text)).toEqual(['kept']);
    });
  });

  it.effect('a notes.json that does not decode is refused and left as it was', () => {
    const bad = text('{"film":"f","seq":"one","notes":[]}\n');
    const files = new Map<string, Uint8Array>([['/lab/f/notes.json', bad]]);
    return Effect.gen(function* () {
      const notes = yield* NotesStore;
      expect((yield* Effect.flip(notes.read(film)))._tag).toBe('FileInvalid');
      expect((yield* Effect.flip(notes.add(film, draft('x'), png)))._tag).toBe('FileInvalid');
      expect(files.get('/lab/f/notes.json')).toEqual(bad);
    }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
  });

  it.live('a wait returns each change past its cursor once, and wakes on a new one', () =>
    Effect.gen(function* () {
      const notes = yield* NotesStore;
      yield* notes.add(film, draft('first'), png);
      const first = yield* notes.wait(film, 0, '1 second');
      expect(first.events.map((e) => [e._tag, e.note.id])).toEqual([['NoteAdded', 'n1']]);
      // Nothing past the cursor: the wait times out empty and keeps the cursor.
      expect(yield* notes.wait(film, first.cursor, '300 millis')).toEqual({
        cursor: 1,
        events: [],
      });
      // A wait already running sees a note saved after it began.
      const waiting = yield* Effect.forkChild(notes.wait(film, first.cursor, '5 seconds'));
      yield* Effect.sleep('250 millis');
      yield* notes.reply(film, 'n1', { by: 'user', text: 'and this', still: Option.none() });
      const next = yield* Fiber.join(waiting);
      expect(next.events.map((e) => [e._tag, e.seq])).toEqual([['NoteReplied', 2]]);
      expect(next.cursor).toBe(2);
    }).pipe(Effect.provide(storeOver(memoryFileSystem(new Map())))),
  );

  it.live('two processes writing one film’s notes at once both land', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      // Two stores, each with its own Semaphore: only the lock keeps them apart.
      const store = () =>
        NotesStore.layer.pipe(
          Layer.provide(ContentStore.layer),
          Layer.provide([BunServices.layer, labAt(dir)]),
        );
      const burst = (who: string) =>
        Effect.forEach(
          ['1', '2', '3', '4', '5'],
          (i) => Effect.flatMap(NotesStore, (n) => n.add(film, draft(`${who}${i}`), png)),
          { concurrency: 5 },
        ).pipe(Effect.provide(store()));
      yield* Effect.all([burst('a'), burst('b')], { concurrency: 2 });
      const file = yield* Schema.decodeEffect(NotesFileJson)(
        yield* fs.readFileString(`${dir}/${film}/notes.json`),
      );
      expect(file.seq).toBe(10);
      expect(new Set(file.notes.map((n) => n.id)).size).toBe(10);
      expect(yield* fs.exists(`${dir}/${film}/notes.lock`)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  /** A store over the real file system, notes under `dir`. */
  const storeAt = (dir: string) =>
    NotesStore.layer.pipe(
      Layer.provide(ContentStore.layer),
      Layer.provide([BunServices.layer, labAt(dir)]),
    );

  /** Add one note through a fresh store over `dir`: another process, as far as the lock knows. */
  const addAt = (dir: string) =>
    Effect.flatMap(NotesStore, (n) => n.add(film, draft('after'), png)).pipe(
      Effect.provide(storeAt(dir)),
    );

  /** The pid of a process that has exited: it names no one now. */
  const deadPid = Effect.scoped(
    Effect.gen(function* () {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const handle = yield* spawner.spawn(ChildProcess.make('true', []));
      yield* handle.exitCode;
      return Number(handle.pid);
    }),
  );

  it.live('a lock left by a writer that died is broken, and the next write lands', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      yield* fs.makeDirectory(`${dir}/${film}`, { recursive: true });
      const created = yield* Clock.currentTimeMillis;
      const owner = { pid: yield* deadPid, created, token: 'crashed' };
      yield* fs.writeFileString(
        `${dir}/${film}/notes.lock`,
        yield* Schema.encodeEffect(LockOwnerJson)(owner),
      );
      const note = yield* addAt(dir);
      expect(note.id).toBe('n1');
      // Broken at once, not after the 5 s of retries a live lock gets.
      expect((yield* Clock.currentTimeMillis) - created).toBeLessThan(2000);
      expect(yield* fs.exists(`${dir}/${film}/notes.lock`)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.live('a lock older than 30 s is broken, whoever holds it (an old lock directory too)', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const dir = yield* fs.makeTempDirectoryScoped();
      const lock = `${dir}/${film}/notes.lock`;
      // What a crashed writer of the old store left: a bare directory, a minute old.
      yield* fs.makeDirectory(lock, { recursive: true });
      const old = DateTime.toDate(DateTime.subtract(yield* DateTime.now, { minutes: 1 }));
      yield* fs.utimes(lock, old, old);
      const note = yield* addAt(dir);
      expect(note.id).toBe('n1');
      expect(yield* fs.exists(lock)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  test('a lock is stale when its holder is gone or it is past 30 s; a live, fresh one holds', () => {
    const owner = { pid: 42, created: 1_000_000, token: 't' };
    const alive = () => true;
    expect(lockVerdict(Option.some(owner), 1_000_000 + 29_000, alive)).toEqual(Option.none());
    expect(lockVerdict(Option.some(owner), 1_000_000 + 1_000, () => false)).toEqual(
      Option.some('its holder, pid 42, is gone'),
    );
    expect(lockVerdict(Option.some(owner), 1_000_000 + 31_000, alive)).toEqual(
      Option.some('it was taken 31 s ago'),
    );
  });
});
