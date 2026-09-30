// Lay a film's sound on one track: the voice takes where the film places them,
// the score option it plays under the voice and alone in its pauses, the
// library's beds ducked under the voice (room tone is not),
// and each effect on its cue at its level relative to the voice. What plays
// where, and the signal processing, are core (core/mix.ts); `Mixer.mix` loads
// the film and the app's library, decodes what its plan plays (a procedural
// sound is synthesized; a library file not on disk is skipped with a hint to
// `sfx pull`), renders it and writes the track: one WAV that the player
// streams and the renderer encodes a video's audio from. Remixing never calls
// a paid API.

import { Context, Effect, FileSystem, Layer, Option, Result } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { type Pcm, levels, windowLevels } from '../core/audio.ts';
import {
  type BedSpan,
  MIX_RATE,
  type MixPlan,
  type MixPlanError,
  type Mixed,
  type Placement,
  type ScoreBed,
  type Take,
  mixPlan,
  renderMix,
} from '../core/mix.ts';
import type { SoundSource, Sounds } from '../core/sfx.ts';
import { synthesize } from '../core/synth/recipes.ts';
import type { StoreError } from './content-store.ts';
import {
  AudioMissing,
  AudioStale,
  type FilmModuleInvalid,
  type FilmNotFound,
  type MediaFailed,
  SampleRateMismatch,
  TakeUnknown,
} from './errors.ts';
import { type FilmPaths, FilmRepo, type PlaceError, placeFilm } from './film-repo.ts';
import { Media, type MediaService } from './media.ts';

/** The film's mixed track (16-bit WAV): the player streams it, the renderer encodes from it. */
export const masterFile = (paths: FilmPaths): string => `${paths.narration}/full.wav`;

/** Where a file is written until it is whole: `full.wav` → `full.partial.wav`. */
const partialFile = (file: string): string => file.replace(/(\.[^./]+)$/, '.partial$1');

/** The track's measured length in seconds, or none when there is no track. */
export const measureMaster = (
  fs: FileSystem.FileSystem,
  media: MediaService,
  file: string,
): Effect.Effect<Option.Option<number>, MediaFailed | PlatformError> =>
  Effect.gen(function* () {
    if (!(yield* fs.exists(file))) return Option.none();
    return Option.some(yield* media.duration(file));
  });

/** The rate the master is read at for its levels: speech and room tone both sit under 8 kHz. */
const LEVEL_RATE = 16000;

/** The master's RMS level in dBFS over each `window` seconds, in order (`DeadAir` reads it). */
export const masterLevels = (
  media: MediaService,
  file: string,
  window: number,
): Effect.Effect<Float64Array, MediaFailed> =>
  Effect.map(media.load(file, LEVEL_RATE), (pcm) =>
    windowLevels(pcm.channels[0] ?? new Float32Array(), Math.round(window * LEVEL_RATE)),
  );

/**
 * The track against the film it must cover: missing, or longer or shorter
 * than `seconds` by more than `tolerance` (a frame), it is not this film's
 * track. A mix is exactly the film's length, so a current one always passes.
 */
export const masterFinding = (
  file: string,
  length: Option.Option<number>,
  seconds: number,
  tolerance: number,
): Option.Option<AudioMissing | AudioStale> =>
  Option.match(length, {
    onNone: () => Option.some(AudioMissing.make({ file })),
    onSome: (measured) =>
      Option.liftPredicate(
        AudioStale.make({ file, length: measured, film: seconds }),
        () => Math.abs(measured - seconds) > tolerance,
      ),
  });

export interface MixOptions {
  /** Also write each bus to `<out>/<film>/stems/<bus>.wav` (the score's as `music.<option>.wav`). */
  readonly stems: boolean;
  /** The score option to play in place of the one the score names (`mix --score`). */
  readonly score: Option.Option<string>;
}

export type MixError =
  | MixPlanError
  | PlaceError
  | FilmNotFound
  | FilmModuleInvalid
  | StoreError
  | MediaFailed
  | SampleRateMismatch
  | TakeUnknown;

/** What a mix is rendered from beyond the film. */
export interface RenderOptions {
  /** Log each warning the plan earns (stale, missing). */
  readonly warn: boolean;
  /** The score option to play in place of the one the score names. */
  readonly score: Option.Option<string>;
  /** One take of a library sound to play at each of its placements, in place of its kept ones. */
  readonly take: Option.Option<TakeInPlace>;
}

/** A take of a library sound, by its sha256, heard where the film plays that sound. */
export interface TakeInPlace {
  readonly sound: string;
  readonly take: string;
}

