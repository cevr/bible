// Lay a film's sound on one track: the voice takes where the film places them,
// the score ducked under the voice, and each effect on its cue. `graph` is the
// whole decision, pure: it returns the ffmpeg arguments, so the mix is checked
// without ffmpeg. `Mixer.mix` loads the film and runs it. Remixing never calls
// a paid API.

import { Context, Effect, FileSystem, Layer, Option, Record as Rec, Result } from 'effect';
import type { Placed } from '../core/layout.ts';
import type { Sound, SoundManifest } from '../core/schema.ts';
import { cueTime, effectKey, filmEnd, musicKey, musicPlan } from '../core/sound.ts';
import type { StoreError } from './content-store.ts';
import type {
  ActTooShort,
  CueInvalid,
  FfmpegFailed,
  FfmpegMissing,
  FilmModuleInvalid,
  FilmNotFound,
  LayoutInvalid,
  UnknownCue,
  UnknownMark,
  UnknownScene,
} from './errors.ts';
import { Ffmpeg } from './ffmpeg.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';

/** How far the bed sits under the voice: gentle ratio, slow release so it breathes back. */
const DUCK = 'sidechaincompress=threshold=0.02:ratio=3:attack=80:release=1000:knee=4';
const FMT = 'aformat=sample_rates=44100:channel_layouts=stereo';

export interface MixInput {
  readonly placed: ReadonlyArray<Placed>;
  readonly sound: Option.Option<Sound>;
  readonly manifest: SoundManifest;
  /** Directory of the voice takes. */
  readonly narration: string;
  /** Directory of the generated music and effects. */
  readonly soundDir: string;
  /** The mixed track. */
  readonly out: string;
  /** Where to write one WAV per bus, when stems are wanted. */
  readonly stems: Option.Option<string>;
}

export interface MixGraph {
  /** ffmpeg's arguments, without the program name. */
  readonly args: ReadonlyArray<string>;
  /** Stale or missing assets; the mix still plays what it has. */
  readonly warnings: ReadonlyArray<string>;
  readonly takes: number;
  /** The score file, or `none`. */
  readonly music: string;
  readonly effects: number;
  readonly seconds: number;
  /** The buses written as stems. */
  readonly stems: ReadonlyArray<string>;
}

export type GraphError = UnknownScene | UnknownCue | UnknownMark | CueInvalid | ActTooShort;

const delay = (secs: number) => {
  const ms = Math.max(0, Math.round(secs * 1000));
  return `adelay=${ms}|${ms}`;
};

