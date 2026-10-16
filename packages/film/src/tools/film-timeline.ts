// A film's timeline as the lab reads it (`core/film-timeline.ts` is the
// model): the version's clock read fresh (`film read clock`, kept under the
// film's source stamp, so a script or a take changed while the lab is open
// is read once after the change) and its Board, each from the version's own
// files (its folder, `<film>/v<n>/`, or the film's registered files); the
// open version's Board; and the film's catalogue, notes, the lab's asks, the
// production's ledger and the agents' "doing now" lines. The `timeline` tool
// answers it; the studio page reads the same service.

import {
  Array as Arr,
  Cache,
  Context,
  Data,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
} from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { pickVersion, timelineOf, versionsOf } from '../core/film-timeline.ts';
import type { FilmTimeline } from '../core/timeline-schema.ts';
import type { FilmUnknown, FilmVersionUnkept, FilmVersionUnknown } from '../core/refusals.ts';
import { Segment } from '../core/segment.ts';
import { AskStore } from './ask-store.ts';
import { BoardStore } from './board-store.ts';
import { type CatalogueError, RenderCatalogue } from './catalogue.ts';
import type { StoreError } from './content-store.ts';
import { FilmFolder, type FilmName, filmNamed, keptWhenMade } from './film-repo.ts';
import { type FreshError, FreshFilm } from './fresh-film.ts';
import { NotesStore } from './notes-store.ts';
import { ProductionStore } from './production-store.ts';
import { Working } from './working.ts';

/** Why a timeline does not read: the film or the version is not there, or a source does not read. */
type TimelineError =
  | FilmUnknown
  | FilmVersionUnknown
  | FilmVersionUnkept
  | FreshError
  | StoreError
  | CatalogueError
  | PlatformError;

interface FilmTimelinesService {
  /** `film`'s timeline at version `version`, else at its production's open version. */
  readonly timeline: (
    film: string,
    version: Option.Option<number>,
  ) => Effect.Effect<FilmTimeline, TimelineError>;
}

/** A version's clock at one stamp of the film's sources: the key a fresh read is kept under. */
class Clocked extends Data.Class<{
  readonly film: FilmName;
  readonly stamp: number;
  /** The version folder (`v2`); none for the film's registered files. */
  readonly folder: Option.Option<string>;
}> {}

/** How many versions' clocks the lab keeps read at once. */
const CLOCKS_KEPT = 16;

/** A version folder's name: `v<n>`. */
const folderOf = (n: number) => Segment.make(`v${n}`);

/** The folder a version's files are in: its own for a folder version, none for the film's registered files. */
const filesOf = (version: { readonly n: number; readonly files: string }) =>
  Option.as(
    Option.liftPredicate(version, (v) => v.files === 'folder'),
    folderOf(version.n),
  );

export class FilmTimelines extends Context.Service<FilmTimelines, FilmTimelinesService>()(
  '@bible/film/tools/FilmTimelines',
) {
  static readonly layer = Layer.effect(
    FilmTimelines,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const folder = yield* FilmFolder;
      const fresh = yield* FreshFilm;
      const boards = yield* BoardStore;
      const notes = yield* NotesStore;
      const asks = yield* AskStore;
      const catalogues = yield* RenderCatalogue;
      const productions = yield* ProductionStore;
      const working = yield* Working;
      const films = yield* Effect.context<FilmFolder>();
      const clocks = yield* Cache.makeWith((at: Clocked) => fresh.clock(at.film, at.folder), {
        capacity: CLOCKS_KEPT,
        timeToLive: keptWhenMade,
      });

      const timeline = Effect.fn('FilmTimelines.timeline')(function* (
        name: string,
        asked: Option.Option<number>,
      ) {
        const film = yield* filmNamed(name).pipe(Effect.provideContext(films));
        const at = folder.paths(film);
        const ledger = Arr.findFirst(yield* productions.list, (p) => Option.contains(p.film, film));
        // A version whose folder holds a script is read from it (`<film>/v<n>/script.ts`).
        const numbers = Option.match(ledger, {
          onNone: () => [],
          onSome: (l) => l.versions.map((_, i) => i + 1),
        });
        const folders = yield* Effect.filter(numbers, (n) =>
          fs.exists(path.join(at.dir, folderOf(n), 'script.ts')),
        );
        const versions = versionsOf(ledger, folders, film);
        const version = yield* Effect.fromResult(pickVersion(film, versions, asked));
        const open = Option.getOrElse(
          Arr.findFirst(versions, (v) => v.open),
          () => version,
        );
        const stamp = yield* folder.stamp(film);
        const sources = yield* Effect.all(
          {
            clock: Cache.get(clocks, new Clocked({ film, stamp, folder: filesOf(version) })),
            board: boards.read(film, Option.getOrUndefined(filesOf(version))),
            openBoard: boards.read(film, Option.getOrUndefined(filesOf(open))),
            catalogue: catalogues.read(at),
            notes: notes.read(film),
            asks: asks.list,
            working: working.on(film),
          },
          { concurrency: 'unbounded' },
        );
        yield* Effect.logDebug(
          `[timeline] read film=${film} version=${version.n} files=${version.files}`,
        );
        return timelineOf({
          film,
          ledger,
          version,
          versions,
          ...sources,
        });
      });

      return FilmTimelines.of({ timeline });
    }),
  );
}
