import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import type { Pcm } from './audio.ts';
import { MIX_RATE, type MixPlan, renderMix } from './mix.ts';

const RATE = MIX_RATE;

/** `secs` of mono `value`. */
const mono = (secs: number, value: number): Pcm => {
  const frames = Math.round(secs * RATE);
  return { rate: RATE, frames, channels: [new Float32Array(frames).fill(value)] };
};

const plan = (over: Partial<MixPlan<Pcm>>): MixPlan<Pcm> => ({
  seconds: 10,
  voice: [],
  music: Option.none(),
  effects: [],
  warnings: [],
  ...over,
});

/** A bus's left channel at `secs`. */
const at = (bus: Pcm, secs: number) => bus.channels[0]?.[Math.round(secs * RATE)];

/** Mono at 0.5, spread to a side: −3 dB. */
const SIDE = Math.fround(0.5 * Math.SQRT1_2);

describe('renderMix', () => {
  test('a take lands on its frame, on both sides at −3 dB; the track is the film’s length', () => {
    const mixed = renderMix(plan({ voice: [{ sound: mono(1, 0.5), at: 2, gain: 1 }] }));
    expect(mixed.master.frames).toBe(10 * RATE);
    expect(mixed.voice.channels[0]?.[2 * RATE - 1]).toBe(0);
    expect(at(mixed.voice, 2)).toBe(SIDE);
    expect(at(mixed.voice, 3)).toBe(0);
    expect(mixed.voice.channels[1]).toEqual(mixed.voice.channels[0]);
    expect([Option.isNone(mixed.music), Option.isNone(mixed.effects)]).toEqual([true, true]);
  });

  test('the master is the buses summed, one limiter window behind', () => {
    const mixed = renderMix(plan({ voice: [{ sound: mono(1, 0.5), at: 2, gain: 1 }] }));
    const late = Math.trunc(RATE * 0.005) - 1;
    expect(mixed.master.channels[0]?.[2 * RATE + late]).toBe(SIDE);
    expect(mixed.master.channels[0]?.[2 * RATE + late - 1]).toBe(0);
  });

  test('the score fades in over its first two seconds and out over the film’s last six', () => {
    const mixed = renderMix(plan({ music: Option.some({ sound: mono(10, 0.5), gain: 0.5 }) }));
    const music = Option.getOrThrow(mixed.music);
    const whole = SIDE * 0.5;
    expect(at(music, 0)).toBe(0);
    expect(at(music, 1)).toBeCloseTo(whole / 2, 6);
    expect(at(music, 3)).toBeCloseTo(whole, 6);
    expect(at(music, 7)).toBeCloseTo(whole / 2, 6);
  });

  test('the score ducks under the voice', () => {
    const score = { sound: mono(10, 0.5), gain: 0.5 };
    const voice = [{ sound: mono(10, 0.5), at: 0, gain: 1 }];
    const alone = Option.getOrThrow(renderMix(plan({ music: Option.some(score) })).music);
    const under = Option.getOrThrow(renderMix(plan({ music: Option.some(score), voice })).music);
    // The key sits 20·log(SIDE / 0.02) dB over the threshold; at 3:1 two thirds of that comes off.
    expect((at(under, 3) ?? 0) / (at(alone, 3) ?? 1)).toBeCloseTo((0.02 / SIDE) ** (2 / 3), 3);
  });

  test('effects play on their own bus, each at its cue and gain', () => {
    const tick = mono(0.1, 0.5);
    const mixed = renderMix(
      plan({
        effects: [
          { sound: tick, at: 1, gain: 1 },
          { sound: tick, at: 4, gain: 0.5 },
        ],
      }),
    );
    const effects = Option.getOrThrow(mixed.effects);
    expect([at(effects, 1), at(effects, 4), at(effects, 2)]).toEqual([
      SIDE,
      Math.fround(SIDE * 0.5),
      0,
    ]);
  });
});
