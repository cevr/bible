// Where films live and how a tool reads one: the film's modules (scenes,
// voice, sound) through one named loader, each decoded with Schema, and its
// generated data (timings, sound manifest) through the content store. The
// films directory is the one the app passes in, the folder its player page
// imports, so the tools and the page never read two different films; stems
// and other outputs go under `FILMS_OUT`: the app's `out/` under `runFilmCli`
// (`FilmApp.folders`), `<cwd>/out` where nothing sets it.

import {
  Array as Arr,
  Boolean as Bool,
  Config,
  Context,
  Data,
  Duration,
  Effect,
  Exit,
  FileSystem,
  Layer,
  Option,
  Path,
  Record as Rec,
  Result,
  Schema,
  Struct,
} from 'effect';
import {
  EMPTY_FOOTAGE_LOCK,
  type FootageLock,
  FootageLockJson,
  FootageTranscriptJson,
  VOICE_RECIPE,
  copiesIn,
} from '../core/footage.ts';
import { type LayoutError, type Placed, layout } from '../core/layout.ts';
import type { VoicePieces } from '../core/mix.ts';
import {
  Talk,
  type TalkCut,
  type TalkTake,
  talkCut,
  talkTakes,
  talkTranscripts,
} from '../core/talk.ts';
import type { CodeError } from '../core/errors.ts';
import {
  Library,
  type Lock,
  LockJson,
  type MeasuredSounds,
  NO_SOUNDS,
  type Sounds,
} from '../core/sfx.ts';
import { resolveCode } from '../core/synth/resolve.ts';
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
import { Segment, isSegment } from '../core/segment.ts';
import { FilmModuleInvalid, TalkUnvoiced } from './errors.ts';
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

/** The film's mixed track (16-bit WAV): the player streams it, the renderer encodes from it. */
export const masterFile = (paths: FilmPaths): string => `${paths.narration}/full.wav`;

/** A film as the tools see it: the clock's part of each scene, its voice, sound and data. */
export interface LoadedFilm {
  readonly paths: FilmPaths;
  readonly scenes: ReadonlyArray<Timed>;
  /** Who reads it (`voice.ts`); none for a talk, which its speaker recorded on camera. */
  readonly voice: Option.Option<Voice>;
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
  /**
   * The app's sound library its effects and beds name, resolved and not
   * measured; none when the app has none. What reads how they play measures
   * them (`MeasuredFilm`).
   */
  readonly sounds: Sounds;
  /** A talk's edit and how it plays (`core/talk.ts`); none for a drawn film. */
  readonly talk: Option.Option<LoadedTalk>;
}

/**
 * A film with each seed of every derived sound its `sound.ts` places
 * measured (`measuredFilm`): what a mix plan, the check's lead-in and a
 * seed's line in the options read.
 */
export interface MeasuredFilm extends LoadedFilm {
  readonly sounds: MeasuredSounds;
}

/**
 * A talk as the tools read it: its edit, its takes (by the talk's take keys,
 * `talkTakes`), its cut, and the folder of copies its takes' voices are in
 * (`<FILMS_OUT>/footage`).
 */
export interface LoadedTalk {
  readonly talk: Talk;
  readonly takes: Readonly<Record<string, TalkTake>>;
  readonly cut: TalkCut;
  readonly copies: string;
}

/** Who reads `film` (`voice.ts`), or `TalkUnvoiced` for a talk, which is recorded on camera. */
export const readerOf = (film: LoadedFilm): Result.Result<Voice, TalkUnvoiced> =>
  Result.fromOption(film.voice, () => TalkUnvoiced.make({ film: film.paths.name }));

/**
 * The voice each of a talk's sections plays, in pieces of its take's
 * (`mixPlan`), known by its take's source and the recipe its voice is made
 * by; none for a drawn film.
 */
export const voicePiecesOf = (film: LoadedFilm): ReadonlyMap<string, VoicePieces> =>
  new Map(
    Option.match(film.talk, {
      onNone: () => [],
      onSome: ({ cut, takes, copies }) =>
        cut.sections.flatMap((section) =>
          Option.toArray(
            Option.map(Rec.get(takes, section.take), (take) => [
              section.id,
              {
                file: `${copies}/${section.voice.file}`,
                content: `${take.source} ${VOICE_RECIPE}`,
                pieces: section.pieces,
              },
            ]),
          ),
        ),
    }),
  );

type LoadError = FilmUnknown | FilmModuleInvalid | StoreError | CodeError;

/**
 * A film's name as a request gives it, checked against the films folder: one
 * of its films (`FilmRepo.named`), never a path. A route that takes a film
 * takes this, so `../` or an absolute path reaches no module.
 */
