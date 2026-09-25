// The lab's notes, on disk: `lab/<film>/notes.json` and the stills in
// `lab/<film>/stills/`. The file is the source of truth; the lab server and
// `film notes` both read and write it through this store, so either works
// without the other. Every write is atomic (a partial file renamed into
// place, via ContentStore), serialized in the process (a Semaphore) and across
// processes (a lock directory made and removed around each change), so a note
// saved in the lab and a reply sent from the CLI at the same moment both land.

import {
  Array as Arr,
  Config,
  Context,
  DateTime,
  Duration,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schedule,
  Semaphore,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import {
  addNote,
  emptyNotes,
  eventsSince,
  noteById,
  replyStill,
  replyToNote,
  resolveNote,
} from '../core/notes.ts';
import {
  type Note,
  type NoteAuthor,
  type NoteDraft,
  type NotesFile,
  NotesFileJson,
  type NotesWait,
} from '../core/schema.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { NoteNotFound, NotesLocked } from './errors.ts';

/** Where one film's notes live. */
export interface NotesPaths {
  readonly dir: string;
  readonly stills: string;
  readonly lock: string;
  readonly notes: Manifest<NotesFile>;
}

/** A reply as a writer hands it in: its still, when it has one, as PNG bytes. */
export interface ReplyInput {
  readonly by: NoteAuthor;
  readonly text: string;
  readonly still: Option.Option<Uint8Array>;
}

export type NotesError = StoreError | NotesLocked;

export interface NotesStoreService {
  readonly paths: (film: string) => NotesPaths;
  /** Every note of the film; an empty log before the first. */
  readonly read: (film: string) => Effect.Effect<NotesFile, StoreError>;
  /** Save a new note and the still of its frame. */
  readonly add: (
    film: string,
    draft: NoteDraft,
    still: Uint8Array,
  ) => Effect.Effect<Note, NotesError>;
  readonly reply: (
    film: string,
    id: string,
    reply: ReplyInput,
  ) => Effect.Effect<Note, NotesError | NoteNotFound>;
  readonly resolve: (film: string, id: string) => Effect.Effect<Note, NotesError | NoteNotFound>;
  /**
   * The changes after `since`, as soon as there is one, or none once `timeout`
   * passes. Reads the file, so it sees every writer's changes.
   */
  readonly wait: (
    film: string,
    since: number,
    timeout: Duration.Input,
  ) => Effect.Effect<NotesWait, StoreError>;
  /** A still's file, when `name` is one of this film's stills. */
  readonly still: (film: string, name: string) => Effect.Effect<Option.Option<string>, StoreError>;
}

/** How often a wait reads the file for changes. */
const POLL = Duration.millis(200);
/** How long a writer waits for another process's lock before giving up. */
const LOCK_TRIES = 250;
const LOCK_SPACING = Duration.millis(20);

/** A still is a PNG named by the store (`n3.png`, `n3.r5.png`): never a path. */
const STILL_NAME = /^n\d+(\.r\d+)?\.png$/;

const isAlreadyExists = (error: PlatformError) => error.reason._tag === 'AlreadyExists';

export class NotesStore extends Context.Service<NotesStore, NotesStoreService>()(
  '@bible/film/tools/NotesStore',
) {
  /** Notes under `FILMS_LAB` (default `<cwd>/lab`), one folder per film. */
  static readonly layer = Layer.effect(
    NotesStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const root = yield* Config.String('FILMS_LAB').pipe(Config.withDefault(path.resolve('lab')));
      const writer = yield* Semaphore.make(1);

      const paths = (film: string): NotesPaths => {
        const dir = path.join(root, film);
        return {
          dir,
          stills: path.join(dir, 'stills'),
          lock: path.join(dir, 'notes.lock'),
          notes: {
            file: path.join(dir, 'notes.json'),
            codec: NotesFileJson,
            empty: emptyNotes(film),
          },
        };
      };

      /** Hold the film's lock (a directory: making one is atomic) for one change. */
      const locked = <A, E>(at: NotesPaths, change: Effect.Effect<A, E>) =>
        Effect.acquireUseRelease(
          fs.makeDirectory(at.dir, { recursive: true }).pipe(
            Effect.andThen(
              fs.makeDirectory(at.lock).pipe(
                Effect.retry({
                  while: isAlreadyExists,
                  times: LOCK_TRIES,
                  schedule: Schedule.spaced(LOCK_SPACING),
                }),
                Effect.catchIf(isAlreadyExists, () =>
                  Effect.fail(NotesLocked.make({ lock: at.lock })),
                ),
              ),
            ),
          ),
          () => change,
          () =>
            fs
              .remove(at.lock, { recursive: true })
              .pipe(
                Effect.catchTag('PlatformError', (error) =>
                  Effect.logWarning(`notes.unlock lock=${at.lock} reason=${error.message}`),
                ),
              ),
        ).pipe(writer.withPermits(1));

      const read = (film: string) => store.read(paths(film).notes);

      const now = Effect.map(DateTime.now, DateTime.formatIso);

      /** The note `id` in `file`, or `NoteNotFound` listing the ones there are. */
      const find = (film: string, file: NotesFile, id: string) =>
        Option.match(noteById(file, id), {
          onNone: () =>
            Effect.fail(NoteNotFound.make({ film, id, known: file.notes.map((n) => n.id) })),
          onSome: Effect.succeed,
        });

      /** The note `id` as a change left it. */
      const after = (film: string, file: NotesFile, id: string) =>
        find(film, file, id).pipe(Effect.orDie);

      const add = Effect.fn('NotesStore.add')(function* (
        film: string,
        draft: NoteDraft,
        still: Uint8Array,
      ) {
        const at = paths(film);
        const note = yield* locked(
          at,
          Effect.gen(function* () {
            const current = yield* store.read(at.notes);
            const time = yield* now;
            const next = addNote(current, draft, time);
            const made = yield* Effect.fromOption(Arr.last(next.notes)).pipe(Effect.orDie);
            // The still first: a note never names a frame that is not on disk.
            yield* store.writeFile(path.join(at.stills, made.still), still);
            yield* store.update(at.notes, (file) => addNote(file, draft, time));
            return made;
          }),
        );
        yield* Effect.log(`notes.add film=${film} id=${note.id} scene=${note.scene} T=${note.T}`);
        return note;
      });

      const reply = Effect.fn('NotesStore.reply')(function* (
        film: string,
        id: string,
        input: ReplyInput,
      ) {
        const at = paths(film);
        const note = yield* locked(
          at,
          Effect.gen(function* () {
            const current = yield* store.read(at.notes);
            yield* find(film, current, id);
            // The reply's number is the next change: its still is named for it.
            const name = replyStill(id, current.seq + 1);
            yield* Effect.forEach(Option.toArray(input.still), (bytes) =>
              store.writeFile(path.join(at.stills, name), bytes),
            );
            const time = yield* now;
            const next = yield* store.update(at.notes, (file) =>
              replyToNote(
                file,
                id,
                { by: input.by, text: input.text, still: Option.as(input.still, name) },
                time,
              ),
            );
            return yield* after(film, next, id);
          }),
        );
        yield* Effect.log(`notes.reply film=${film} id=${id} by=${input.by} status=${note.status}`);
        return note;
      });

      const resolve = Effect.fn('NotesStore.resolve')(function* (film: string, id: string) {
        const at = paths(film);
        const note = yield* locked(
          at,
          Effect.gen(function* () {
            yield* find(film, yield* store.read(at.notes), id);
            const next = yield* store.update(at.notes, (file) => resolveNote(file, id));
            return yield* after(film, next, id);
          }),
        );
        yield* Effect.log(`notes.resolve film=${film} id=${id}`);
        return note;
      });

      const wait = Effect.fn('NotesStore.wait')(function* (
        film: string,
        since: number,
        timeout: Duration.Input,
      ) {
        const found = yield* read(film).pipe(
          Effect.map((file) => eventsSince(file, since)),
          Effect.repeat({ until: (w) => w.events.length > 0, schedule: Schedule.spaced(POLL) }),
          Effect.timeoutOption(timeout),
        );
        return Option.getOrElse(found, (): NotesWait => ({ cursor: since, events: [] }));
      });

      const still = Effect.fn('NotesStore.still')(function* (film: string, name: string) {
        if (!STILL_NAME.test(name)) return Option.none<string>();
        const file = path.join(paths(film).stills, name);
        if (!(yield* fs.exists(file))) return Option.none<string>();
        return Option.some(file);
      });

      return NotesStore.of({ paths, read, add, reply, resolve, wait, still });
    }),
  );
}
