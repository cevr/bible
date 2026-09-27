// Where films live and how a tool reads one: the film's modules (script,
// voice, sound) through one named loader, each decoded with Schema, and its
// generated data (timings, sound manifest) through the content store. The
// films directory is the one the app passes in; each film's pictures are the
// Rive project in its `rive/` folder. Stems, renders and other outputs go
// under `FILMS_OUT` (default `<cwd>/out`).

import { Config, Context, Effect, FileSystem, Layer, Option, Path, Schema } from 'effect';
import { type Placed, layout } from '../core/layout.ts';
import {
  Beat,
  Sound,
  type SoundManifest,
  SoundManifestJson,
  type Timings,
  TimingsJson,
  Voice,
} from '../core/schema.ts';
import { ContentStore, type Manifest, type StoreError } from './content-store.ts';
import { FilmModuleInvalid, FilmNotFound, LayoutInvalid } from './errors.ts';

/** Every path a tool touches for one film. */
export interface FilmPaths {
  readonly name: string;
  readonly dir: string;
  readonly narration: string;
  readonly sound: string;
  /** The film's Rive project: its scenes, drawn in RML or in the editor, and the Film. */
  readonly rive: string;
  /** Per-film outputs: stems, renders. */
  readonly out: string;
  readonly timings: Manifest<Timings>;
  readonly manifest: Manifest<SoundManifest>;
}

/** A film as the tools see it: its script, voice, sound and data. */
export interface LoadedFilm {
  readonly paths: FilmPaths;
  /** The script's beats, in film order. */
  readonly scenes: ReadonlyArray<Beat>;
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
}

const ScriptModule = Schema.Struct({ script: Schema.Array(Beat) });
const VoiceModule = Schema.Struct({ voice: Voice });
const SoundModule = Schema.Struct({ sound: Sound });

/** The one place a film module is imported by path. The process keeps the module it first loaded. */
export const importFilmModule = (file: string) => import(file);

/** Lay the film out, turning `layout()`'s authoring errors into a typed failure. */
export const placeFilm = (film: LoadedFilm): Effect.Effect<ReadonlyArray<Placed>, LayoutInvalid> =>
  Effect.try({
    try: () => layout(film.scenes, film.timings),
    catch: (cause) => LayoutInvalid.make({ film: film.paths.name, reason: String(cause) }),
  });

export class FilmRepo extends Context.Service<FilmRepo, FilmRepoService>()(
  '@bible/film/tools/FilmRepo',
) {
  /** The repo over the films in `films`: the app's films folder. */
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
            rive: path.join(dir, 'rive'),
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
          const { script } = yield* loadModule(name, path.join(at.dir, 'script.ts'), ScriptModule);
          const { voice } = yield* loadModule(name, path.join(at.dir, 'voice.ts'), VoiceModule);
          const soundFile = path.join(at.dir, 'sound.ts');
          let sound = Option.none<Sound>();
          if (yield* fs.exists(soundFile))
            sound = Option.some((yield* loadModule(name, soundFile, SoundModule)).sound);
          const timings = yield* store.read(at.timings);
          const manifest = yield* store.read(at.manifest);
          return { paths: at, scenes: script, voice, sound, timings, manifest };
        });

        return FilmRepo.of({ paths, load });
      }),
    );
}
