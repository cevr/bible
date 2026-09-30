// A film's sound on one track. `mixPlan` is the whole decision, pure: which
// take, score option, bed and effect play, where and how loud, with the
// warnings a stale or missing asset earns. `renderMix` plays a plan out once
// each sound in it is decoded: the voice bus, the score under the voice and
// alone where no one speaks (`score.ts`), the beds looped and faded (ducked
// unless they sit under everything), the effects on their cues, summed and
// limited. Remixing never calls a paid API.
//
// Effects and beds name sounds from the app's library (`sfx.ts`), levelled in
// dB relative to the voice's speech level by what each variant measured.

import { Option, Result } from 'effect';
import { type Pcm, toStereo } from './audio.ts';
import { type Duck, type Limit, addInto, duck, fade, limit, toFrames } from './dsp.ts';
import {
  CueInvalid,
  type MovementLength,
  type ScoreUnknown,
  type SoundUseMismatch,
  type UnknownCue,
  type UnknownMark,
  type UnknownScene,
  type UnknownSound,
  type WordMissing,
} from './errors.ts';
import type { Placed } from './layout.ts';
import { takeLift } from './recording.ts';
import type { Sound, SoundManifest } from './schema.ts';
import {
  type Placing,
  type Playable,
  type SoundSource,
  type Sounds,
  fileSource,
  gainFor,
  jitterOf,
  levelOf,
  playPlacings,
  playablesOf,
  resolveUse,
  soundState,
} from './sfx.ts';
import { aloneSpans, aloneWeights, applyScore, scoreGains, speechSpans } from './score.ts';
import { loudness } from './synth/loudness.ts';
import { cueTime, filmEnd, musicKey, musicPlan, playedOption } from './sound.ts';

/** Every mix runs at this rate; the takes, score and library sounds are made at it. */
export const MIX_RATE = 44100;

/** How far a bed sits under the voice: gentle ratio, slow release so it breathes back. */
export const BED_DUCK: Duck = { threshold: 0.02, ratio: 2, attack: 120, release: 1500, knee: 4 };

/** The ceiling the summed track may not pass. */
export const LIMIT: Limit = { limit: 0.95, attack: 5, release: 50 };

/**
 * Mastering: the summed track is brought to `loudness` (integrated LUFS, CRAFT
 * rule 10) by one clean gain, up or down, before the limiter; a lift stops
 * where it would take the track's peak past `LIMIT`, so mastering never makes
 * the limiter work. The buses keep their balance; only the master moves.
 */
export const MASTER = { loudness: -18 } as const;

/** The score fades in over its first `MUSIC_FADE_IN` seconds and out over the film's last `MUSIC_FADE_OUT`. */
export const MUSIC_FADE_IN = 2;
export const MUSIC_FADE_OUT = 6;

/** A bed fades in and out over this many seconds when it names no `fade`. */
export const BED_FADE = 1;

/** A bed crosses into itself over this many seconds where it wraps (at most a quarter of its length). */
export const BED_CROSSFADE = 0.5;

/** One sound on a bus: where it starts (seconds into the film), how loud, and its pitch nudge. */
export interface Placement<A> {
  /** What the film calls it: the effect's id in `sound.ts`, or the take's scene. */
  readonly name: string;
  readonly sound: A;
  readonly at: number;
  readonly gain: number;
  /** Semitones; the sound is resampled, so its length changes with it. */
  readonly pitch: number;
}

/**
 * A take on the voice bus. A staging take (`staged`) is levelled here, as
 * `takes import` levels a recording (`takeLift`): ElevenLabs sends each at its
 * own level, so the mix brings its speech to the one the film is balanced
 * on. A person's take was levelled when it was imported and plays as it is.
 */
export interface Take<A> extends Placement<A> {
  readonly staged: boolean;
}

/**
 * The score option the mix plays: one sound under the whole film, from its
 * start, at `under` dB against the voice where anyone speaks and `alone` dB
 * where no one does (`score.ts`).
 */
export interface ScoreBed<A> {
  /** The option's name in the film's score. */
  readonly option: string;
  readonly sound: A;
  readonly under: number;
  readonly alone: number;
}

/** A library bed: its sound looped from `from` to `to` (film seconds), faded at each end. */
export interface BedSpan<A> {
  readonly sound: A;
  readonly from: number;
  readonly to: number;
  readonly gain: number;
  /** Seconds each end fades over. */
  readonly fade: number;
  /** Ducks under the voice (room tone does not). */
  readonly duck: boolean;
}

