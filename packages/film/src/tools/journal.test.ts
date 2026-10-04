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
 * The disk as `fs`, but the first note to make `file` held at the moment it
 * has made it, until the test releases it (`release`); `made` is done then.
 * Made by an exclusive open, as the operating system does it: the file is
 * there, empty, before the writing that follows lands at its start, so a
 * note appending in between is written over. Made by a link, the file is
 * there whole, and the hold changes nothing.
 */
const holdingMaker = (
  fs: FileSystem.FileSystem,
  file: string,
  made: Deferred.Deferred<boolean>,
  release: Deferred.Deferred<boolean>,
) =>
  Effect.gen(function* () {
    const makers = yield* Ref.make(0);
    const hold = Effect.gen(function* () {
      if ((yield* Ref.getAndUpdate(makers, (n) => n + 1)) > 0) return;
      yield* Deferred.succeed(made, true);
      yield* Deferred.await(release);
    });
    return FileSystem.FileSystem.of({
      ...fs,
      writeFileString: (path, data, options) => {
        if (path !== file || options?.flag !== 'wx') return fs.writeFileString(path, data, options);
        return Effect.gen(function* () {
          yield* fs.writeFileString(path, '', { flag: 'wx' });
          yield* hold;
          yield* fs.writeFileString(path, data, { flag: 'r+' });
        });
      },
      link: (from, to) => {
        if (to !== file) return fs.link(from, to);
        return Effect.andThen(fs.link(from, to), hold);
      },
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
    'two notes at once on a film with no journal both land: one made it and went no further while the other wrote',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const { films, file } = yield* filmsHere;
        const made = yield* Deferred.make<boolean>();
        const release = yield* Deferred.make<boolean>();
        const raced = yield* holdingMaker(fs, file, made, release);
        const first = yield* Effect.forkChild(
          withFileSystem(films, raced, note(film, 'first', Option.none())),
        );
        // The second note lands whole while the first has made the journal and gone no further.
        yield* Deferred.await(made);
        yield* withFileSystem(films, raced, note(film, 'second', Option.none()));
        yield* Deferred.succeed(release, true);
        yield* Fiber.join(first);
        const text = yield* fs.readFileString(file);
        expect(entriesOf(text).map((e) => e.text)).toEqual(['first', 'second']);
        expect(text.startsWith(`# Journal: f\n\n${JOURNAL_RULE}\n`)).toBe(true);
        expect(text.split(JOURNAL_RULE)).toHaveLength(2);
        // No draft is left beside it.
        expect((yield* fs.readDirectory(path.dirname(file))).sort()).toEqual([
          'journal.md',
          'scenes',
        ]);
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
