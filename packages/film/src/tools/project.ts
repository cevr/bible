// A film's pictures: the Rive project in its `rive/` folder. Each beat is an
// artboard of its name, drawn in RML or in the editor; the Film artboard nests
// them all and plays each on the voice's clock. `sync` keeps the project in
// step with the script and the takes: it seeds a storyboard for each beat
// nobody has drawn, writes the Film (`film.rml`, never edited by hand) and the
// preview soundtrack, builds, and moves the project to and from the Rive file
// the editor opens. `build` is what a render plays: it refuses a Film that is
// out of date rather than render the old cut.

import { Array as Arr, Context, Effect, FileSystem, Layer, Option, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { ChildProcess, ChildProcessSpawner } from 'effect/unstable/process';
import { preview } from '../core/audio.ts';
import { type Placed, everyTakeRecorded } from '../core/layout.ts';
import type { RiveDocument } from '../core/rive.ts';
import { el, fragment } from '../core/rml.ts';
import { eventTimes, filmScenes } from '../core/scenes.ts';
import { type EventTimes, filmEnd } from '../core/sound.ts';
import { FILM, filmRml } from '../core/film-board.ts';
import { sceneClient, storyboardRml } from '../core/storyboard.ts';
import type { ScenePins } from '../core/warp.ts';
import {
  FilmStale,
  FontMissing,
  GitFailed,
  type MediaFailed,
  ProjectDirty,
  ProjectMissing,
  type RiveFailed,
  type RiveMissing,
  type RiveUnlinked,
  SceneFileTaken,
  SceneNotComponent,
} from './errors.ts';
import type { FilmPaths, LoadedFilm } from './film-repo.ts';
import { Media } from './media.ts';
import { MASTER_TOLERANCE, masterFile, masterFinding, measureMaster } from './master.ts';
import { collect } from './process.ts';
import { type Built, Rive } from './rive.ts';

/** Every scene is drawn at this size, and the Film shows it whole. */
export const FRAME = { width: 1920, height: 1080 };
/** How far apart seeded scenes sit on the editor's backboard: a frame and a gutter. */
export const COLUMN = 2100;
export const FILM_FILE = 'film.rml';
export const SOUNDTRACK_FILE = 'soundtrack.wav';
/** The font a new project's storyboards are set in, shipped with the package. */
const DEFAULT_FONT = { file: 'Inter-400.ttf', name: 'Inter', id: '881888:30' };

/** Every path in a film's Rive project. */
export interface ProjectPaths {
  readonly dir: string;
  readonly yaml: string;
  readonly film: string;
  readonly soundtrack: string;
  readonly scenes: string;
}

export const projectPaths = (paths: FilmPaths): ProjectPaths => ({
  dir: paths.rive,
  yaml: `${paths.rive}/rive.yaml`,
  film: `${paths.rive}/${FILM_FILE}`,
  soundtrack: `${paths.rive}/${SOUNDTRACK_FILE}`,
  scenes: `${paths.rive}/scenes`,
});

/** The project as `film check` reads it: what it builds to, and whether its Film is current. */
export interface ProjectState {
  readonly doc: RiveDocument;
  readonly current: boolean;
}

export interface SyncOptions {
  /** Pull the linked Rive file over the project first: what was drawn in the editor. */
  readonly pull: boolean;
  /** Push the project to its Rive file after; the first push creates the file in `project`. */
  readonly push: boolean;
  readonly project: Option.Option<string>;
  /** The pushed revision's label. */
  readonly name: Option.Option<string>;
}

export interface Synced {
  /** The beats that were given a storyboard. */
  readonly seeded: ReadonlyArray<string>;
  /** How each drawn scene's marks meet its Events. */
  readonly pins: ReadonlyArray<ScenePins>;
  /** Artboards that are neither a beat nor the Film: the Film leaves them out. */
  readonly extra: ReadonlyArray<string>;
  readonly soundtrack: boolean;
  readonly built: Built;
}

type Inspecting = RiveMissing | RiveFailed | PlatformError;
type Soundtracking = MediaFailed | PlatformError;

export type SyncError =
  | Inspecting
  | Soundtracking
  | RiveUnlinked
  | ProjectDirty
  | GitFailed
  | FontMissing
  | SceneFileTaken
  | SceneNotComponent;

export type BuildError = Inspecting | Soundtracking | ProjectMissing | FilmStale;

export interface FilmProjectService {
  /** What the film's project builds to; none before its first sync. */
  readonly inspect: (film: LoadedFilm) => Effect.Effect<Option.Option<RiveDocument>, Inspecting>;
  /** Where each scene's Events play, in scene seconds; empty before the first sync. */
  readonly events: (
    film: LoadedFilm,
    placed: ReadonlyArray<Placed>,
  ) => Effect.Effect<EventTimes, Inspecting>;
  /** The project and whether its Film is what `sync` would write now; none before the first sync. */
  readonly state: (
    film: LoadedFilm,
    placed: ReadonlyArray<Placed>,
  ) => Effect.Effect<Option.Option<ProjectState>, Inspecting | Soundtracking>;
  readonly sync: (
    film: LoadedFilm,
    placed: ReadonlyArray<Placed>,
    options: SyncOptions,
  ) => Effect.Effect<Synced, SyncError>;
  /** The .riv a render plays: the project built, its Film current. */
  readonly build: (
    film: LoadedFilm,
    placed: ReadonlyArray<Placed>,
  ) => Effect.Effect<Built, BuildError>;
}

/** The project a first sync creates: named for the film, playing the Film. */
const scaffoldYaml = (film: string) => `name: ${film}\nmain: "Film"\n`;
const scaffoldAssets = fragment([
  el('FontAsset', {
    file: `fonts/${DEFAULT_FONT.file}`,
    name: DEFAULT_FONT.name,
    id: DEFAULT_FONT.id,
  }),
]);

export class FilmProject extends Context.Service<FilmProject, FilmProjectService>()(
  '@bible/film/tools/FilmProject',
) {
  static readonly layer = Layer.effect(
    FilmProject,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const rive = yield* Rive;
      const media = yield* Media;
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

      const exists = (film: LoadedFilm) => fs.exists(projectPaths(film.paths).yaml);

      const inspect = Effect.fn('FilmProject.inspect')(function* (film: LoadedFilm) {
        if (!(yield* exists(film))) return Option.none<RiveDocument>();
        return Option.some(yield* rive.inspect(film.paths.rive));
      });

      const events = Effect.fn('FilmProject.events')(function* (
        film: LoadedFilm,
        placed: ReadonlyArray<Placed>,
      ) {
        const doc = yield* inspect(film);
        return Option.match(doc, {
          onNone: (): EventTimes => new Map(),
          onSome: (d) => eventTimes(filmScenes(placed, d).scenes),
        });
      });

      /** The Film carries the mix once every take is recorded and the master covers the film. */
      const scored = Effect.fn('FilmProject.scored')(function* (
        film: LoadedFilm,
        placed: ReadonlyArray<Placed>,
      ) {
        if (!everyTakeRecorded(placed)) return false;
        const master = masterFile(film.paths);
        const length = yield* measureMaster(fs, media, master);
        return Option.isNone(masterFinding(master, length, filmEnd(placed), MASTER_TOLERANCE));
      });

      /** `film.rml` as `sync` writes it now. */
      const filmText = (placed: ReadonlyArray<Placed>, doc: RiveDocument, soundtrack: boolean) =>
        filmRml({
          ...FRAME,
          scenes: filmScenes(placed, doc).scenes,
          soundtrack: Option.liftPredicate(SOUNDTRACK_FILE, () => soundtrack),
        });

      const readFilm = (film: LoadedFilm) =>
        fs.readFileString(projectPaths(film.paths).film).pipe(Effect.option);

      const state = Effect.fn('FilmProject.state')(function* (
        film: LoadedFilm,
        placed: ReadonlyArray<Placed>,
      ) {
        const doc = yield* inspect(film);
        if (Option.isNone(doc)) return Option.none<ProjectState>();
        const soundtrack = yield* scored(film, placed);
        const written = yield* readFilm(film);
        const current = Option.contains(written, filmText(placed, doc.value, soundtrack));
        return Option.some({ doc: doc.value, current });
      });

      /** The preview soundtrack, rewritten when the master is newer than it. */
      const writeSoundtrack = Effect.fn('FilmProject.writeSoundtrack')(function* (
        film: LoadedFilm,
      ) {
        const master = masterFile(film.paths);
        const out = projectPaths(film.paths).soundtrack;
        const mtime = (file: string) =>
          fs.stat(file).pipe(
            Effect.map((info) => Option.map(info.mtime, (d) => d.getTime())),
            Effect.orElseSucceed(() => Option.none<number>()),
          );
        const made = yield* mtime(out);
        const mixed = yield* mtime(master);
        const fresh = Option.isSome(made) && Option.isSome(mixed) && made.value >= mixed.value;
        if (fresh) return;
        yield* media.writeWav(out, preview(yield* media.decode(master)));
        yield* Effect.log(`sync.soundtrack file=${out}`);
      });

      /** The project's files git does not have yet; a pull would overwrite them. */
      const uncommitted = Effect.fn('FilmProject.uncommitted')(function* (dir: string) {
        const done = yield* collect(
          spawner,
          ChildProcess.make('git', ['-C', dir, 'status', '--porcelain', '--', '.']),
        );
        if (done.exitCode !== 0)
          return yield* GitFailed.make({ exitCode: done.exitCode, reason: done.stderr.trim() });
        return done.stdout.split('\n').filter((line) => line.trim() !== '');
      });

      const scaffold = Effect.fn('FilmProject.scaffold')(function* (film: LoadedFilm) {
        const at = projectPaths(film.paths);
        const fonts = path.join(at.dir, 'fonts');
        yield* fs.makeDirectory(fonts, { recursive: true });
        yield* fs.copyFile(
          path.join(import.meta.dir, '..', '..', 'assets', 'fonts', DEFAULT_FONT.file),
          path.join(fonts, DEFAULT_FONT.file),
        );
        yield* fs.writeFileString(path.join(at.dir, 'assets.rml'), scaffoldAssets);
        yield* fs.writeFileString(at.yaml, scaffoldYaml(film.paths.name));
        yield* Effect.log(`sync.scaffold dir=${at.dir}`);
      });

      /** A storyboard for each beat with no artboard, in its own file; never over an existing one. */
      const seed = Effect.fn('FilmProject.seed')(function* (
        film: LoadedFilm,
        placed: ReadonlyArray<Placed>,
        doc: RiveDocument,
      ) {
        const at = projectPaths(film.paths);
        const missing = new Set(filmScenes(placed, doc).missing);
        const beats = film.scenes.filter((b) => missing.has(b.id));
        if (beats.length === 0) return [];
        const font = yield* Option.match(Option.fromNullishOr(doc.fonts[0]), {
          onNone: () => Effect.fail(FontMissing.make({ dir: at.dir })),
          onSome: Effect.succeed,
        });
        yield* fs.makeDirectory(at.scenes, { recursive: true });
        // `placed` is the script laid out, beat for beat.
        for (const [index, [beat, p]] of Arr.zip(film.scenes, placed).entries()) {
          if (!missing.has(beat.id)) continue;
          const file = path.join(at.scenes, `${beat.id}.rml`);
          if (yield* fs.exists(file)) return yield* SceneFileTaken.make({ beat: beat.id, file });
          yield* fs.writeFileString(
            file,
            storyboardRml({
              beat,
              placed: p,
              client: sceneClient(beat.id),
              font: font.id,
              ...FRAME,
              x: index * COLUMN,
              y: 0,
            }),
          );
        }
        return beats.map((b) => b.id);
      });

      const sync = Effect.fn('FilmProject.sync')(function* (
        film: LoadedFilm,
        placed: ReadonlyArray<Placed>,
        options: SyncOptions,
      ) {
        const at = projectPaths(film.paths);
        if (options.pull) {
          const changed = yield* uncommitted(at.dir);
          if (changed.length > 0) return yield* ProjectDirty.make({ dir: at.dir, changed });
          const pulled = yield* rive.pull(at.dir);
          yield* Effect.log(`sync.pull dir=${at.dir} ${pulled.replace(/\s+/g, ' ')}`);
        }
        if (!(yield* exists(film))) yield* scaffold(film);
        let doc = yield* rive.inspect(at.dir);
        const seeded = yield* seed(film, placed, doc);
        if (seeded.length > 0) doc = yield* rive.inspect(at.dir);

        const beats = new Set(placed.map((p) => p.spec.id));
        const loose = Arr.findFirst(filmScenes(placed, doc).scenes, (s) => !s.board.component);
        if (Option.isSome(loose))
          return yield* SceneNotComponent.make({ scene: loose.value.placed.spec.id });

        const soundtrack = yield* scored(film, placed);
        if (soundtrack) yield* writeSoundtrack(film);
        yield* fs.writeFileString(at.film, filmText(placed, doc, soundtrack));
        const built = yield* rive.build(at.dir);
        for (const warning of built.warnings) yield* Effect.logWarning(`sync.build ${warning}`);
        if (options.push) {
          const pushed = yield* rive.push(at.dir, { project: options.project, name: options.name });
          yield* Effect.log(`sync.push dir=${at.dir} ${pushed.replace(/\s+/g, ' ')}`);
        }
        return {
          seeded,
          pins: filmScenes(placed, doc).pins,
          extra: [...doc.boards.keys()].filter((name) => !beats.has(name) && name !== FILM),
          soundtrack,
          built,
        };
      });

      const build = Effect.fn('FilmProject.build')(function* (
        film: LoadedFilm,
        placed: ReadonlyArray<Placed>,
      ) {
        const at = projectPaths(film.paths);
        const current = yield* state(film, placed);
        if (Option.isNone(current)) return yield* ProjectMissing.make({ dir: at.dir });
        if (!current.value.current) return yield* FilmStale.make({ file: at.film });
        if (yield* scored(film, placed)) yield* writeSoundtrack(film);
        return yield* rive.build(at.dir);
      });

      return FilmProject.of({ inspect, events, state, sync, build });
    }),
  );
}