/** What plays where. `A` is how a sound is named: its source, then its decoded audio. */
export interface MixPlan<A> {
  /** The track's length: the film's. */
  readonly seconds: number;
  /** Each recorded take. */
  readonly voice: ReadonlyArray<Take<A>>;
  /** The score option that plays, or none. */
  readonly score: Option.Option<ScoreBed<A>>;
  /** Each bed over its span. */
  readonly beds: ReadonlyArray<BedSpan<A>>;
  /** Each effect on each of its cues. */
  readonly effects: ReadonlyArray<Placement<A>>;
  /** Stale or missing assets; the mix still plays what it has. */
  readonly warnings: ReadonlyArray<string>;
}

export interface MixInput {
  /** The film's name: it seeds each effect's variant and jitter. */
  readonly film: string;
  readonly placed: ReadonlyArray<Placed>;
  readonly sound: Option.Option<Sound>;
  readonly manifest: SoundManifest;
  /** The app's sound library and what was made for it. */
  readonly sounds: Sounds;
  /** Directory of the voice takes. */
  readonly narration: string;
  /** Directory of the generated score. */
  readonly soundDir: string;
  /** The score option to play in place of the one the score names (`mix --score`). */
  readonly play: Option.Option<string>;
}

export type MixPlanError =
  | UnknownScene
  | UnknownCue
  | UnknownMark
  | WordMissing
  | CueInvalid
  | MovementLength
  | ScoreUnknown
  | UnknownSound
  | SoundUseMismatch;

/** A sound's variants that play, or a warning when none does (and one when they are stale). */
const variantsFor = (
  sounds: Sounds,
  name: string,
  entry: Parameters<typeof playablesOf>[2],
  warnings: Array<string>,
): ReadonlyArray<Playable> => {
  const state = soundState(entry, Option.fromUndefinedOr(sounds.lock[name]));
  if (state._tag === 'Missing') {
    warnings.push(`mix.missing sound=${name} hint="run sfx make ${name}, then sfx keep"`);
    return [];
  }
  if (state._tag === 'Stale') warnings.push(`mix.stale sound=${name} hint="run sfx make ${name}"`);
  return playablesOf(sounds, name, entry);
};

/** One placement waiting for its variant: which effect, its sound, its time and its level. */
interface Pending extends Placing {
  readonly playables: ReadonlyArray<Playable>;
  readonly level: number;
}

/** Each effect on each of its cues, its variant chosen and nudged, levelled against the voice. */
const effectPlacements = (input: MixInput, sound: Sound, warnings: Array<string>) =>
  Result.gen(function* () {
    const pending: Array<Pending> = [];
    for (const [id, fx] of Object.entries(sound.effects)) {
      const entry = yield* resolveUse(input.sounds.library, fx.sound, 'one-shot');
      const playables = variantsFor(input.sounds, fx.sound, entry, warnings);
      if (playables.length === 0) continue;
      const level = levelOf(entry, Option.fromUndefinedOr(fx.level));
      for (const cue of fx.at)
        pending.push({
          effect: id,
          sound: fx.sound,
          at: yield* cueTime(cue, input.placed),
          playables,
          level,
        });
    }
    const played = playPlacings(
      input.film,
      pending,
      (name) => pending.find((p) => p.sound === name)?.playables.length ?? 1,
      (name) =>
        Option.flatMap(Option.fromUndefinedOr(input.sounds.library[name]), (entry) =>
          jitterOf(entry),
        ),
    );
    return pending.flatMap((p, i) =>
      Option.toArray(
        Option.flatMap(Option.fromUndefinedOr(played[i]), (choice) =>
          Option.map(
            Option.fromUndefinedOr(p.playables[choice.variant]),
            (playable): Placement<SoundSource> => ({
              name: p.effect,
              sound: playable.source,
              at: p.at + choice.delay,
              gain: gainFor(p.level, playable.loudness, 'one-shot') * 10 ** (choice.gain / 20),
              pitch: choice.pitch,
            }),
          ),
        ),
      ),
    );
  });

/** Each bed over its span, levelled against the voice; a bed's k-th span plays its k-th variant. */
const bedSpans = (input: MixInput, sound: Sound, warnings: Array<string>) =>
  Result.gen(function* () {
    const spans: Array<BedSpan<SoundSource>> = [];
    const seen = new Map<string, number>();
    for (const bed of sound.beds ?? []) {
      const entry = yield* resolveUse(input.sounds.library, bed.sound, 'bed');
      const playables = variantsFor(input.sounds, bed.sound, entry, warnings);
      if (playables.length === 0) continue;
      const from = yield* cueTime(bed.from, input.placed);
      const to = yield* cueTime(bed.to, input.placed);
      if (to <= from)
        return yield* Result.fail(
          CueInvalid.make({
            scene: bed.from.scene,
            reason: `starts bed "${bed.sound}" at ${from.toFixed(2)}s, which ends at ${to.toFixed(2)}s`,
          }),
        );
      const k = seen.get(bed.sound) ?? 0;
      seen.set(bed.sound, k + 1);
      const playable = Option.fromUndefinedOr(playables[k % playables.length]);
      if (Option.isNone(playable)) continue;
      spans.push({
        sound: playable.value.source,
        from,
        to,
        gain: gainFor(
          levelOf(entry, Option.fromUndefinedOr(bed.level)),
          playable.value.loudness,
          'bed',
        ),
        fade: bed.fade ?? BED_FADE,
        duck: entry.duck !== false,
      });
    }
    return spans;
  });