export const FilmName = Segment.pipe(Schema.brand('FilmName'));
export type FilmName = typeof FilmName.Type;

/**
 * Where a film lives, and which films there are: paths and a folder listing,
 * never a module import. A process that runs for days (the review) holds this
 * and not `FilmRepo`: its imports of a film stay as they were at the first
 * one (Bun keeps a module as it first evaluated it), so it reads a film only
 * through a fresh process (`FreshFilm`).
 */
interface FilmFolderService {
  /**
   * Every path a tool touches for `film`; with `folder`, for its version
   * folder (`<film>/<folder>/`, an earlier version kept beside the film):
   * its scenes, takes, timings and score under it. Its outputs stay the
   * film's.
   */
  readonly paths: (film: string, folder?: Segment) => FilmPaths;
  /** The films in the folder, by name (each a folder with `scenes/index.ts`), sorted. */
  readonly names: Effect.Effect<ReadonlyArray<string>>;
  /** The app's sound library folder (`library.ts`, its lock, `files/`), when it has one. */
  readonly sounds: Option.Option<string>;
  /** The app's footage library folder (its lock, `transcripts/`, `files/`), when it has one. */
  readonly footage: Option.Option<string>;
  /**
   * What the film is made from as it stands: the newest mtime of any file
   * under its folder (its scenes, script, takes, score and `sound.ts`) and of
   * the library's module (`library.ts`) and lock, and of the footage library's lock and
   * transcripts (a talk is cut on them). A process that keeps what it read of a film fresh
   * keys it by this, and reads again when it moves.
   */
  readonly stamp: (film: string) => Effect.Effect<number, PlatformError>;
}

interface FilmRepoService {
  /**
   * The film as its registered files stand; with `folder`, its version
   * folder (`<film>/<folder>/`): that folder's scenes, takes, score, shorts,
   * script and acts, and the film's own voice and palette where the folder
   * keeps none.
   */
  readonly load: (film: string, folder?: Segment) => Effect.Effect<LoadedFilm, LoadError>;
  /**
   * The film's screenplay (`script.ts`): each beat's line, sources and hold.
   * None when it keeps none. `folder` reads a version folder's instead
   * (`<film>/<folder>/script.ts`).
   */
  readonly script: (
    film: string,
    folder?: Segment,
  ) => Effect.Effect<Option.Option<ScriptModule['script']>, LoadError>;
  /**
   * The film's beds and effects (`sound.ts`) alone, nothing else of it
   * imported: what reads where a sound is placed. None when it keeps none.
   */
  readonly sound: (film: string) => Effect.Effect<Option.Option<Sound>, LoadError>;
  /** Every film's composed score options, as the private store keeps them. */
  readonly scores: Effect.Effect<Scores, StoreError>;
}

const ScenesModule = Schema.Struct({ scenes: Schema.Array(Timed) });
/** The part of `script.ts` the tools read: each beat's line, its sources, its picture's brief and its hold. */
const ScriptModule = Schema.Struct({
  script: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      say: Schema.optionalKey(Schema.String),
      /** The beat's hold, as a scene's (`Timed`): what lays a version's script out on its clock. */
      ...Struct.pick(Timed.fields, ['lead', 'tail', 'min', 'enter']),
      cite: Schema.Array(Schema.String).pipe(Schema.withDecodingDefaultKey(Effect.succeed([]))),
      /** What the picture does (the judge quotes it, `tools/judge.ts`). */
      picture: Schema.optionalKey(Schema.String),
    }),
  ),
  heardAs: HeardAs.pipe(Schema.withDecodingDefaultKey(Effect.succeed({}))),
});
type ScriptModule = typeof ScriptModule.Type;
const VoiceModule = Schema.Struct({ voice: Voice });
const SoundModule = Schema.Struct({ sound: Sound });
/**
 * The part of `film.ts` the tools read: its declared look, when it declares
 * one. A version folder keeps no `film.ts` (it is no film the player
 * registers): its `acts.ts` declares the look, as the film's `film.ts`
 * re-exports its own.
 */
const FilmModule = Schema.Struct({ look: Schema.optionalKey(Look) });
const ShortsModule = Schema.Struct({ shorts: Shorts });
/** A talk's `talk.ts`: its edit. */
const TalkModule = Schema.Struct({ talk: Talk });
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

/** How long a cache keeps what it read under its key: for good once it is read, a failed read not at all. */
export const keptWhenMade = <A, E>(exit: Exit.Exit<A, E>): Duration.Duration =>
  Exit.match(exit, { onFailure: () => Duration.zero, onSuccess: () => Duration.infinity });

/** What is under a film's folder that it is not made from: renders, installs, history. */
const NOT_SOURCE: ReadonlyArray<string> = ['out', 'node_modules', '.git'];

