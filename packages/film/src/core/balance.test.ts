import { describe, expect, test } from 'bun:test';
import type { Pcm } from './audio.ts';
import { BALANCE, hotEffects, voiceLevel } from './balance.ts';
import type { Placement } from './mix.ts';

const RATE = 44100;

/** `secs` of a 220 Hz tone at `db` dBFS RMS, on both sides (a voice bus plays mono at −3 dB a side). */
const tone = (secs: number, db: number, sides = 2): Pcm => {
  const frames = Math.round(secs * RATE);
  // The tone's power splits evenly over its sides.
  const amp = 10 ** (db / 20) * Math.SQRT2 * Math.sqrt(1 / sides);
  const plane = new Float32Array(frames);
  for (let i = 0; i < frames; i++) plane[i] = amp * Math.sin((2 * Math.PI * 220 * i) / RATE);
  return { rate: RATE, frames, channels: Array.from({ length: sides }, () => plane) };
};

/** A bus `secs` long with `sound` laid in from `from` seconds. */
const bus = (secs: number, sound: Pcm, from: number): Pcm => {
  const frames = Math.round(secs * RATE);
  const at = Math.round(from * RATE);
  const channels = sound.channels.map((plane) => {
    const out = new Float32Array(frames);
    out.set(plane.subarray(0, Math.max(0, frames - at)), at);
    return out;
  });
  return { rate: RATE, frames, channels };
};

/** A mono effect: `quiet` dB for its length with one 50 ms burst at `burst` dB in the middle. */
const effect = (secs: number, quiet: number, burst: number): Pcm => {
  const base = tone(secs, quiet, 1);
  const loud = tone(0.05, burst, 1);
  const plane = new Float32Array(base.channels[0] ?? []);
  plane.set(loud.channels[0] ?? [], Math.round((secs / 2) * RATE));
  return { rate: RATE, frames: base.frames, channels: [plane] };
};

const place = (name: string, sound: Pcm, at: number, gain = 1): Placement<Pcm> => ({
  name,
  sound,
  at,
  gain,
  pitch: 0,
});

describe('voiceLevel', () => {
  test('the voice bus reads as the take it plays: both sides’ power summed, its 70th percentile', () => {
    expect(voiceLevel(bus(10, tone(6, -17), 2))).toBeCloseTo(-17, 1);
  });

  test('silence between the lines is left out', () => {
    expect(voiceLevel(bus(60, tone(3, -20), 1))).toBeCloseTo(-20, 1);
  });
});

describe('hotEffects', () => {
  const voice = bus(12, tone(8, -20), 2);

  test('a 50 ms burst over the voice is hot, though the effect is quiet over its length', () => {
    const hot = hotEffects(voice, [place('cloth', effect(1, -45, -14), 4)]);
    expect(hot).toHaveLength(1);
    expect(hot[0]?.name).toBe('cloth');
    expect(hot[0]?.over).toBeCloseTo(6, 0);
  });

  test('an effect well under the voice is not hot; its gain counts', () => {
    expect(hotEffects(voice, [place('soft', effect(1, -45, -30), 4)])).toEqual([]);
    expect(hotEffects(voice, [place('turned', effect(1, -45, -14), 4, 0.25)])).toEqual([]);
  });

  test(`an effect within ${BALANCE.hot} dB under the voice is hot`, () => {
    expect(hotEffects(voice, [place('near', effect(1, -45, -21.5), 4)])).toHaveLength(1);
  });

  test('where no one speaks nearby, an effect is not held to the voice', () => {
    expect(hotEffects(voice, [place('alone', effect(0.5, -45, -6), 11)])).toEqual([]);
  });
});
