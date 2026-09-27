// Lay a film's sound on one track: the voice takes where the film places them,
// the score ducked under the voice, and each effect on its cue: a mark, or an
// Event its scene's timeline fires, read from the film's Rive project. What
// plays where, and the signal processing, are core (core/mix.ts); `Mixer.mix`
// loads the film, decodes what its plan plays, renders it and writes the
// track: one WAV the renderer encodes a video's audio from, and `sync` makes
// the Film's preview soundtrack from. Remixing never calls a paid API.

import { Context, Effect, FileSystem, Layer, Option, Predicate } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import { type Pcm, levels } from '../core/audio.ts';
import {
  type Bed,
  MIX_RATE,
  type MixPlan,
  type MixPlanError,
  type Placement,
  mixPlan,
  renderMix,
} from '../core/mix.ts';
import type { Sound } from '../core/schema.ts';
import type { EventTimes } from '../core/sound.ts';
import type { StoreError } from './content-store.ts';
import {
  type FilmModuleInvalid,
  type FilmNotFound,
  type LayoutInvalid,
  type MediaFailed,
  type RiveFailed,
  type RiveMissing,
  SampleRateMismatch,
} from './errors.ts';
import { FilmRepo, placeFilm } from './film-repo.ts';
import { Media, type MediaService } from './media.ts';
import { masterFile } from './master.ts';
import { FilmProject } from './project.ts';

/** Where a file is written until it is whole: `full.wav` → `full.partial.wav`. */
const partialFile = (file: string): string => file.replace(/(\.[^./]+)$/, '.partial$1');

export interface MixOptions {
  /** Also write each bus to `<out>/<film>/stems/<bus>.wav`. */
  readonly stems: boolean;
}

export type MixError =
  | MixPlanError
  | LayoutInvalid
  | FilmNotFound
  | FilmModuleInvalid
  | StoreError
  | MediaFailed
  | SampleRateMismatch
  | RiveMissing
  | RiveFailed
  | PlatformError;

/** Whether any effect plays on an Event: only then does the mix read the Rive project. */
export const namesEvents = (sound: Option.Option<Sound>): boolean =>
  Option.exists(sound, (s) =>
    Object.values(s.effects).some((e) => e.at.some((cue) => Predicate.isNotUndefined(cue.event))),
  );

export interface MixerService {
  /**
   * Rebuild `narration/full.wav` from the film's current takes, score and
   * effects. The track is written beside the old one and replaces it once
   * whole; a failed or interrupted mix leaves the old track as it was.
   */
  readonly mix: (film: string, options: MixOptions) => Effect.Effect<void, MixError>;
}

/** `plan` with every sound it plays decoded; the mix never resamples, so another rate fails. */
export const decodePlan = (
  media: MediaService,
  plan: MixPlan<string>,
): Effect.Effect<MixPlan<Pcm>, MediaFailed | SampleRateMismatch> => {
  const decodeAt = (file: string) =>
    Effect.filterOrFail(
      media.decode(file),
      (pcm) => pcm.rate === MIX_RATE,
      (pcm) => SampleRateMismatch.make({ file, rate: pcm.rate, expected: MIX_RATE }),
    );
  const place = (p: Placement<string>) =>
    Effect.map(decodeAt(p.sound), (sound): Placement<Pcm> => ({ ...p, sound }));
  const lay = (bed: Bed<string>) =>
    Effect.map(decodeAt(bed.sound), (sound): Bed<Pcm> => ({ ...bed, sound }));
  return Effect.gen(function* () {
    const decoded: MixPlan<Pcm> = {
      ...plan,
      voice: yield* Effect.forEach(plan.voice, place, { concurrency: 4 }),
      music: yield* Effect.transposeOption(Option.map(plan.music, lay)),
      effects: yield* Effect.forEach(plan.effects, place, { concurrency: 4 }),
    };
    return decoded;
  });
};

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
      const project = yield* FilmProject;

      /** `pcm` written to `file` whole: beside it first, renamed over it once written. */
      const writeWhole = (file: string, pcm: Pcm) =>
        Effect.gen(function* () {
          const partial = partialFile(file);
          yield* media
            .writeWav(partial, pcm)
            .pipe(Effect.onError(() => Effect.ignore(fs.remove(partial, { force: true }))));
          yield* fs.rename(partial, file);
        });

      const mix = Effect.fn('Mixer.mix')(function* (name: string, options: MixOptions) {
        const film = yield* repo.load(name);
        const placed = yield* placeFilm(film);
        let events: EventTimes = new Map();
        if (namesEvents(film.sound)) events = yield* project.events(film, placed);
        const plan = yield* Effect.fromResult(
          mixPlan({
            placed,
            events,
            sound: film.sound,
            manifest: film.manifest,
            narration: film.paths.narration,
            soundDir: film.paths.sound,
          }),
        );
        for (const warning of plan.warnings) yield* Effect.logWarning(warning);
        const mixed = renderMix(yield* decodePlan(media, plan));
        const buses: ReadonlyArray<Bus> = [
          { bus: 'voice', pcm: mixed.voice },
          ...Option.toArray(Option.map(mixed.music, (pcm) => ({ bus: 'music', pcm }))),
          ...Option.toArray(Option.map(mixed.effects, (pcm) => ({ bus: 'effects', pcm }))),
        ];
        for (const { bus, pcm } of [{ bus: 'master', pcm: mixed.master }, ...buses]) {
          const { mean, peak } = levels(pcm);
          yield* Effect.log(`mix.levels bus=${bus} mean=${db(mean)}dB peak=${db(peak)}dB`);
        }

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
          `mix.track takes=${plan.voice.length} music=${Option.isSome(plan.music)} effects=${plan.effects.length} secs=${plan.seconds.toFixed(1)} file=${master}`,
        );
      });

      return Mixer.of({ mix });
    }),
  );
}
