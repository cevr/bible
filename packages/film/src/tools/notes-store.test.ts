// NotesStore: notes saved together all land, in one process or two; a crash
// mid-write leaves the last good file; a file that does not decode is refused,
// never overwritten; a wait reports each change past its cursor once.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import {
  ConfigProvider,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import { TestClock } from 'effect/testing';
import { type NoteDraft, NotesFileJson } from '../core/schema.ts';
import { ContentStore } from './content-store.ts';
import { FilmName } from './film-repo.ts';
import { ManifestLock } from './manifest-lock.ts';
import { NotesStore } from './notes-store.ts';
import { crashingFileSystem, memoryFileSystem, memoryManifestLock, text } from './testing.ts';

const film = FilmName.make('f');
const draft = (text: string): NoteDraft => ({ scene: 'a', T: 1.5, frame: 45, text });
const png = text('png');

const labAt = (dir: string) => ConfigProvider.layer(ConfigProvider.fromUnknown({ FILMS_LAB: dir }));

/** A store over `fs`, with notes under `/lab`, its locks in memory. */
const storeOver = <E, R>(fs: Layer.Layer<FileSystem.FileSystem, E, R>) =>
  NotesStore.layer.pipe(
    Layer.provide(ContentStore.layer),
    Layer.provide([
      fs,
      Path.layer,
      labAt('/lab'),
      Layer.succeed(ManifestLock, memoryManifestLock()),
    ]),
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
      // No partial file is left behind.
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

  it.effect('a wait returns each change past its cursor once, and wakes on a new one', () =>
    Effect.gen(function* () {
      const notes = yield* NotesStore;
      yield* notes.add(film, draft('first'), png);
      const first = yield* notes.wait(film, 0, '1 second');
      expect(first.events.map((e) => [e._tag, e.note.id])).toEqual([['NoteAdded', 'n1']]);
      // Nothing past the cursor: the wait times out empty and keeps the cursor.
      const idle = yield* Effect.forkChild(notes.wait(film, first.cursor, '300 millis'));
      yield* TestClock.adjust('300 millis');
      expect(yield* Fiber.join(idle)).toEqual({ cursor: 1, events: [] });
      // A wait already running (it has read the file and found nothing) sees a note saved after it began.
      const waiting = yield* Effect.forkChild(notes.wait(film, first.cursor, '5 seconds'));
      yield* TestClock.adjust('200 millis');
      yield* notes.reply(film, 'n1', { by: 'user', text: 'and this', still: Option.none() });
      yield* TestClock.adjust('200 millis');
      const next = yield* Fiber.join(waiting);
      expect(next.events.map((e) => [e._tag, e.seq])).toEqual([['NoteReplied', 2]]);
      expect(next.cursor).toBe(2);
    }).pipe(Effect.provide(storeOver(memoryFileSystem(new Map())))),
  );

  it.effect(
    'a wait past a file reset to an empty log answers at once, at the file’s cursor',
    () => {
      const files = new Map<string, Uint8Array>();
      return Effect.gen(function* () {
        const notes = yield* NotesStore;
        for (const t of ['a', 'b', 'c', 'd', 'e']) yield* notes.add(film, draft(t), png);
        // The notes file is trashed: the film reads as an empty log again.
        files.delete('/lab/f/notes.json');
        const waiting = yield* Effect.forkChild(notes.wait(film, 5, '5 seconds'));
        yield* TestClock.adjust('10 millis');
        expect(Option.isSome(Option.fromUndefinedOr(waiting.pollUnsafe()))).toBe(true);
        expect(yield* Fiber.join(waiting)).toEqual({ cursor: 0, events: [] });
      }).pipe(Effect.provide(storeOver(memoryFileSystem(files))));
    },
  );

  it.live('two stores (two SQLite connections) writing one film’s notes at once both land', () =>
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
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});
