// Where films live and how a tool reads one: the film's modules (scenes,
// voice, sound) through one named loader, each decoded with Schema, and its
// generated data (timings, sound manifest) through the content store. The
// films directory is the one the app passes in, the folder its player page
// imports, so the tools and the page never read two different films; stems
// and other outputs go under `FILMS_OUT`: the app's `out/` under `runFilmCli`
// (`FilmApp.folders`), `<cwd>/out` where nothing sets it.

import {
  Array as Arr,
  Config,
  Context,
  Data,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Schema,
} from 'effect';
import { type LayoutError, type Placed, layout } from '../core/layout.ts';
import { Library, type Lock, LockJson, NO_SOUNDS, type Sounds } from '../core/sfx.ts';
import { StoreConfig } from '../core/store.ts';
import {
  HeardAs,
  Look,
  Looks,
  Sound,
  type SoundManifest,
  SoundManifestJson,
  Shorts,
  Timed,
  type Timings,
  TimingsJson,
  Voice,
} from '../core/schema.ts';
import type { PlatformError } from 'effect/PlatformError';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { FilmUnknown } from '../core/refusals.ts';
import { FilmModuleInvalid } from './errors.ts';
import { type PrivateFile, type Scores, scoreKey } from './media-store.ts';

/** Every path a tool touches for one film. */
export interface FilmPaths {
  readonly name: string;
  readonly dir: string;
  readonly narration: string;
  readonly sound: string;
  /** Per-film outputs: stems, renders. */
  readonly out: string;
  readonly timings: Manifest<Timings>;
  readonly manifest: Manifest<SoundManifest>;
}

/** A film as the tools see it: the clock's part of each scene, its voice, sound and data. */
export interface LoadedFilm {
  readonly paths: FilmPaths;
  readonly scenes: ReadonlyArray<Timed>;
  readonly voice: Voice;
  readonly sound: Option.Option<Sound>;
  /** The vertical shorts its `shorts.ts` declares; empty when it has none. */
  readonly shorts: Shorts;
  /** Empty (no takes, no voice) until the first take is recorded. */
  readonly timings: Timings;
  readonly manifest: SoundManifest;
  /** How speech-to-text writes the script's names (`script.ts`'s `heardAs`); none when it lists none. */
  readonly heardAs: HeardAs;
  /** The film's declared colour script and acts (`film.ts`'s `look`); none when it declares none. */
  readonly look: Option.Option<Look>;
  /** The looks it chooses between at named levels (`palette.ts`'s `looks`); empty when it has none. */
  readonly looks: Looks;
  /** The app's sound library its effects and beds name; none when the app has none. */
  readonly sounds: Sounds;
}

type LoadError = FilmUnknown | FilmModuleInvalid | StoreError;

/**
 * A film's name as a request gives it, checked against the films folder: one
 * of its films (`FilmRepo.named`), never a path. A route that takes a film
 * takes this, so `../` or an absolute path reaches no module.
 */
export const FilmName = Schema.String.pipe(Schema.brand('FilmName'));
export type FilmName = typeof FilmName.Type;

/**
 * Where a film lives, and which films there are: paths and a folder listing,
 * never a module import. A process that runs for days (the review) holds this
 * and not `FilmRepo`: its imports of a film stay as they were at the first
 * one (Bun keeps a module as it first evaluated it), so it reads a film only
 * through a fresh process (`FreshFilm`).
 */
interface FilmFolderService {
  readonly paths: (film: string) => FilmPaths;
  /** The films in the folder, by name (each a folder with `scenes/index.ts`), sorted. */
  readonly names: Effect.Effect<ReadonlyArray<string>>;
  /** The app's sound library folder (`library.ts`, its lock, `files/`), when it has one. */
  readonly sounds: Option.Option<string>;
  /**
   * What the film is made from as it stands: the newest mtime of any file
   * under its folder (its scenes, script, takes, score and `sound.ts`) and of
   * the library's module (`library.ts`) and lock. A process that keeps what it read of a film fresh
   * keys it by this, and reads again when it moves.
   */
  readonly stamp: (film: string) => Effect.Effect<number, PlatformError>;
}