/** The whole mix as ffmpeg arguments. Pure. */
export const graph = (input: MixInput): Result.Result<MixGraph, GraphError> =>
  Result.gen(function* () {
    const { placed, manifest } = input;
    const total = filmEnd(placed);
    const inputs: Array<string> = [];
    const filters: Array<string> = [];
    const warnings: Array<string> = [];
    const bus = new Map<'voice' | 'music' | 'effects', string>();
    const addInput = (file: string) => {
      inputs.push('-i', file);
      return inputs.length / 2 - 1;
    };

    // Voice, padded so the ducking key outlasts the last word and the score plays out.
    const takes = placed.flatMap((p) =>
      Option.match(
        Option.filter(Option.fromNullishOr(p.voice.file), () => p.voice.recorded),
        {
          onNone: () => [],
          onSome: (file) => [{ file, at: p.start + p.speechStart }],
        },
      ),
    );
    for (const [k, take] of takes.entries()) {
      const i = addInput(`${input.narration}/${take.file}`);
      filters.push(`[${i}:a]${FMT},${delay(take.at)}[v${k}]`);
    }
    const voices = takes.map((_, k) => `[v${k}]`).join('');
    filters.push(`${voices}amix=inputs=${takes.length}:normalize=0,apad,asplit=2[voice][key]`);
    bus.set('voice', '[voice]');

    // Music, ducked under the voice. A stale score still plays, with a warning.
    let music = 'none';
    const score = Option.flatMap(input.sound, (s) => Option.fromNullishOr(s.music));
    const made = Option.fromNullishOr(manifest.music);
    if (Option.isSome(score) && Option.isSome(made)) {
      const plan = yield* musicPlan(score.value, placed);
      if (made.value.hash !== musicKey(score.value, plan))
        warnings.push(
          'mix.stale asset=music hint="acts or timing changed; run score to regenerate"',
        );
      const i = addInput(`${input.soundDir}/${made.value.file}`);
      const fadeOut = Math.max(0, total - 6).toFixed(3);
      filters.push(
        `[${i}:a]${FMT},volume=${score.value.gain},afade=t=in:d=2,afade=t=out:st=${fadeOut}:d=6[bed]`,
        `[bed][key]${DUCK}[music]`,
      );
      bus.set('music', '[music]');
      music = made.value.file;
    } else filters.push('[key]anullsink');

    // Effects, each on its cue.
    const fxTags: Array<string> = [];
    const effects = Option.match(input.sound, { onNone: () => ({}), onSome: (s) => s.effects });
    for (const [id, fx] of Object.entries(effects)) {
      const made = Rec.get(manifest.effects, id);
      if (Option.isNone(made)) {
        warnings.push(`mix.missing effect=${id} hint="run score to generate it"`);
        continue;
      }
      const asset = made.value;
      if (asset.hash !== effectKey(fx)) warnings.push(`mix.stale effect=${id}`);
      const gain = Option.getOrElse(Option.fromNullishOr(fx.gain), () => 1);
      for (const cue of fx.at) {
        const at = yield* cueTime(cue, placed);
        const i = addInput(`${input.soundDir}/${asset.file}`);
        const tag = `[fx${fxTags.length}]`;
        filters.push(`[${i}:a]${FMT},volume=${gain},${delay(at)}${tag}`);
        fxTags.push(tag);
      }
    }
    if (fxTags.length > 0) {
      filters.push(`${fxTags.join('')}amix=inputs=${fxTags.length}:normalize=0[effects]`);
      bus.set('effects', '[effects]');
    }

    // Each stem can also be written alone, to balance by measurement rather than by ear.
    const names = [...bus.keys()];
    const stemMaps: Array<string> = [];
    if (Option.isSome(input.stems))
      for (const name of names) {
        filters.push(`${bus.get(name)}asplit=2[${name}_mix][${name}_stem]`);
        filters.push(`[${name}_stem]atrim=0:${total.toFixed(3)}[${name}_out]`);
        bus.set(name, `[${name}_mix]`);
        stemMaps.push('-map', `[${name}_out]`, `${input.stems.value}/${name}.wav`);
      }

    const buses = [...bus.values()].join('');
    filters.push(
      `${buses}amix=inputs=${bus.size}:normalize=0,alimiter=limit=0.95:level=false,apad,atrim=0:${total.toFixed(3)}[out]`,
    );
    const args = [
      '-y',
      '-loglevel',
      'error',
      ...inputs,
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[out]',
      '-ac',
      '2',
      '-ar',
      '44100',
      '-b:a',
      '192k',
      input.out,
      ...stemMaps,
    ];
    return {
      args,
      warnings,
      takes: takes.length,
      music,
      effects: fxTags.length,
      seconds: total,
      stems: Option.match(input.stems, { onNone: () => [], onSome: () => names }),
    };
  });

export interface MixOptions {
  /** Also write each bus to `<out>/<film>/stems/<bus>.wav`. */
  readonly stems: boolean;
}

export type MixError =
  | GraphError
  | LayoutInvalid
  | FilmNotFound
  | FilmModuleInvalid
  | StoreError
  | FfmpegFailed
  | FfmpegMissing;

export interface MixerService {
  /** Rebuild `narration/full.mp3` from the film's current takes, score and effects. */
  readonly mix: (film: string, options: MixOptions) => Effect.Effect<void, MixError>;
}

export class Mixer extends Context.Service<Mixer, MixerService>()('@bible/film/tools/Mixer') {
  static readonly layer = Layer.effect(
    Mixer,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const repo = yield* FilmRepo;
      const ffmpeg = yield* Ffmpeg;

      const mix = Effect.fn('Mixer.mix')(function* (name: string, options: MixOptions) {
        const film = yield* repo.load(name);
        const placed = yield* placeFilm(film);
        const stemDir = `${film.paths.out}/stems`;
        const stems = Option.liftPredicate(stemDir, () => options.stems);
        const out = `${film.paths.narration}/full.mp3`;
        const mixed = yield* Effect.fromResult(
          graph({
            placed,
            sound: film.sound,
            manifest: film.manifest,
            narration: film.paths.narration,
            soundDir: film.paths.sound,
            out,
            stems,
          }),
        );
        for (const warning of mixed.warnings) yield* Effect.logWarning(warning);
        if (Option.isSome(stems)) yield* fs.makeDirectory(stems.value, { recursive: true });
        yield* ffmpeg.run(mixed.args);
        if (Option.isSome(stems))
          yield* Effect.log(`mix.stems names=${mixed.stems.join(',')} dir=${stems.value}`);
        yield* Effect.log(
          `mix.track takes=${mixed.takes} music=${mixed.music} effects=${mixed.effects} secs=${mixed.seconds.toFixed(1)} file=${out}`,
        );
      });

      return Mixer.of({ mix });
    }),
  );
}
