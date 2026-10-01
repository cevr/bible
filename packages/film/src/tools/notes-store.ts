// The lab's notes, on disk: `lab/<film>/notes.json` and the stills in
// `lab/<film>/stills/`. The file is the source of truth; the lab server and
// `film notes` both read and write it through this store, so either works
// without the other. Every change is one `ContentStore.transact`: written
// whole, one writer at a time across processes (the manifest's lock,
// `notes.json.lock`), its still written under the same lock, so a note saved
// in the lab and a reply sent from the CLI at the same moment both land.

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
} from 'effect';
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
import { NoteNotFound } from '../core/refusals.ts';
import type { FilmName } from './film-repo.ts';

/** Where one film's notes live. A film is named by `filmNamed`, so no unchecked name reaches a path. */
export interface NotesPaths {
  readonly dir: string;
  readonly stills: string;
  readonly notes: Manifest<NotesFile>;
}

/** A reply as a writer hands it in: its still, when it has one, as PNG bytes. */
interface ReplyInput {
  readonly by: NoteAuthor;
  readonly text: string;
  readonly still: Option.Option<Uint8Array>;
}

type NotesError = StoreError;

interface NotesStoreService {
  readonly paths: (film: FilmName) => NotesPaths;
  /** Every note of the film; an empty log before the first. */
  readonly read: (film: FilmName) => Effect.Effect<NotesFile, StoreError>;
  /** Save a new note and the still of its frame. */
  readonly add: (
    film: FilmName,
    draft: NoteDraft,
    still: Uint8Array,
  ) => Effect.Effect<Note, NotesError>;
  readonly reply: (
    film: FilmName,
    id: string,
    reply: ReplyInput,
  ) => Effect.Effect<Note, NotesError | NoteNotFound>;
  readonly resolve: (film: FilmName, id: string) => Effect.Effect<Note, NotesError | NoteNotFound>;
  /**
   * The changes after `since`, as soon as there is one, or none once `timeout`
   * passes. Reads the file, so it sees every writer's changes.
   */
  readonly wait: (
    film: FilmName,
    since: number,
    timeout: Duration.Input,
  ) => Effect.Effect<NotesWait, StoreError>;
  /** A still's file, when `name` is one of this film's stills. */
  readonly still: (
    film: FilmName,
    name: string,
  ) => Effect.Effect<Option.Option<string>, StoreError>;
}

/** How often a wait reads the file for changes. */
const POLL = Duration.millis(200);

/** A still is a PNG named by the store (`n3.png`, `n3.r5.png`): never a path. */
const STILL_NAME = /^n\d+(\.r\d+)?\.png$/;

export class NotesStore extends Context.Service<NotesStore, NotesStoreService>()(
  '@bible/film/tools/NotesStore',
) {
  /** Notes under `FILMS_LAB` (the app's `lab/` under `runFilmCli`, else `<cwd>/lab`), one folder per film. */
  static readonly layer = Layer.effect(
    NotesStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const store = yield* ContentStore;
      const root = yield* Config.String('FILMS_LAB').pipe(Config.withDefault(path.resolve('lab')));

      const paths = (film: FilmName): NotesPaths => {
        const dir = path.join(root, film);
        return {
          dir,
          stills: path.join(dir, 'stills'),
          notes: {
            file: path.join(dir, 'notes.json'),
            codec: NotesFileJson,
            empty: emptyNotes(film),
          },
        };
      };

      const read = (film: FilmName) => store.read(paths(film).notes);

      const now = Effect.map(DateTime.now, DateTime.formatIso);

      /** The note `id` in `file`, or `NoteNotFound` listing the ones there are. */
      const find = (film: FilmName, file: NotesFile, id: string) =>
        Effect.fromOption(noteById(file, id), () =>
          NoteNotFound.make({ film, id, known: file.notes.map((n) => n.id) }),
        );

      /** The note `id` as a change left it. */
      const after = (film: FilmName, file: NotesFile, id: string) =>
        find(film, file, id).pipe(Effect.orDie);

      const add = Effect.fn('NotesStore.add')(function* (
        film: FilmName,
        draft: NoteDraft,
        still: Uint8Array,
      ) {
        const at = paths(film);
        const note = yield* store.transact(at.notes, (current) =>
          Effect.gen(function* () {
            const next = addNote(current, draft, yield* now);
            const made = yield* Effect.fromOption(Arr.last(next.notes)).pipe(Effect.orDie);
            // The still first: a note never names a frame that is not on disk.
            yield* store.writeFile(path.join(at.stills, made.still), still);
            return [made, next] as const;
          }),
        );
        yield* Effect.log(`notes.add film=${film} id=${note.id} scene=${note.scene} T=${note.T}`);
        return note;
      });

      const reply = Effect.fn('NotesStore.reply')(function* (
        film: FilmName,
        id: string,
        input: ReplyInput,
      ) {
        const at = paths(film);
        const note = yield* store.transact(at.notes, (current) =>
          Effect.gen(function* () {
            yield* find(film, current, id);
            // The reply's number is the next change: its still is named for it.
            const name = replyStill(id, current.seq + 1);
            yield* Effect.forEach(Option.toArray(input.still), (bytes) =>
              store.writeFile(path.join(at.stills, name), bytes),
            );
            const next = replyToNote(
              current,
              id,
              { by: input.by, text: input.text, still: Option.as(input.still, name) },
              yield* now,
            );
            return [yield* after(film, next, id), next] as const;
          }),
        );
        yield* Effect.log(`notes.reply film=${film} id=${id} by=${input.by} status=${note.status}`);
        return note;
      });

      const resolve = Effect.fn('NotesStore.resolve')(function* (film: FilmName, id: string) {
        const note = yield* store.transact(paths(film).notes, (current) =>
          Effect.gen(function* () {
            yield* find(film, current, id);
            const next = resolveNote(current, id);
            return [yield* after(film, next, id), next] as const;
          }),
        );
        yield* Effect.log(`notes.resolve film=${film} id=${id}`);
        return note;
      });

      const wait = Effect.fn('NotesStore.wait')(function* (
        film: FilmName,
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

      const still = Effect.fn('NotesStore.still')(function* (film: FilmName, name: string) {
        if (!STILL_NAME.test(name)) return Option.none<string>();
        const file = path.join(paths(film).stills, name);
        if (!(yield* fs.exists(file))) return Option.none<string>();
        return Option.some(file);
      });

      return NotesStore.of({ paths, read, add, reply, resolve, wait, still });
    }),
  );
}
