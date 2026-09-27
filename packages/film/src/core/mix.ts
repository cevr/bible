// A film's sound on one track. `mixPlan` is the whole decision, pure: which
// take, score and effect play, where and how loud, with the warnings a stale
// or missing asset earns. `renderMix` plays a plan out once each file in it is
// decoded: the voice bus, the score ducked under the voice, the effects on
// their cues, summed and limited. Remixing never calls a paid API.

import { Option, Record as Rec, Result } from 'effect';
import { type Pcm, toStereo } from './audio.ts';
import { type Duck, type Limit, addInto, duck, fade, limit, toFrames } from './dsp.ts';
import type { ActTooShort, CueInvalid, UnknownCue, UnknownMark, UnknownScene } from './errors.ts';
import type { Placed } from './layout.ts';
import type { Sound, SoundManifest } from './schema.ts';
import { cueTime, effectKey, filmEnd, musicKey, musicPlan } from './sound.ts';

/** Every mix runs at this rate; the takes, score and effects are generated at it. */
export const MIX_RATE = 44100;

/** How far the bed sits under the voice: gentle ratio, slow release so it breathes back. */
export const DUCK: Duck = { threshold: 0.02, ratio: 3, attack: 80, release: 1000, knee: 4 };

/** The ceiling the summed track may not pass. */
export const LIMIT: Limit = { limit: 0.95, attack: 5, release: 50 };

/** The score fades in over its first `MUSIC_FADE_IN` seconds and out over the film's last `MUSIC_FADE_OUT`. */
export const MUSIC_FADE_IN = 2;
export const MUSIC_FADE_OUT = 6;

/** One sound on a bus: where it starts (seconds into the film) and how loud. */
export interface Placement<A> {
  readonly sound: A;
  readonly at: number;
  readonly gain: number;
}

/** The score: one sound under the whole film, from its start. */
export interface Bed<A> {
  readonly sound: A;
  readonly gain: number;
}

/** What plays where. `A` is how a sound is named: a file path, then its decoded audio. */
export interface MixPlan<A> {
  /** The track's length: the film's. */
  readonly seconds: number;
  /** Each recorded take. */
  readonly voice: ReadonlyArray<Placement<A>>;
  /** The score, or none. */
  readonly music: Option.Option<Bed<A>>;
  /** Each effect on each of its cues. */
  readonly effects: ReadonlyArray<Placement<A>>;
  /** Stale or missing assets; the mix still plays what it has. */
  readonly warnings: ReadonlyArray<string>;
}

export interface MixInput {
  readonly placed: ReadonlyArray<Placed>;
  readonly sound: Option.Option<Sound>;
  readonly manifest: SoundManifest;
  /** Directory of the voice takes. */
  readonly narration: string;
  /** Directory of the generated music and effects. */
  readonly soundDir: string;
}

export type MixPlanError = UnknownScene | UnknownCue | UnknownMark | CueInvalid | ActTooShort;

/** What plays where, by file. Pure. */
export const mixPlan = (input: MixInput): Result.Result<MixPlan<string>, MixPlanError> =>
  Result.gen(function* () {
    const { placed, manifest } = input;
    const warnings: Array<string> = [];

    const voice = placed.flatMap((p) =>
      Option.match(
        Option.filter(Option.fromNullishOr(p.voice.file), () => p.voice.recorded),
        {
          onNone: () => [],
          onSome: (file) => [
            { sound: `${input.narration}/${file}`, at: p.start + p.speechStart, gain: 1 },
          ],
        },
      ),
    );

    // A stale score still plays, with a warning.
    let music = Option.none<Bed<string>>();
    const score = Option.flatMap(input.sound, (s) => Option.fromNullishOr(s.music));
    const made = Option.fromNullishOr(manifest.music);
    if (Option.isSome(score) && Option.isSome(made)) {
      const plan = yield* musicPlan(score.value, placed);
      if (made.value.hash !== musicKey(score.value, plan))
        warnings.push(
          'mix.stale asset=music hint="acts or timing changed; run score to regenerate"',
        );
      music = Option.some({
        sound: `${input.soundDir}/${made.value.file}`,
        gain: score.value.gain,
      });
    }

    const effects: Array<Placement<string>> = [];
    const declared = Option.match(input.sound, { onNone: () => ({}), onSome: (s) => s.effects });
    for (const [id, fx] of Object.entries(declared)) {
      const asset = Rec.get(manifest.effects, id);
      if (Option.isNone(asset)) {
        warnings.push(`mix.missing effect=${id} hint="run score to generate it"`);
        continue;
      }
      if (asset.value.hash !== effectKey(fx)) warnings.push(`mix.stale effect=${id}`);
      const gain = Option.getOrElse(Option.fromNullishOr(fx.gain), () => 1);
      for (const cue of fx.at)
        effects.push({
          sound: `${input.soundDir}/${asset.value.file}`,
          at: yield* cueTime(cue, placed),
          gain,
        });
    }

    return { seconds: filmEnd(placed), voice, music, effects, warnings };
  });

/** The track, and each bus alone (for balancing by measurement): all `MIX_RATE`, stereo, the film's length. */
export interface Mixed {
  readonly master: Pcm;
  readonly voice: Pcm;
  readonly music: Option.Option<Pcm>;
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

/**
 * Play `plan` out over decoded audio, every sound at `MIX_RATE`: the takes
 * summed on the voice bus; the score at its gain, faded, ducked under the
 * voice; the effects at their gains; the three summed and limited.
 */
export const renderMix = (plan: MixPlan<Pcm>): Mixed => {
  const frames = toFrames(plan.seconds, MIX_RATE);
  const at = (secs: number) => toFrames(secs, MIX_RATE);

  const voice = bus(frames);
  for (const take of plan.voice)
    addInto(voice, toStereo(take.sound).channels, at(take.at), take.gain);

  const music = Option.map(plan.music, (bed) => {
    const out = bus(frames);
    addInto(out, toStereo(bed.sound).channels, 0, bed.gain);
    fade(out, { type: 'in', start: 0, frames: at(MUSIC_FADE_IN) });
    fade(out, {
      type: 'out',
      start: at(Math.max(0, plan.seconds - MUSIC_FADE_OUT)),
      frames: at(MUSIC_FADE_OUT),
    });
    duck(out, voice, MIX_RATE, DUCK);
    return out;
  });

  const effects = Option.map(
    Option.liftPredicate(plan.effects, (list) => list.length > 0),
    (list) => {
      const out = bus(frames);
      for (const fx of list) addInto(out, toStereo(fx.sound).channels, at(fx.at), fx.gain);
      return out;
    },
  );

  const sum = bus(frames);
  for (const channels of [voice, ...Option.toArray(music), ...Option.toArray(effects)])
    addInto(sum, channels, 0, 1);

  return {
    master: pcm(frames, limit(sum, MIX_RATE, LIMIT)),
    voice: pcm(frames, voice),
    music: Option.map(music, (channels) => pcm(frames, channels)),
    effects: Option.map(effects, (channels) => pcm(frames, channels)),
  };
};