/**
 * The files either of which makes `name` under `films` a film: a drawn
 * film's scene registry, `<films>/<name>/scenes/index.ts`, or a talk's edit,
 * `<films>/<name>/talk.ts`. None for a name no folder of `films` has (`.`,
 * `..`, a path). `FilmFolder.names` and the narration route
 * (`narration-route.ts`) both ask it.
 */
export const filmMarks = (films: string, name: string): ReadonlyArray<string> => {
  if (!isSegment(name)) return [];
  return [`${films}/${name}/scenes/index.ts`, `${films}/${name}/talk.ts`];
};

/** The footage library's lock (`library.lock.json`) in `dir`, as the content store reads and writes it. */
export const footageLockManifest = (dir: string): Manifest<FootageLock> => ({
  file: `${dir}/library.lock.json`,
  codec: FootageLockJson,
  empty: EMPTY_FOOTAGE_LOCK,
});

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
   * `sounds`, the app's sound library folder, and `footage`, its footage
   * library's, when it has them.
   */
  static readonly layer = (
    films: string,
    sounds: Option.Option<string> = Option.none(),
    footage: Option.Option<string> = Option.none(),
  ) =>
    Layer.effect(
      FilmFolder,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const outputs = yield* filmsOut;

        const paths = (name: string, folder?: Segment): FilmPaths => {
          const dir = path.join(films, name, ...Option.toArray(Option.fromUndefinedOr(folder)));
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
              Effect.map(
                Effect.forEach(filmMarks(films, name), (mark) =>
                  fs.exists(mark).pipe(Effect.orElseSucceed(() => false)),
                ),
                (found) => found.includes(true),
              ),
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
          // The footage library's lock and transcripts: a talk is cut on them.
          const heard = yield* Option.match(footage, {
            onNone: () => Effect.succeed<ReadonlyArray<string>>([]),
            onSome: (at) =>
              fs.readDirectory(path.join(at, 'transcripts')).pipe(
                Effect.map((files) => [
                  footageLockManifest(at).file,
                  ...files.map((f) => path.join(at, 'transcripts', f)),
                ]),
                Effect.orElseSucceed(() => [footageLockManifest(at).file]),
              ),
          });
          const times = yield* Effect.forEach(
            [...made.map((f) => path.join(dir, f)), ...library, ...heard],
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

        return FilmFolder.of({ paths, names, sounds, footage, stamp });
      }),
    );
}