/** What plays where, by source. Pure. */
export const mixPlan = (input: MixInput): Result.Result<MixPlan<SoundSource>, MixPlanError> =>
  Result.gen(function* () {
    const { placed, manifest } = input;
    const warnings: Array<string> = [];

    const voice = placed.flatMap((p) =>
      Option.match(
        Option.filter(Option.fromNullishOr(p.voice.file), () => p.voice.recorded),
        {
          onNone: () => [],
          onSome: (file): ReadonlyArray<Take<SoundSource>> => [
            {
              name: p.spec.id,
              sound: fileSource(`${input.narration}/${file}`),
              at: p.start + p.speechStart,
              gain: 1,
              pitch: 0,
              staged: p.voice.source !== 'recorded',
            },
          ],
        },
      ),
    );

    // A stale score still plays, with a warning; a missing one is silence, with a warning.
    let played = Option.none<ScoreBed<SoundSource>>();
    const declared = Option.flatMap(input.sound, (s) => Option.fromNullishOr(s.score));
    if (Option.isSome(declared)) {
      const score = declared.value;
      const option = yield* playedOption(score, input.play);
      const made = Option.fromNullishOr(manifest.scores?.[option.name]);
      if (Option.isNone(made))
        warnings.push(
          `mix.missing asset=score.${option.name} hint="run score to compose it, or score pull"`,
        );
      if (Option.isSome(made)) {
        const plan = yield* musicPlan(option.music, placed);
        if (made.value.hash !== musicKey(option.music, plan))
          warnings.push(
            `mix.stale asset=score.${option.name} hint="acts or timing changed; run score to compose it again"`,
          );
        played = Option.some({
          option: option.name,
          sound: fileSource(`${input.soundDir}/${made.value.file}`),
          under: score.under,
          alone: score.alone,
        });
      }
    }

    let beds: ReadonlyArray<BedSpan<SoundSource>> = [];
    let effects: ReadonlyArray<Placement<SoundSource>> = [];
    if (Option.isSome(input.sound)) {
      beds = yield* bedSpans(input, input.sound.value, warnings);
      effects = yield* effectPlacements(input, input.sound.value, warnings);
    }

    return { seconds: filmEnd(placed), voice, score: played, beds, effects, warnings };
  });

/** The track, and each bus alone (for balancing by measurement): all `MIX_RATE`, stereo, the film's length. */
export interface Mixed {
  readonly master: Pcm;
  /** The mastering gain the summed buses took on the way to `master`, in dB (`MASTER`). */
  readonly masterGain: number;
  readonly voice: Pcm;
  readonly music: Option.Option<Pcm>;
  readonly beds: Option.Option<Pcm>;
  readonly effects: Option.Option<Pcm>;
}

/** A silent stereo bus `frames` long. */
const bus = (frames: number): Array<Float32Array> =>
  Array.from({ length: 2 }, () => new Float32Array(frames));

/** A bus as PCM. */
const pcm = (frames: number, channels: ReadonlyArray<Float32Array>): Pcm => ({
  rate: MIX_RATE,
  frames,
  channels,
});

/** `sound` resampled up or down by `semitones` (linear interpolation): higher is shorter. */
export const repitch = (sound: Pcm, semitones: number): Pcm => {
  if (semitones === 0) return sound;
  const ratio = 2 ** (semitones / 12);
  const frames = Math.max(1, Math.floor(sound.frames / ratio));
  return {
    rate: sound.rate,
    frames,
    channels: sound.channels.map((plane) => {
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) {
        const at = i * ratio;
        const j = Math.floor(at);
        const t = at - j;
        out[i] = (plane[j] ?? 0) * (1 - t) + (plane[j + 1] ?? 0) * t;
      }
      return out;
    }),
  };
};

/**
 * `sound` looped to fill `frames`: each repeat crosses into the next over
 * `cross` frames (equal power), so the wrap is not heard as a cut.
 */
export const loopFill = (
  sound: ReadonlyArray<Float32Array>,
  length: number,
  frames: number,
  cross: number,
): Array<Float32Array> => {
  const out = bus(frames);
  const x = Math.max(0, Math.min(cross, Math.floor(length / 4)));
  const step = Math.max(1, length - x);
  for (let start = 0, k = 0; start < frames; start += step, k++) {
    const last = start + length >= frames;
    for (let i = 0; i < length && start + i < frames; i++) {
      let w = 1;
      if (k > 0 && i < x) w = Math.sin(((i / x) * Math.PI) / 2);
      if (!last && i >= length - x) w *= Math.cos((((i - (length - x)) / x) * Math.PI) / 2);
      for (const [c, plane] of out.entries()) {
        const from = sound[c] ?? sound[0];
        plane[start + i] = (plane[start + i] ?? 0) + (from?.[i] ?? 0) * w;
      }
    }
  }
  return out;
};