interface FilmRepoService {
  readonly load: (film: string) => Effect.Effect<LoadedFilm, LoadError>;
  /** The film's screenplay (`script.ts`): each beat's line and sources. None when it keeps none. */
  readonly script: (
    film: string,
  ) => Effect.Effect<Option.Option<ScriptModule['script']>, LoadError>;
  /** Every film's composed score options, as the private store keeps them. */
  readonly scores: Effect.Effect<Scores, StoreError>;
}

const ScenesModule = Schema.Struct({ scenes: Schema.Array(Timed) });
/** The part of `script.ts` the tools read: each beat's line and its sources. */
const ScriptModule = Schema.Struct({
  script: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      say: Schema.optionalKey(Schema.String),
      cite: Schema.Array(Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
    }),
  ),
  heardAs: HeardAs.pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
});
type ScriptModule = typeof ScriptModule.Type;
const VoiceModule = Schema.Struct({ voice: Voice });
const SoundModule = Schema.Struct({ sound: Sound });
/** The part of `film.ts` the tools read: its declared look, when it declares one. */
const FilmModule = Schema.Struct({ look: Schema.optionalKey(Look) });
const ShortsModule = Schema.Struct({ shorts: Shorts });
/** The part of `palette.ts` the tools read: the looks it chooses between, when it has any. */
const PaletteModule = Schema.Struct({ looks: Schema.optionalKey(Looks) });

/**
 * The one place a film module is imported by path. The process keeps the
 * module it first loaded: a tool that must see a file as it is now parses it
 * (`scene-source.ts`) instead.
 */
export const importFilmModule = (file: string) => import(file);

/** What an app's `sounds/library.ts` exports: its sounds, and where their private files are kept. */
const LibraryModule = Schema.Struct({ library: Library, store: StoreConfig });

/** An app's `sounds/library.ts`, decoded. */
export const libraryModule = (file: string) =>
  Effect.tryPromise({
    try: () => importFilmModule(file),
    catch: (cause) =>
      FilmModuleInvalid.make({ film: 'sounds', module: 'library.ts', reason: String(cause) }),
  }).pipe(
    Effect.flatMap((module) =>
      Schema.decodeUnknownEffect(LibraryModule)(module).pipe(
        Effect.mapError((error) =>
          FilmModuleInvalid.make({ film: 'sounds', module: 'library.ts', reason: error.message }),
        ),
      ),
    ),
  );

/** The library's lock (`library.lock.json`) in `dir`, as the content store reads and writes it. */
export const lockManifest = (dir: string): Manifest<Lock> => ({
  file: `${dir}/library.lock.json`,
  codec: LockJson,
  empty: {},
});

/** Why a film does not lay out: each authoring error names its scene (`LayoutError`). */
export type PlaceError = LayoutError;

/** Lay the film out; an authoring error fails as itself, naming its scene and cue. */
export const placeFilm = (film: LoadedFilm): Effect.Effect<ReadonlyArray<Placed>, PlaceError> =>
  Effect.fromResult(layout(film.scenes, film.timings));

const asFilmName = Schema.decodeSync(FilmName);

/** `name` as one of the films in the folder, or `FilmUnknown` naming the films there are. */
export const filmNamed = Effect.fn('FilmFolder.named')(function* (name: string) {
  const known = yield* (yield* FilmFolder).names;
  return yield* Effect.fromOption(
    Option.map(
      Arr.findFirst(known, (film) => film === name),
      asFilmName,
    ),
    () => FilmUnknown.make({ film: name, known }),
  );
});

/** A film's sources at one stamp (`FilmFolder.stamp`): the key what was read of them is kept under. */
export class Stamped extends Data.Class<{ readonly film: FilmName; readonly stamp: number }> {}

/** What is under a film's folder that it is not made from: renders, installs, history. */
const NOT_SOURCE: ReadonlyArray<string> = ['out', 'node_modules', '.git'];

/**
 * The file that makes `name` under `films` a film: its scene registry,
 * `<films>/<name>/scenes/index.ts`. None for a name no folder of `films`
 * has (`.`, `..`, a path). `FilmFolder.names` and the narration route
 * (`narration-route.ts`) both ask it.
 */
