// Where films live and how a tool reads one: the film's modules (scenes,
// voice, sound) through one named loader, each decoded with Schema, and its
// generated data (timings, sound manifest) through the content store. The
// films directory is the one the app passes in, the folder its player page
// imports, so the tools and the page never read two different films; stems
// and other outputs go under `FILMS_OUT` (default `<cwd>/out`).

import { Config, Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { type Placed, layout } from '../core/layout.ts';
import {
  Sound,
  type SoundManifest,
  SoundManifestJson,
  Timed,
  type Timings,
  TimingsJson,
  Voice,
} from '../core/schema.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { FilmModuleInvalid, FilmNotFound, LayoutInvalid, WordMissing } from './errors.ts';

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
  /** Empty (no takes, no voice) until the first take is recorded. */
  readonly timings: Timings;
  readonly manifest: SoundManifest;
}

export type LoadError = FilmNotFound | FilmModuleInvalid | StoreError;

export interface FilmRepoService {
  readonly paths: (film: string) => FilmPaths;
  readonly load: (film: string) => Effect.Effect<LoadedFilm, LoadError>;
  /** The film's screenplay (`script.ts`): each beat's line and sources. None when it keeps none. */
  readonly script: (
    film: string,
  ) => Effect.Effect<Option.Option<ScriptModule['script']>, LoadError>;
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
});
type ScriptModule = typeof ScriptModule.Type;
const VoiceModule = Schema.Struct({ voice: Voice });
const SoundModule = Schema.Struct({ sound: Sound });

/**
 * The one place a film module is imported by path. The process keeps the
 * module it first loaded: a tool that must see a file as it is now parses it
 * (`scene-source.ts`) instead.
 */
export const importFilmModule = (file: string) => import(file);

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
  /** The repo over the films in `films`: the app's films folder, which its player imports. */
  static readonly layer = (films: string) =>
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
              empty: { effects: {} },
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
          const timings = yield* store.read(at.timings);
          const manifest = yield* store.read(at.manifest);
          return { paths: at, scenes, voice, sound, timings, manifest };
        });

        const script = Effect.fn('FilmRepo.script')(function* (name: string) {
          const at = paths(name);
          if (!(yield* fs.exists(at.dir)))
            return yield* FilmNotFound.make({ film: name, dir: at.dir });
          const file = path.join(at.dir, 'script.ts');
          if (!(yield* fs.exists(file))) return Option.none<ScriptModule['script']>();
          return Option.some((yield* loadModule(name, file, ScriptModule)).script);
        });

        return FilmRepo.of({ paths, load, script });
      }),
    );
}