export class FilmRepo extends Context.Service<FilmRepo, FilmRepoService>()(
  '@bible/film/tools/FilmRepo',
) {
  /**
   * The repo over the films in `films` (`FilmFolder.layer`, which it
   * provides beside itself): each film's modules imported, its data read; a
   * talk cut on its takes' transcripts in the footage library (`footage`).
   */
  static readonly layer = (
    films: string,
    sounds: Option.Option<string> = Option.none(),
    footage: Option.Option<string> = Option.none(),
  ) =>
    Layer.effect(
      FilmRepo,
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const store = yield* ContentStore;
        const { paths, names, sounds, footage: footageDir } = yield* FilmFolder;
        const outputs = yield* filmsOut;

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

        /**
         * A talk: its edit, its takes as the footage library keeps them
         * (`talkTakes`, over the lock and the transcripts it names, as the
         * page reads them through the footage route), cut, and laid out as a
         * film's scenes are.
         */
        const loadTalk = (name: string, at: FilmPaths) =>
          Effect.gen(function* () {
            const invalid = (reason: string) =>
              FilmModuleInvalid.make({ film: name, module: 'talk.ts', reason });
            const { talk } = yield* loadModule(name, path.join(at.dir, 'talk.ts'), TalkModule);
            const dir = yield* Effect.fromOption(footageDir, () =>
              invalid('it plays footage, but the app keeps no footage library'),
            );
            const lock = yield* store.read(footageLockManifest(dir));
            const transcripts = new Map(
              yield* Effect.forEach(talkTranscripts(talk, lock), (file) =>
                fs.readFileString(path.join(dir, 'transcripts', file)).pipe(
                  Effect.flatMap(Schema.decodeEffect(FootageTranscriptJson)),
                  Effect.map((heard) => [file, heard] as const),
                  Effect.mapError((error) =>
                    invalid(`its transcript ${file} does not read: ${error.message}`),
                  ),
                ),
              ),
            );
            const takes = yield* Effect.fromResult(talkTakes(talk, lock, transcripts)).pipe(
              Effect.mapError((error) => invalid(error.message)),
            );
            const cut = yield* Effect.fromResult(talkCut(talk, takes)).pipe(
              Effect.mapError((error) => invalid(error.message)),
            );
            const loaded: LoadedTalk = { talk, takes, cut, copies: copiesIn(outputs) };
            return loaded;
          });

        /** `name`'s `sound.ts` read, from its folder `at`; none when it keeps none. */
        const soundIn = (name: string, at: FilmPaths) =>
          Effect.gen(function* () {
            const file = path.join(at.dir, 'sound.ts');
            if (!(yield* fs.exists(file))) return Option.none<Sound>();
            return Option.some((yield* loadModule(name, file, SoundModule)).sound);
          });

        const load = Effect.fn('FilmRepo.load')(function* (name: string, folder?: Segment) {
          if (!(yield* fs.exists(paths(name).dir))) return yield* unknown(name);
          const at = paths(name, folder);
          /** A module the version folder keeps, else the film's own (its voice, its palette). */
          const ownOrFilm = (file: string) =>
            Effect.map(fs.exists(path.join(at.dir, file)), (own) =>
              path.join(
                Bool.match(own, { onTrue: () => at.dir, onFalse: () => paths(name).dir }),
                file,
              ),
            );
          if (
            Option.isNone(Option.fromUndefinedOr(folder)) &&
            !(yield* fs.exists(path.join(at.dir, 'scenes', 'index.ts'))) &&
            (yield* fs.exists(path.join(at.dir, 'talk.ts')))
          ) {
            const talk = yield* loadTalk(name, at);
            const sound = yield* soundIn(name, at);
            const loaded: LoadedFilm = {
              paths: at,
              scenes: talk.cut.scenes,
              voice: Option.none(),
              sound,
              shorts: [],
              timings: talk.cut.timings,
              manifest: yield* store.read(at.manifest),
              heardAs: {},
              look: Option.none(),
              looks: {},
              sounds: yield* loadSounds,
              talk: Option.some(talk),
            };
            return loaded;
          }
          const { scenes } = yield* loadModule(
            name,
            path.join(at.dir, 'scenes', 'index.ts'),
            ScenesModule,
          );
          const { voice } = yield* loadModule(name, yield* ownOrFilm('voice.ts'), VoiceModule);
          const sound = yield* soundIn(name, at);
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
          const actsFile = path.join(at.dir, 'acts.ts');
          let look = Option.none<Look>();
          if (yield* fs.exists(filmFile))
            look = Option.fromNullishOr((yield* loadModule(name, filmFile, FilmModule)).look);
          else if (yield* fs.exists(actsFile))
            look = Option.fromNullishOr((yield* loadModule(name, actsFile, FilmModule)).look);
          const paletteFile = yield* ownOrFilm('palette.ts');
          let looks: Looks = {};
          if (yield* fs.exists(paletteFile))
            looks = Option.getOrElse(
              Option.fromUndefinedOr((yield* loadModule(name, paletteFile, PaletteModule)).looks),
              (): Looks => ({}),
            );
          const library = yield* loadSounds;
          const loaded: LoadedFilm = {
            paths: at,
            scenes,
            voice: Option.some(voice),
            sound,
            shorts,
            timings,
            manifest,
            heardAs,
            look,
            looks,
            sounds: library,
            talk: Option.none(),
          };
          return loaded;
        });

        /**
         * The app's library, its lock and its code sounds resolved, nothing
         * rendered or measured; none when the app keeps no `sounds/library.ts`.
         */
        const loadSounds = Effect.gen(function* () {
          const dir = Option.getOrElse(sounds, () => '');
          const file = path.join(dir, 'library.ts');
          if (Option.isNone(sounds) || !(yield* fs.exists(file))) return NO_SOUNDS;
          const { library } = yield* libraryModule(file);
          const lock = yield* store.read(lockManifest(dir));
          const { code, trials } = yield* Effect.fromResult(resolveCode(library));
          const loaded: Sounds = { library, lock, dir, code, trials };
          return loaded;
        });

        const script = Effect.fn('FilmRepo.script')(function* (name: string, folder?: Segment) {
          if (!(yield* fs.exists(paths(name).dir))) return yield* unknown(name);
          const file = path.join(paths(name, folder).dir, 'script.ts');
          if (!(yield* fs.exists(file))) return Option.none<ScriptModule['script']>();
          return Option.some((yield* loadModule(name, file, ScriptModule)).script);
        });

        const sound = Effect.fn('FilmRepo.sound')(function* (name: string) {
          const at = paths(name);
          if (!(yield* fs.exists(at.dir))) return yield* unknown(name);
          return yield* soundIn(name, at);
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

        return FilmRepo.of({ load, script, sound, scores });
      }),
    ).pipe(Layer.provideMerge(FilmFolder.layer(films, sounds, footage)));
}