export const filmMark = (films: string, name: string): Option.Option<string> => {
  if (name === '' || name === '.' || name === '..' || name.includes('/')) return Option.none();
  return Option.some(`${films}/${name}/scenes/index.ts`);
};

/** The folder outputs go under: `FILMS_OUT` (the app's `out/` under `runFilmCli`), else `<cwd>/out`. */
export const filmsOut = Effect.gen(function* () {
  const path = yield* Path.Path;
  return yield* Config.String('FILMS_OUT').pipe(Config.withDefault(path.resolve('out')));
});

export class FilmFolder extends Context.Service<FilmFolder, FilmFolderService>()(
  '@bible/film/tools/FilmFolder',
) {
  /**
   * The films in `films`: the app's films folder, which its player imports;
   * `sounds`, the app's sound library folder, when it has one.
   */
  static readonly layer = (films: string, sounds: Option.Option<string> = Option.none()) =>
    Layer.effect(
      FilmFolder,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const outputs = yield* filmsOut;

        const paths = (name: string): FilmPaths => {
          const dir = path.join(films, name);
          const narration = path.join(dir, 'narration');
          const sound = path.join(dir, 'sound');
          return {
            name,
            dir,
            narration,
            sound,
            out: path.join(outputs, name),
            timings: {
              file: path.join(narration, 'timings.json'),
              codec: TimingsJson,
              empty: { voice: '', scenes: {} },
            },
            manifest: {
              file: path.join(sound, 'manifest.json'),
              codec: SoundManifestJson,
              empty: {},
            },
          };
        };

        const names = fs.readDirectory(films).pipe(
          Effect.flatMap((entries) =>
            // A file beside the films (the registry's `index.ts`) is no film: its lookup fails, not errs.
            Effect.filter(entries, (name) =>
              Option.match(filmMark(films, name), {
                onNone: () => Effect.succeed(false),
                onSome: (mark) => fs.exists(mark).pipe(Effect.orElseSucceed(() => false)),
              }),
            ),
          ),
          Effect.map((found) => [...found].sort()),
          Effect.orElseSucceed((): ReadonlyArray<string> => []),
        );

        const stamp = Effect.fn('FilmFolder.stamp')(function* (film: string) {
          const dir = paths(film).dir;
          const files = yield* fs.readDirectory(dir, { recursive: true });
          const made = files.filter((f) => !NOT_SOURCE.includes(f.split('/')[0] ?? ''));
          // The library's module and its lock: its levels, prompts and kept takes enter the mix.
          const library = Option.match(sounds, {
            onNone: () => [],
            onSome: (at) => [path.join(at, 'library.ts'), lockManifest(at).file],
          });
          const times = yield* Effect.forEach(
            [...made.map((f) => path.join(dir, f)), ...library],
            (file) =>
              fs.stat(file).pipe(
                Effect.map((info) =>
                  Option.match(info.mtime, { onNone: () => 0, onSome: (d) => d.getTime() }),
                ),
                Effect.orElseSucceed(() => 0),
              ),
            { concurrency: 16 },
          );
          return Math.max(0, ...times);
        });

        return FilmFolder.of({ paths, names, sounds, stamp });
      }),
    );
}