/**
 * `sounds` with `sound` playing only the take `take` names (kept or waiting),
 * at every placement; `TakeUnknown` when it has no such take.
 */
export const withTake = (sounds: Sounds, take: TakeInPlace): Result.Result<Sounds, TakeUnknown> => {
  const entry = Option.fromUndefinedOr(sounds.lock[take.sound]);
  const found = Option.flatMap(entry, (e) =>
    Option.fromUndefinedOr([...e.variants, ...e.candidates].find((v) => v.sha256 === take.take)),
  );
  return Option.match(Option.all([entry, found]), {
    onNone: () => Result.fail(TakeUnknown.make(take)),
    onSome: ([e, variant]) =>
      Result.succeed({
        ...sounds,
        lock: { ...sounds.lock, [take.sound]: { ...e, variants: [variant] } },
      }),
  });
};

/** A mix rendered in memory, and the decoded plan it played. */
export interface Rendered {
  readonly plan: MixPlan<Pcm>;
  readonly mixed: Mixed;
}

export interface MixerService {
  /**
   * Rebuild `narration/full.wav` from the film's current takes, score and
   * effects. The track is written beside the old one and replaces it once
   * whole; a failed or interrupted mix leaves the old track as it was.
   */
  readonly mix: (film: string, options: MixOptions) => Effect.Effect<void, MixError>;
  /**
   * The film's mix in memory, as `mix` would write it, with the plan it
   * played (decoded): what `check` measures the balance on.
   */
  readonly render: (
    film: string,
    options: RenderOptions,
  ) => Effect.Effect<Rendered, MixError | PlatformError>;
}

/**
 * `plan` with every sound it plays decoded (a file) or played (a recipe); the
 * mix never resamples, so a file at another rate fails.
 */
export const decodePlan = (
  media: MediaService,
  plan: MixPlan<SoundSource>,
): Effect.Effect<MixPlan<Pcm>, MediaFailed | SampleRateMismatch> => {
  const decodeAt = (source: SoundSource): Effect.Effect<Pcm, MediaFailed | SampleRateMismatch> => {
    if (source._tag === 'Synth') return Effect.sync(() => synthesize(source.recipe, source.seed));
    return Effect.filterOrFail(
      media.decode(source.file),
      (pcm) => pcm.rate === MIX_RATE,
      (pcm) => SampleRateMismatch.make({ file: source.file, rate: pcm.rate, expected: MIX_RATE }),
    );
  };
  const place = (p: Placement<SoundSource>) =>
    Effect.map(decodeAt(p.sound), (sound): Placement<Pcm> => ({ ...p, sound }));
  const read = (take: Take<SoundSource>) =>
    Effect.map(decodeAt(take.sound), (sound): Take<Pcm> => ({ ...take, sound }));
  const lay = (score: ScoreBed<SoundSource>) =>
    Effect.map(decodeAt(score.sound), (sound): ScoreBed<Pcm> => ({ ...score, sound }));
  const span = (bed: BedSpan<SoundSource>) =>
    Effect.map(decodeAt(bed.sound), (sound): BedSpan<Pcm> => ({ ...bed, sound }));
  return Effect.gen(function* () {
    const decoded: MixPlan<Pcm> = {
      ...plan,
      voice: yield* Effect.forEach(plan.voice, read, { concurrency: 4 }),
      score: yield* Effect.transposeOption(Option.map(plan.score, lay)),
      beds: yield* Effect.forEach(plan.beds, span, { concurrency: 4 }),
      effects: yield* Effect.forEach(plan.effects, place, { concurrency: 4 }),
    };
    return decoded;
  });
};

/**
 * `plan` without the generated files that are not on disk (a clone that has
 * not run `sfx pull`), each named in a warning: the mix plays what it has.
 */
export const presentOnly = (
  exists: (file: string) => Effect.Effect<boolean, PlatformError>,
  plan: MixPlan<SoundSource>,
): Effect.Effect<MixPlan<SoundSource>, PlatformError> =>
  Effect.gen(function* () {
    const absent = new Set<string>();
    const sources = [
      ...Option.toArray(Option.map(plan.score, (s) => s.sound)),
      ...plan.beds.map((b) => b.sound),
      ...plan.effects.map((e) => e.sound),
    ];
    for (const source of sources)
      if (source._tag === 'File' && !absent.has(source.file) && !(yield* exists(source.file)))
        absent.add(source.file);
    const here = (source: SoundSource) => source._tag !== 'File' || !absent.has(source.file);
    return {
      ...plan,
      score: Option.filter(plan.score, (s) => here(s.sound)),
      beds: plan.beds.filter((b) => here(b.sound)),
      effects: plan.effects.filter((e) => here(e.sound)),
      warnings: [
        ...plan.warnings,
        ...[...absent].map((file) => `mix.missing file=${file} hint="run sfx pull"`),
      ],
    };
  });

