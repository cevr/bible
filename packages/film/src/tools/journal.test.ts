// The journal: a first note makes the file with its rule, each note is
// appended as one dated, placed line (words run together, a leading `#`
// kept as text), an empty note is refused, and a read answers the newest
// entries of a scene or all, oldest first, within its count and its
// character cap, saying how many it left out.

import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Deferred, Effect, Fiber, FileSystem, Layer, Option, Path, Ref } from 'effect';
import { TestClock } from 'effect/testing';
import { FilmFolder, type FilmName } from './film-repo.ts';
import {
  JOURNAL_RULE,
  type JournalEntry,
  entriesOf,
  entryLine,
  note,
  pageOf,
  read,
} from './journal.ts';

const film = 'f' as FilmName;

/** A films folder in a temp directory with film `f`, and its folder. */
const filmsHere = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped();
  const films = path.join(dir, 'films');
  yield* fs.makeDirectory(path.join(films, 'f', 'scenes'), { recursive: true });
  return { films, file: path.join(films, 'f', 'journal.md') };
});

const withFolder = <A, E, R>(films: string, effect: Effect.Effect<A, E, R>) =>
  Effect.provide(effect, FilmFolder.layer(films).pipe(Layer.provideMerge(BunServices.layer)));

const entry = (at: string, scene: string, text: string): JournalEntry => ({ at, scene, text });

/**
 * The film's journal over `fs`, but each look at whether `file` is there
 * held in the order that loses a note when a journal is made by looking
 * first: both callers find it missing, the first goes on alone until the
 * test releases the second (`second`). Holds only while `holding` is set.
 */
const racing = (
  fs: FileSystem.FileSystem,
  file: string,
  holding: Ref.Ref<boolean>,
  second: Deferred.Deferred<boolean>,
) =>
  Effect.gen(function* () {
    const looked = yield* Ref.make(0);
    const bothLooked = yield* Deferred.make<boolean>();
    return FileSystem.FileSystem.of({
      ...fs,
      exists: (path) =>
        Effect.gen(function* () {
          const there = yield* fs.exists(path);
          if (path !== file || !(yield* Ref.get(holding))) return there;
          const n = yield* Ref.getAndUpdate(looked, (k) => k + 1);
          if (n === 0) yield* Deferred.await(bothLooked);
          if (n === 1) {
            yield* Deferred.succeed(bothLooked, true);
            yield* Deferred.await(second);
          }
          return there;
        }),
    });
  });

const withFileSystem = <A, E, R>(
  films: string,
  fs: FileSystem.FileSystem,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.provide(
    effect,
    FilmFolder.layer(films).pipe(Layer.provideMerge(Layer.succeed(FileSystem.FileSystem, fs))),
  );

describe('the journal', () => {
  it.effect(
    'a first note makes the file under its rule; each note is one dated, placed entry',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { films, file } = yield* filmsHere;
        yield* TestClock.setTime(Date.UTC(2026, 9, 4, 14, 50, 12, 345));
        const first = yield* withFolder(
          films,
          note(film, '  the four faces\nread as one mass  ', Option.some('roof')),
        );
        expect(first.entry).toEqual(
          entry('2026-10-04T14:50:12Z', 'roof', 'the four faces read as one mass'),
        );
        yield* withFolder(films, note(film, '# the title lands late', Option.none()));
        const text = yield* fs.readFileString(file);
        expect(text.startsWith(`# Journal: f\n\n${JOURNAL_RULE}\n`)).toBe(true);
        expect(text).toContain(
          '\n## 2026-10-04T14:50:12Z · roof\n\nthe four faces read as one mass\n',
        );
        expect(entriesOf(text)).toEqual([
          entry('2026-10-04T14:50:12Z', 'roof', 'the four faces read as one mass'),
          entry('2026-10-04T14:50:12Z', 'film', '# the title lands late'),
        ]);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect(
    'two notes at once on a film with no journal both land, in the order that lost one',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const { films, file } = yield* filmsHere;
        const holding = yield* Ref.make(true);
        const second = yield* Deferred.make<boolean>();
        const raced = yield* racing(fs, file, holding, second);
        const first = yield* Effect.forkChild(
          withFileSystem(films, raced, note(film, 'first', Option.none())),
        );
        const then = yield* Effect.forkChild(
          withFileSystem(films, raced, note(film, 'second', Option.none())),
        );
        // The first note lands whole before the second, which found no journal too, goes on.
        yield* Fiber.join(first);
        yield* Deferred.succeed(second, true);
        yield* Fiber.join(then);
        yield* Ref.set(holding, false);
        const text = yield* fs.readFileString(file);
        expect(entriesOf(text).map((e) => e.text)).toEqual(['first', 'second']);
        expect(text.split(JOURNAL_RULE)).toHaveLength(2);
      }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('an empty note is refused, and writes nothing', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const { films, file } = yield* filmsHere;
      const error = yield* Effect.flip(withFolder(films, note(film, ' \n\t', Option.none())));
      expect(error._tag).toBe('JournalEmpty');
      expect(yield* fs.exists(file)).toBe(false);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );

  it.effect('a read of a film with no journal is empty, naming the file', () =>
    Effect.gen(function* () {
      const { films, file } = yield* filmsHere;
      expect(yield* withFolder(films, read(film, Option.none()))).toEqual({
        file,
        lines: [],
        left: 0,
      });
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  );
});

describe('a page of the journal', () => {
  const entries = [
    entry('2026-10-01T00:00:00Z', 'roof', 'one'),
    entry('2026-10-02T00:00:00Z', 'cold', 'two'),
    entry('2026-10-03T00:00:00Z', 'roof', 'three'),
    entry('2026-10-04T00:00:00Z', 'roof', 'four'),
  ];

  it.effect('the newest of a scene, oldest first, and how many were left out', () =>
    Effect.sync(() => {
      expect(pageOf(entries, Option.some('roof'), 2, 7000)).toEqual({
        lines: [entryLine(entries[2] ?? entries[0]!), entryLine(entries[3] ?? entries[0]!)],
        left: 1,
      });
      expect(pageOf(entries, Option.none(), 20, 7000).lines).toHaveLength(4);
    }),
  );

  it.effect('the cap keeps the newest that fit, so a read never runs long', () =>
    Effect.sync(() => {
      const long = Array.from({ length: 50 }, (_, i) =>
        entry(`2026-10-04T00:00:${String(i).padStart(2, '0')}Z`, 'roof', 'x'.repeat(400)),
      );
      const page = pageOf(long, Option.none(), 50, 7000);
      expect(page.lines.join('\n').length).toBeLessThanOrEqual(7000);
      expect(page.lines.at(-1)).toContain('00:00:49Z');
      expect(page.left).toBe(50 - page.lines.length);
    }),
  );
});