/** The beds, ducked or not, on one stereo bus. */
const renderBeds = (
  beds: ReadonlyArray<BedSpan<Pcm>>,
  voice: ReadonlyArray<Float32Array>,
  frames: number,
): Array<Float32Array> => {
  const ducked = bus(frames);
  const under = bus(frames);
  const at = (secs: number) => toFrames(secs, MIX_RATE);
  for (const bed of beds) {
    const from = at(bed.from);
    const span = Math.max(0, Math.min(frames, at(bed.to)) - from);
    const sound = toStereo(bed.sound);
    const filled = loopFill(sound.channels, sound.frames, span, at(BED_CROSSFADE));
    const ends = Math.min(at(bed.fade), Math.floor(span / 2));
    if (ends > 0) {
      fade(filled, { type: 'in', start: 0, frames: ends });
      fade(filled, { type: 'out', start: span - ends, frames: ends });
    }
    let target = under;
    if (bed.duck) target = ducked;
    addInto(target, filled, from, bed.gain);
  }
  duck(ducked, voice, MIX_RATE, BED_DUCK);
  addInto(ducked, under, 0, 1);
  return ducked;
};

/** The gain, in dB, that brings `track` to `MASTER.loudness` without taking its peak past `LIMIT`; 0 for silence. */
const masteringGain = (track: Pcm): number => {
  const { integrated, peak } = loudness(track);
  if (!Number.isFinite(integrated) || !Number.isFinite(peak)) return 0;
  const headroom = 20 * Math.log10(LIMIT.limit) - peak;
  return Math.min(MASTER.loudness - integrated, headroom);
};

/**
 * Play `plan` out over decoded audio, every sound at `MIX_RATE`: the takes
 * summed on the voice bus; the score under the voice and alone in its pauses,
 * each levelled against the voice, then faded in and out; the beds looped over
 * their spans; the effects at their gains and pitches; all summed and limited.
 */
export const renderMix = (plan: MixPlan<Pcm>): Mixed => {
  const frames = toFrames(plan.seconds, MIX_RATE);
  const at = (secs: number) => toFrames(secs, MIX_RATE);

  const voice = bus(frames);
  for (const take of plan.voice) {
    let lift = 1;
    if (take.staged) lift = 10 ** (takeLift(take.sound) / 20);
    addInto(voice, toStereo(take.sound).channels, at(take.at), take.gain * lift);
  }

  const music = Option.map(plan.score, (score) => {
    const out = bus(frames);
    addInto(out, toStereo(score.sound).channels, 0, 1);
    const speaking = pcm(frames, voice);
    const weights = aloneWeights(aloneSpans(speechSpans(speaking), plan.seconds), MIX_RATE, frames);
    const gains = scoreGains(pcm(frames, out), speaking, weights, score);
    applyScore(out, weights, gains);
    fade(out, { type: 'in', start: 0, frames: at(MUSIC_FADE_IN) });
    fade(out, {
      type: 'out',
      start: at(Math.max(0, plan.seconds - MUSIC_FADE_OUT)),
      frames: at(MUSIC_FADE_OUT),
    });
    return out;
  });

  const beds = Option.map(
    Option.liftPredicate(plan.beds, (list) => list.length > 0),
    (list) => renderBeds(list, voice, frames),
  );

  const effects = Option.map(
    Option.liftPredicate(plan.effects, (list) => list.length > 0),
    (list) => {
      const out = bus(frames);
      for (const fx of list)
        addInto(out, toStereo(repitch(fx.sound, fx.pitch)).channels, at(fx.at), fx.gain);
      return out;
    },
  );

  const sum = bus(frames);
  for (const channels of [
    voice,
    ...Option.toArray(music),
    ...Option.toArray(beds),
    ...Option.toArray(effects),
  ])
    addInto(sum, channels, 0, 1);

  const masterGain = masteringGain(pcm(frames, sum));
  const mastered = bus(frames);
  addInto(mastered, sum, 0, 10 ** (masterGain / 20));

  return {
    master: pcm(frames, limit(mastered, MIX_RATE, LIMIT)),
    masterGain,
    voice: pcm(frames, voice),
    music: Option.map(music, (channels) => pcm(frames, channels)),
    beds: Option.map(beds, (channels) => pcm(frames, channels)),
    effects: Option.map(effects, (channels) => pcm(frames, channels)),
  };
};