/** One bus of the mix, by the name its levels log and its stem take. */
interface Bus {
  readonly bus: string;
  readonly pcm: Pcm;
}

/** A level for the log: one decimal, silence as `-inf`. */
const db = (value: number) =>
  Option.match(Option.liftPredicate(value, Number.isFinite), {
    onNone: () => '-inf',
    onSome: (finite) => finite.toFixed(1),
  });

export class Mixer extends Context.Service<Mixer, MixerService>()('@bible/film/tools/Mixer') {
  static readonly layer = Layer.effect(
    Mixer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const repo = yield* FilmRepo;
      const media = yield* Media;

      /** `pcm` written to `file` whole: beside it first, renamed over it once written. */
      const writeWhole = (file: string, pcm: Pcm) =>
        Effect.gen(function* () {
          const partial = partialFile(file);
          yield* media
            .writeWav(partial, pcm)
            .pipe(Effect.onError(() => Effect.ignore(fs.remove(partial, { force: true }))));
          yield* fs.rename(partial, file);
        });

      const render = Effect.fn('Mixer.render')(function* (name: string, options: RenderOptions) {
        const film = yield* repo.load(name);
        const placed = yield* placeFilm(film);
        const sounds = yield* Option.match(options.take, {
          onNone: () => Effect.succeed(film.sounds),
          onSome: (take) => Effect.fromResult(withTake(film.sounds, take)),
        });
        const planned = yield* Effect.fromResult(
          mixPlan({
            film: name,
            placed,
            sound: film.sound,
            manifest: film.manifest,
            sounds,
            narration: film.paths.narration,
            soundDir: film.paths.sound,
            play: options.score,
          }),
        );
        const present = yield* presentOnly((file) => fs.exists(file), planned);
        if (options.warn) for (const warning of present.warnings) yield* Effect.logWarning(warning);
        const plan = yield* decodePlan(media, present);
        const rendered: Rendered = { plan, mixed: renderMix(plan) };
        return rendered;
      });

      const mix = Effect.fn('Mixer.mix')(function* (name: string, options: MixOptions) {
        const film = yield* repo.load(name);
        const { plan, mixed } = yield* render(name, {
          warn: true,
          score: options.score,
          take: Option.none(),
        });
        const option = Option.map(plan.score, (s) => s.option);
        const music = Option.match(option, {
          onNone: () => 'music',
          onSome: (o) => `music.${o}`,
        });
        const buses: ReadonlyArray<Bus> = [
          { bus: 'voice', pcm: mixed.voice },
          ...Option.toArray(Option.map(mixed.music, (pcm) => ({ bus: music, pcm }))),
          ...Option.toArray(Option.map(mixed.beds, (pcm) => ({ bus: 'beds', pcm }))),
          ...Option.toArray(Option.map(mixed.effects, (pcm) => ({ bus: 'effects', pcm }))),
        ];
        for (const { bus, pcm } of [{ bus: 'master', pcm: mixed.master }, ...buses]) {
          const { mean, peak } = levels(pcm);
          yield* Effect.log(`mix.levels bus=${bus} mean=${db(mean)}dB peak=${db(peak)}dB`);
        }
        yield* Effect.log(`mix.master gain=${mixed.masterGain.toFixed(1)}dB`);

        const master = masterFile(film.paths);
        yield* writeWhole(master, mixed.master);
        if (options.stems) {
          const dir = `${film.paths.out}/stems`;
          yield* fs.makeDirectory(dir, { recursive: true });
          yield* Effect.forEach(buses, ({ bus, pcm }) => writeWhole(`${dir}/${bus}.wav`, pcm), {
            discard: true,
          });
          yield* Effect.log(`mix.stems names=${buses.map(({ bus }) => bus).join(',')} dir=${dir}`);
        }
        yield* Effect.log(
          `mix.track takes=${plan.voice.length} score=${Option.getOrElse(option, () => 'none')} beds=${plan.beds.length} effects=${plan.effects.length} secs=${plan.seconds.toFixed(1)} file=${master}`,
        );
      });

      return Mixer.of({ mix, render });
    }),
  );
}