export class FilmRepo extends Context.Service<FilmRepo, FilmRepoService>()(
  '@bible/film/tools/FilmRepo',
) {
  /**
   * The repo over the films in `films` (`FilmFolder.layer`, which it
   * provides beside itself): each film's modules imported, its data read.
   */
  static readonly layer = (films: string, sounds: Option.Option<string> = Option.none()) =>
    Layer.effect(
      FilmRepo,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const { paths, names, sounds } = yield* FilmFolder;

        /** A film not in the folder: `FilmUnknown`, naming the films there are (never a path). */
        const unknown = (film: string) =>
          Effect.flatMap(names, (known) => Effect.fail(FilmUnknown.make({ film, known })));

        const loadModule = <A, I>(film: string, file: string, schema: Schema.Codec<A, I>) =>
          Effect.tryPromise({
            try: () => importFilmModule(file),
            catch: (cause) =>
              FilmModuleInvalid.make({ film, module: path.basename(file), reason: String(cause) }),
          }).pipe(
            Effect.flatMap((module) => Schema.decodeUnknownEffect(schema)(module)),
            Effect.mapError((error) => {
              if (error._tag === 'FilmModuleInvalid') return error;
              return FilmModuleInvalid.make({
                film,
                module: path.basename(file),
                reason: error.message,
              });
            }),
          );

        const load = Effect.fn('FilmRepo.load')(function* (name: string) {
          const at = paths(name);
          if (!(yield* fs.exists(at.dir))) return yield* unknown(name);
          const { scenes } = yield* loadModule(
            name,
            path.join(at.dir, 'scenes', 'index.ts'),
            ScenesModule,
          );
          const { voice } = yield* loadModule(name, path.join(at.dir, 'voice.ts'), VoiceModule);
          const soundFile = path.join(at.dir, 'sound.ts');
          let sound = Option.none<Sound>();
          if (yield* fs.exists(soundFile))
            sound = Option.some((yield* loadModule(name, soundFile, SoundModule)).sound);
          const shortsFile = path.join(at.dir, 'shorts.ts');
          let shorts: Shorts = [];
          if (yield* fs.exists(shortsFile))
            shorts = (yield* loadModule(name, shortsFile, ShortsModule)).shorts;
          const timings = yield* store.read(at.timings);
          const manifest = yield* store.read(at.manifest);
          const scriptFile = path.join(at.dir, 'script.ts');
          let heardAs: HeardAs = {};
          if (yield* fs.exists(scriptFile))
            heardAs = (yield* loadModule(name, scriptFile, ScriptModule)).heardAs;
          const filmFile = path.join(at.dir, 'film.ts');
          let look = Option.none<Look>();
          if (yield* fs.exists(filmFile))
            look = Option.fromNullishOr((yield* loadModule(name, filmFile, FilmModule)).look);
          const paletteFile = path.join(at.dir, 'palette.ts');
          let looks: Looks = {};
          if (yield* fs.exists(paletteFile))
            looks = Option.getOrElse(
              Option.fromUndefinedOr((yield* loadModule(name, paletteFile, PaletteModule)).looks),
              (): Looks => ({}),
            );
          const library = yield* loadSounds;
          return {
            paths: at,
            scenes,
            voice,
            sound,
            shorts,
            timings,
            manifest,
            heardAs,
            look,
            looks,
            sounds: library,
          };
        });

        /** The app's library and its lock; none when the app keeps no `sounds/library.ts`. */
        const loadSounds = Effect.gen(function* () {
          const dir = Option.getOrElse(sounds, () => '');
          const file = path.join(dir, 'library.ts');
          if (Option.isNone(sounds) || !(yield* fs.exists(file))) return NO_SOUNDS;
          const { library } = yield* libraryModule(file);
          const lock = yield* store.read(lockManifest(dir));
          const loaded: Sounds = { library, lock, dir };
          return loaded;
        });

        const script = Effect.fn('FilmRepo.script')(function* (name: string) {
          const at = paths(name);
          if (!(yield* fs.exists(at.dir))) return yield* unknown(name);
          const file = path.join(at.dir, 'script.ts');
          if (!(yield* fs.exists(file))) return Option.none<ScriptModule['script']>();
          return Option.some((yield* loadModule(name, file, ScriptModule)).script);
        });

        const readScores = Effect.fn('FilmRepo.scores')(function* () {
          const found = yield* names;
          const files: Array<PrivateFile> = [];
          for (const name of found) {
            const at = paths(name);
            const manifest = yield* store.read(at.manifest);
            for (const asset of Object.values(manifest.scores ?? {}))
              files.push({
                key: scoreKey(name, asset.file),
                file: path.join(at.sound, asset.file),
                sha256: asset.sha256,
              });
          }
          const scores: Scores = { files };
          return scores;
        });
        const scores = readScores();

        return FilmRepo.of({ load, script, scores });
      }),
    ).pipe(Layer.provideMerge(FilmFolder.layer(films, sounds)));
}
