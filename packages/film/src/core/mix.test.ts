import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import type { Pcm } from './audio.ts';
import { layout } from './layout.ts';
import { BED_DUCK, MIX_RATE, type MixPlan, loopFill, mixPlan, renderMix, repitch } from './mix.ts';
import type { Music, Sound, Timed } from './schema.ts';
import {
  type Lock,
  NO_SOUNDS,
  type Sounds,
  VOICE_LEVEL,
  type Variant,
  defineLibrary,
  requestKey,
  sourceLabel,
} from './sfx.ts';

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
  beds: [],
  effects: [],
  warnings: [],
  ...over,
});

/** A bus's left channel at `secs`. */
const at = (bus: Pcm, secs: number) => bus.channels[0]?.[Math.round(secs * RATE)];

/** Mono at 0.5, spread to a side: −3 dB. */
const SIDE = Math.fround(0.5 * Math.SQRT1_2);

const take = (sound: Pcm, secs: number) => ({ sound, at: secs, gain: 1, pitch: 0 });

describe('renderMix', () => {
  test('a take lands on its frame, on both sides at −3 dB; the track is the film’s length', () => {
    const mixed = renderMix(plan({ voice: [take(mono(1, 0.5), 2)] }));
    expect(mixed.master.frames).toBe(10 * RATE);
    expect(mixed.voice.channels[0]?.[2 * RATE - 1]).toBe(0);
    expect(at(mixed.voice, 2)).toBe(SIDE);
    expect(at(mixed.voice, 3)).toBe(0);
    expect(mixed.voice.channels[1]).toEqual(mixed.voice.channels[0]);
    expect([mixed.music, mixed.beds, mixed.effects].map((bus) => Option.isNone(bus))).toEqual([
      true,
      true,
      true,
    ]);
  });

  test('the master is the buses summed, one limiter window behind', () => {
    const mixed = renderMix(plan({ voice: [take(mono(1, 0.5), 2)] }));
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
    const voice = [take(mono(10, 0.5), 0)];
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
          { sound: tick, at: 1, gain: 1, pitch: 0 },
          { sound: tick, at: 4, gain: 0.5, pitch: 0 },
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

  test('a pitched effect is resampled: an octave up plays in half the time', () => {
    expect(repitch(mono(1, 0.5), 12).frames).toBe(RATE / 2);
    expect(repitch(mono(1, 0.5), -12).frames).toBe(RATE * 2);
    expect(repitch(mono(1, 0.5), 0).frames).toBe(RATE);
  });

  test('a bed loops over its span, faded at each end, on its own bus', () => {
    const bed = { sound: mono(2, 0.5), from: 1, to: 9, gain: 1, fade: 1, duck: false };
    const beds = Option.getOrThrow(renderMix(plan({ beds: [bed] })).beds);
    expect(at(beds, 0.5)).toBe(0);
    expect(at(beds, 1.5)).toBeCloseTo(SIDE / 2, 4);
    // Across each wrap the equal-power crossfade never drops a constant sound below −3 dB.
    for (const t of [3, 4.6, 5.2, 6.5, 7.5]) expect(at(beds, t)).toBeGreaterThan(SIDE * 0.7);
    expect(at(beds, 8.5)).toBeCloseTo(SIDE / 2, 4);
    expect(at(beds, 9.5)).toBe(0);
  });

  test('a bed ducks under the voice unless it sits under everything', () => {
    const voice = [take(mono(10, 0.5), 0)];
    const bed = { sound: mono(10, 0.5), from: 0, to: 10, gain: 0.5, fade: 0, duck: true };
    const ducked = Option.getOrThrow(renderMix(plan({ voice, beds: [bed] })).beds);
    const room = Option.getOrThrow(
      renderMix(plan({ voice, beds: [{ ...bed, duck: false }] })).beds,
    );
    expect(at(room, 5)).toBeCloseTo(SIDE * 0.5, 6);
    const ratio = (at(ducked, 5) ?? 0) / (at(room, 5) ?? 1);
    expect(ratio).toBeCloseTo((0.02 / SIDE) ** (1 - 1 / BED_DUCK.ratio), 2);
  });

  test('a loop shorter than its span repeats without a gap', () => {
    const filled = loopFill([new Float32Array(1000).fill(1)], 1000, 5000, 100);
    expect(Math.min(...(filled[0] ?? []))).toBeGreaterThan(0.7);
  });
});

describe('mixPlan', () => {
  const placed = layout([{ id: 'a', min: 8 }], { voice: '', scenes: {} });
  const score: Music = {
    model: 'music_v2',
    styles: [],
    avoid: [],
    acts: [{ from: 'a', name: 'Open', styles: [] }],
    gain: 0.5,
  };
  const input = {
    film: 'f',
    placed,
    manifest: {},
    sounds: NO_SOUNDS,
    narration: 'n',
    soundDir: 's',
  };

  test('a declared score with no asset plays no music, and says so', () => {
    const planned = Result.getOrThrow(
      mixPlan({ ...input, sound: Option.some({ music: score, effects: {} }) }),
    );
    expect(Option.isNone(planned.music)).toBe(true);
    expect(planned.warnings).toEqual(['mix.missing asset=music hint="run score to generate it"']);
  });

  test('no score declared, no warning', () => {
    const planned = Result.getOrThrow(mixPlan({ ...input, sound: Option.some({ effects: {} }) }));
    expect(planned.warnings).toEqual([]);
  });

  describe('library sounds', () => {
    const scenes: ReadonlyArray<Timed> = [
      {
        id: 'a',
        min: 8,
        timeline: {
          tap: { scene: 'start', offset: 1, dur: 0.5 },
          knock: { scene: 'start', offset: 3, dur: 0.5 },
        },
      },
      { id: 'b', min: 8 },
    ];
    const film = layout(scenes, { voice: '', scenes: {} });
    const library = defineLibrary({
      'paper.tap': { kind: 'generated', prompt: 'a tap', secs: 1, use: 'one-shot' },
      'wood.knock': { kind: 'generated', prompt: 'a knock', secs: 1, use: 'one-shot', level: -4 },
      'amb.court': { kind: 'generated', prompt: 'a court', secs: 20, loop: true, use: 'bed' },
      'tone.chime': {
        kind: 'procedural',
        recipe: { recipe: 'bell', root: 'D5', partials: 'glass', secs: 1 },
        variants: 3,
        use: 'one-shot',
      },
      'room.paper': {
        kind: 'procedural',
        recipe: { recipe: 'room', secs: 4 },
        variants: 1,
        use: 'bed',
        level: -36,
        duck: false,
      },
    });
    const variant = (
      name: 'paper.tap' | 'amb.court',
      n: number,
      momentaryMax: number,
    ): Variant => ({
      request: requestKey(library[name]),
      file: `files/${name}/${n}.flac`,
      sha256: `${n}`,
      made: '2026-09-29T00:00:00Z',
      model: 'eleven_text_to_sound_v2',
      format: 'pcm_44100',
      secs: 1,
      loudness: { integrated: momentaryMax - 4, momentaryMax, peak: -1 },
      licence: 'elevenlabs-paid-sfx',
      credits: 40,
    });
    const lock: Lock = {
      'paper.tap': {
        variants: [variant('paper.tap', 1, -20), variant('paper.tap', 2, -26)],
        candidates: [],
        rejected: [],
      },
      'amb.court': { variants: [variant('amb.court', 1, -30)], candidates: [], rejected: [] },
    };
    const sounds: Sounds = { library, lock, dir: '/lib' };
    const sound: Sound = {
      beds: [
        { sound: 'room.paper', from: { scene: 'a' }, to: { scene: 'b', offset: 8 } },
        {
          sound: 'amb.court',
          level: -30,
          from: { scene: 'a', cue: 'tap' },
          to: { scene: 'b' },
          fade: 0.5,
        },
      ],
      effects: {
        tap: { sound: 'paper.tap', level: -8, at: [{ scene: 'a', cue: 'tap' }, { scene: 'b' }] },
        knock: { sound: 'wood.knock', at: [{ scene: 'a', cue: 'knock' }] },
        lit: { sound: 'tone.chime', at: [{ scene: 'a' }, { scene: 'a', offset: 2 }] },
      },
    };
    const planned = () =>
      Result.getOrThrow(mixPlan({ ...input, placed: film, sound: Option.some(sound), sounds }));

    test('an unmade sound is left out, and said', () => {
      expect(planned().warnings).toEqual([
        'mix.missing sound=wood.knock hint="run sfx make wood.knock, then sfx keep"',
      ]);
    });

    test('each placement plays another variant, levelled by what it measured against the voice', () => {
      const taps = planned().effects.filter((e) =>
        sourceLabel(e.sound).startsWith('/lib/files/paper.tap'),
      );
      expect(taps).toHaveLength(2);
      expect(new Set(taps.map((t) => sourceLabel(t.sound))).size).toBe(2);
      for (const tap of taps) {
        let measured = -26;
        if (sourceLabel(tap.sound).endsWith('/1.flac')) measured = -20;
        // −8 under the voice, within the default jitter's ±1 dB.
        const heard = measured + 20 * Math.log10(tap.gain);
        expect(Math.abs(heard - (VOICE_LEVEL - 8))).toBeLessThanOrEqual(1 + 1e-9);
        expect(Math.abs(tap.pitch)).toBeLessThanOrEqual(0.5);
      }
    });

    test('a procedural one-shot plays its seeds, unjittered', () => {
      const chimes = planned().effects.filter((e) => e.sound._tag === 'Synth');
      expect(chimes.map((c) => [c.pitch, c.at])).toEqual([
        [0, 0],
        [0, 2],
      ]);
      expect(new Set(chimes.map((c) => sourceLabel(c.sound))).size).toBe(2);
    });

    test('beds span their cues, levelled by integrated loudness; room tone does not duck', () => {
      const [room, court] = planned().beds;
      expect(room).toMatchObject({ from: 0, to: 16, fade: 1, duck: false });
      expect(court).toMatchObject({ from: 1, to: 8, fade: 0.5, duck: true });
      expect(20 * Math.log10(court?.gain ?? 0)).toBeCloseTo(VOICE_LEVEL - 30 + 34, 6);
    });

    test('a sound placed for the other use fails, and so does a name the library lacks', () => {
      const wrong: Sound = { effects: { x: { sound: 'amb.court', at: [{ scene: 'a' }] } } };
      const typo: Sound = { effects: { x: { sound: 'paper.tapp', at: [{ scene: 'a' }] } } };
      const failed = (s: Sound) =>
        Result.match(mixPlan({ ...input, placed: film, sound: Option.some(s), sounds }), {
          onSuccess: () => 'none',
          onFailure: (e) => e._tag,
        });
      expect([failed(wrong), failed(typo)]).toEqual(['SoundUseMismatch', 'UnknownSound']);
    });
  });
});
