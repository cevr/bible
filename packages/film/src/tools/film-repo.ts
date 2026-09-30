// Where films live and how a tool reads one: the film's modules (scenes,
// voice, sound) through one named loader, each decoded with Schema, and its
// generated data (timings, sound manifest) through the content store. The
// films directory is the one the app passes in, the folder its player page
// imports, so the tools and the page never read two different films; stems
// and other outputs go under `FILMS_OUT` (default `<cwd>/out`).

import { Config, Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { type Placed, layout } from '../core/layout.ts';
import { Library, type Lock, LockJson, NO_SOUNDS, type Sounds, StoreConfig } from '../core/sfx.ts';
import {
  HeardAs,
  Look,
  Sound,
  type SoundManifest,
  SoundManifestJson,
  Shorts,
  Timed,
  type Timings,
  TimingsJson,
  Voice,
} from '../core/schema.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { FilmModuleInvalid, FilmNotFound, LayoutInvalid, WordMissing } from './errors.ts';
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
  /** The app's sound library its effects and beds name; none when the app has none. */
  readonly sounds: Sounds;
}

export type LoadError = FilmNotFound | FilmModuleInvalid | StoreError;

export interface FilmRepoService {
  readonly paths: (film: string) => FilmPaths;
  readonly load: (film: string) => Effect.Effect<LoadedFilm, LoadError>;
  /** The film's screenplay (`script.ts`): each beat's line and sources. None when it keeps none. */
  readonly script: (
    film: string,
  ) => Effect.Effect<Option.Option<ScriptModule['script']>, LoadError>;
  /**
   * Every film's composed score options, as the private store keeps them, and
   * each film's `sound/` folder (the pre-commit guard refuses audio there).
   */
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

/** Why a film does not lay out: a word pin with no word to land on, or any other authoring error. */
export type PlaceError = WordMissing | LayoutInvalid;

const isWordMissing = Schema.is(WordMissing);

/**
 * Lay the film out, turning `layout()`'s authoring errors into a typed
 * failure: `WordMissing` as itself, every other one as `LayoutInvalid`.
 */
export const placeFilm = (film: LoadedFilm): Effect.Effect<ReadonlyArray<Placed>, PlaceError> =>
  Effect.try({
    try: () => layout(film.scenes, film.timings),
    catch: (cause) =>
      Option.getOrElse(Option.liftPredicate(cause, isWordMissing), () =>
        LayoutInvalid.make({ film: film.paths.name, reason: String(cause) }),
      ),
  });

export class FilmRepo extends Context.Service<FilmRepo, FilmRepoService>()(
  '@bible/film/tools/FilmRepo',
) {
  /**
   * The repo over the films in `films`: the app's films folder, which its
   * player imports; `sounds`, the app's sound library folder, when it has one.
   */
  static readonly layer = (films: string, sounds: Option.Option<string> = Option.none()) =>
    Layer.effect(
      FilmRepo,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const outputs = yield* Config.String('FILMS_OUT').pipe(
          Config.withDefault(path.resolve('out')),
        );

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
          if (!(yield* fs.exists(at.dir)))
            return yield* FilmNotFound.make({ film: name, dir: at.dir });
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
          if (!(yield* fs.exists(at.dir)))
            return yield* FilmNotFound.make({ film: name, dir: at.dir });
          const file = path.join(at.dir, 'script.ts');
          if (!(yield* fs.exists(file))) return Option.none<ScriptModule['script']>();
          return Option.some((yield* loadModule(name, file, ScriptModule)).script);
        });

        const readScores = Effect.fn('FilmRepo.scores')(function* () {
          const names: Array<string> = [];
          if (yield* fs.exists(films))
            for (const entry of yield* fs.readDirectory(films))
              if ((yield* fs.stat(path.join(films, entry))).type === 'Directory') names.push(entry);
          const files: Array<PrivateFile> = [];
          for (const name of names.toSorted()) {
            const at = paths(name);
            const manifest = yield* store.read(at.manifest);
            for (const asset of Object.values(manifest.scores ?? {}))
              files.push({
                key: scoreKey(name, asset.file),
                file: path.join(at.sound, asset.file),
                sha256: asset.sha256,
              });
          }
          const found: Scores = { files, dirs: names.map((name) => paths(name).sound) };
          return found;
        });
        const scores = readScores();

        return FilmRepo.of({ paths, load, script, scores });
      }),
    );
}
