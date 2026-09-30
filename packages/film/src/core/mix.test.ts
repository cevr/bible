import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { type Pcm, slice } from './audio.ts';
import { layout } from './layout.ts';
import { loudness } from './synth/loudness.ts';
import {
  BED_DUCK,
  LIMIT,
  MASTER,
  MIX_RATE,
  type MixPlan,
  loopFill,
  mixKey,
  mixPlan,
  renderMix,
  repitch,
} from './mix.ts';
import { TAKE_LEVEL } from './recording.ts';
import type { Music, Score, Sound, SoundManifest, Timed } from './schema.ts';
import { musicKey, musicPlan } from './sound.ts';
import {
  type Lock,
  NO_SOUNDS,
  type SoundSource,
  type Sounds,
  VOICE_LEVEL,
  type Variant,
  defineLibrary,
  fileSource,
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
  score: Option.none(),
  beds: [],
  effects: [],
  warnings: [],
  ...over,
});

/** `secs` of a mono sine at `hz`, peaking at `amp` (loudness weighting ignores a constant). */
const tone = (secs: number, amp: number, hz: number): Pcm => {
  const frames = Math.round(secs * RATE);
  const plane = new Float32Array(frames);
  for (let i = 0; i < frames; i++) plane[i] = amp * Math.sin((2 * Math.PI * hz * i) / RATE);
  return { rate: RATE, frames, channels: [plane] };
};

/** A bus's left channel at `secs`. */
const at = (bus: Pcm, secs: number) => bus.channels[0]?.[Math.round(secs * RATE)];

/** Mono at 0.5, spread to a side: −3 dB. */
const SIDE = Math.fround(0.5 * Math.SQRT1_2);

const take = (sound: Pcm, secs: number) => ({
  name: 'take',
  sound,
  at: secs,
  gain: 1,
  pitch: 0,
  staged: false,
});

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

  test('a staging take plays at the speech level by one clean gain; a person’s take as it is', () => {
    const quiet = mono(1, 0.05);
    const lift = 10 ** ((TAKE_LEVEL.speech - 20 * Math.log10(0.05)) / 20);
    const staged = renderMix(plan({ voice: [{ ...take(quiet, 2), staged: true }] }));
    const read = renderMix(plan({ voice: [{ ...take(quiet, 2), staged: false }] }));
    expect(at(staged.voice, 2.5)).toBeCloseTo(0.05 * Math.SQRT1_2 * lift, 5);
    expect(at(read.voice, 2.5)).toBeCloseTo(0.05 * Math.SQRT1_2, 6);
  });

  test('a staging take is never lifted past the ceiling', () => {
    // A take that peaks at 0.5 with quiet speech around it: the peak holds the lift back.
    const spiky = mono(1, 0.02);
    spiky.channels[0]?.fill(0.5, 100, 110);
    const staged = renderMix(plan({ voice: [{ ...take(spiky, 0), staged: true }] }));
    const peak = Math.max(...(staged.voice.channels[0] ?? []).map(Math.abs));
    expect(20 * Math.log10(peak / Math.SQRT1_2)).toBeCloseTo(TAKE_LEVEL.ceiling, 3);
  });

  test('the master is the buses summed at the mastering gain, one limiter window behind', () => {
    const mixed = renderMix(plan({ voice: [take(mono(1, 0.5), 2)] }));
    const late = Math.trunc(RATE * 0.005) - 1;
    const gain = 10 ** (mixed.masterGain / 20);
    expect(mixed.master.channels[0]?.[2 * RATE + late]).toBeCloseTo(SIDE * gain, 6);
    expect(mixed.master.channels[0]?.[2 * RATE + late - 1]).toBe(0);
  });

  describe('mastering', () => {
    // A 1 kHz tone reads close to its RMS in LUFS, so each is a known loudness.
    test('a quiet track is brought up to the target loudness', () => {
      const mixed = renderMix(plan({ voice: [take(tone(8, 0.02, 1000), 1)] }));
      expect(loudness(mixed.master).integrated).toBeCloseTo(MASTER.loudness, 0);
      expect(mixed.masterGain).toBeGreaterThan(0);
    });

    test('a loud track is brought down to it', () => {
      const mixed = renderMix(plan({ voice: [take(tone(8, 0.5, 1000), 1)] }));
      expect(loudness(mixed.master).integrated).toBeCloseTo(MASTER.loudness, 0);
      expect(mixed.masterGain).toBeLessThan(0);
    });

    test('a lift never takes a peak past the limiter: headroom caps it', () => {
      // Quiet overall, with one peak near full scale: the peak holds the lift back.
      const quiet = tone(8, 0.01, 1000);
      quiet.channels[0]?.fill(0.8, RATE, RATE + 20);
      const mixed = renderMix(plan({ voice: [take(quiet, 1)] }));
      const peak = Math.max(...(mixed.master.channels[0] ?? []).map(Math.abs));
      expect(peak).toBeLessThanOrEqual(LIMIT.limit + 1e-6);
      expect(loudness(mixed.master).integrated).toBeLessThan(MASTER.loudness - 3);
      expect(mixed.masterGain).toBeCloseTo(20 * Math.log10(LIMIT.limit / (0.8 * Math.SQRT1_2)), 3);
    });

    test('silence stays silence', () => {
      expect(renderMix(plan({})).masterGain).toBe(0);
    });
  });

  test('the score fades in over its first two seconds and out over the film’s last six', () => {
    // No voice: nothing to level against, so the score plays as it is.
    const score = { option: 'piano', sound: mono(10, 0.5), under: -18, alone: -6 };
    const music = Option.getOrThrow(renderMix(plan({ score: Option.some(score) })).music);
    expect(at(music, 0)).toBe(0);
    expect(at(music, 1)).toBeCloseTo(SIDE / 2, 6);
    expect(at(music, 3)).toBeCloseTo(SIDE, 6);
    expect(at(music, 7)).toBeCloseTo(SIDE / 2, 6);
  });

  describe('the score against the voice', () => {
    const seconds = 20;
    const score = { option: 'piano', sound: tone(seconds, 0.3, 500), under: -18, alone: -6 };
    /** `bus`'s loudness from `from` to `to` seconds. */
    const lufs = (bus: Pcm, from: number, to: number) =>
      loudness(slice(bus, Math.round(from * RATE), Math.round((to - from) * RATE))).integrated;

    test('under the voice while it speaks, alone once it has rested', () => {
      const voice = [take(tone(4, 0.3, 1000), 0)];
      const mixed = renderMix(plan({ seconds, voice, score: Option.some(score) }));
      const music = Option.getOrThrow(mixed.music);
      const spoken = loudness(mixed.voice).integrated;
      expect(lufs(music, 2, 3.8) - spoken).toBeCloseTo(-18, 0);
      expect(lufs(music, 6, 13) - spoken).toBeCloseTo(-6, 0);
    });

    test('a short pause stays under; a long one rises and settles back before the voice', () => {
      const voice = [take(tone(4, 0.3, 1000), 0), take(tone(4, 0.3, 1000), 5.5)];
      const mixed = renderMix(plan({ seconds, voice, score: Option.some(score) }));
      const music = Option.getOrThrow(mixed.music);
      expect(lufs(music, 4.2, 5.3)).toBeCloseTo(lufs(music, 2, 3.8), 1);
      const late = [take(tone(4, 0.3, 1000), 0), take(tone(4, 0.3, 1000), 10)];
      const rested = Option.getOrThrow(
        renderMix(plan({ seconds, voice: late, score: Option.some(score) })).music,
      );
      expect(lufs(rested, 6, 8) - lufs(rested, 2, 3.8)).toBeCloseTo(12, 0);
      // Down again a quarter of a second before the voice speaks.
      expect(lufs(rested, 10, 12)).toBeCloseTo(lufs(rested, 2, 3.8), 0);
    });
  });

  test('effects play on their own bus, each at its cue and gain', () => {
    const tick = mono(0.1, 0.5);
    const mixed = renderMix(
      plan({
        effects: [
          { name: 'tick', sound: tick, at: 1, gain: 1, pitch: 0 },
          { name: 'tick', sound: tick, at: 4, gain: 0.5, pitch: 0 },
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
  const placed = Result.getOrThrow(layout([{ id: 'a', min: 8 }], { voice: '', scenes: {} }));
  const option = (styles: ReadonlyArray<string>): Music => ({
    model: 'music_v2',
    styles,
    avoid: [],
    movements: [{ from: 'a', name: 'Open', styles: [] }],
  });
  const score: Score = {
    play: 'piano',
    under: -18,
    alone: -6,
    options: { piano: option(['felt piano']), pads: option(['ambient pads']) },
  };
  const input = {
    film: 'f',
    placed,
    manifest: {},
    sounds: NO_SOUNDS,
    narration: 'n',
    soundDir: 's',
    play: Option.none<string>(),
  };
  const keyOf = (music: Music) => musicKey(music, Result.getOrThrow(musicPlan(music, placed)));
  const manifest: SoundManifest = {
    scores: {
      piano: { hash: keyOf(option(['felt piano'])), file: 'piano-1.mp3', sha256: 'a' },
      pads: { hash: 'old', file: 'pads-0.mp3', sha256: 'b' },
    },
  };
  const scored = Option.some<Sound>({ score, effects: {} });

  test('a declared score with no asset plays no music, and says which option', () => {
    const planned = Result.getOrThrow(mixPlan({ ...input, sound: scored }));
    expect(Option.isNone(planned.score)).toBe(true);
    expect(planned.warnings).toEqual([
      'mix.missing asset=score.piano hint="run score to compose it, or score pull"',
    ]);
  });

  test('the score plays the option it names, at its levels against the voice', () => {
    const planned = Result.getOrThrow(mixPlan({ ...input, manifest, sound: scored }));
    expect(
      Option.map(planned.score, (s) => [s.option, sourceLabel(s.sound), s.under, s.alone]),
    ).toEqual(Option.some(['piano', 's/piano-1.mp3', -18, -6]));
    expect(planned.warnings).toEqual([]);
  });

  test('another option plays when asked for by name, stale or not; a name it lacks fails', () => {
    const pads = Result.getOrThrow(
      mixPlan({ ...input, manifest, sound: scored, play: Option.some('pads') }),
    );
    expect(Option.map(pads.score, (s) => sourceLabel(s.sound))).toEqual(
      Option.some('s/pads-0.mp3'),
    );
    expect(pads.warnings).toEqual([
      'mix.stale asset=score.pads why=Retimed hint="movements or timing changed; run score to compose it again"',
    ]);
    const lost = mixPlan({ ...input, manifest, sound: scored, play: Option.some('organ') });
    expect(Result.match(lost, { onSuccess: () => 'none', onFailure: (e) => e._tag })).toBe(
      'ScoreUnknown',
    );
  });

  test('an option whose movements no longer hold still plays, with a warning naming why', () => {
    const lost: Score = {
      ...score,
      options: {
        piano: {
          ...option(['felt piano']),
          movements: [{ from: 'gone', name: 'Open', styles: [] }],
        },
      },
    };
    const planned = Result.getOrThrow(
      mixPlan({ ...input, manifest, sound: Option.some<Sound>({ score: lost, effects: {} }) }),
    );
    expect(Option.map(planned.score, (s) => sourceLabel(s.sound))).toEqual(
      Option.some('s/piano-1.mp3'),
    );
    expect(planned.warnings).toEqual([
      'mix.stale asset=score.piano why=UnknownScene hint="movements or timing changed; run score to compose it again"',
    ]);
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
          tap: { at: 'start', offset: 1, dur: 0.5 },
          knock: { at: 'start', offset: 3, dur: 0.5 },
        },
      },
      { id: 'b', min: 8 },
    ];
    const film = Result.getOrThrow(layout(scenes, { voice: '', scenes: {} }));
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
        {
          sound: 'room.paper',
          from: { scene: 'a', at: 'start' },
          to: { scene: 'b', at: 'start', offset: 8 },
        },
        {
          sound: 'amb.court',
          level: -30,
          from: { scene: 'a', cue: 'tap' },
          to: { scene: 'b', at: 'start' },
          fade: 0.5,
        },
      ],
      effects: {
        tap: {
          sound: 'paper.tap',
          level: -8,
          at: [
            { scene: 'a', cue: 'tap' },
            { scene: 'b', at: 'start' },
          ],
        },
        knock: { sound: 'wood.knock', at: [{ scene: 'a', cue: 'knock' }] },
        lit: {
          sound: 'tone.chime',
          at: [
            { scene: 'a', at: 'start' },
            { scene: 'a', at: 'start', offset: 2 },
          ],
        },
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
      const wrong: Sound = {
        effects: { x: { sound: 'amb.court', at: [{ scene: 'a', at: 'start' }] } },
      };
      const typo: Sound = {
        effects: { x: { sound: 'paper.tapp', at: [{ scene: 'a', at: 'start' }] } },
      };
      const failed = (s: Sound) =>
        Result.match(mixPlan({ ...input, placed: film, sound: Option.some(s), sounds }), {
          onSuccess: () => 'none',
          onFailure: (e) => e._tag,
        });
      expect([failed(wrong), failed(typo)]).toEqual(['SoundUseMismatch', 'UnknownSound']);
    });
  });
});

describe('mixKey', () => {
  const planned: MixPlan<SoundSource> = {
    seconds: 30,
    voice: [
      {
        name: 'a',
        sound: fileSource('/box/narration/a.1f33612e28ca.flac'),
        at: 1,
        gain: 1,
        pitch: 0,
        staged: false,
      },
    ],
    score: Option.some({
      option: 'piano',
      sound: fileSource('/box/sound/piano-ad3d886a.mp3'),
      under: -18,
      alone: -6,
    }),
    beds: [],
    effects: [
      {
        name: 'stamp',
        sound: fileSource('/box/sounds/files/wood.gavel/4e8f0c5d585f.flac'),
        at: 4,
        gain: 0.5,
        pitch: 0.2,
      },
    ],
    warnings: [],
  };

  test('the same plan keys the same, in any checkout: a file is keyed by its name, which carries its hash', () => {
    const elsewhere: MixPlan<SoundSource> = {
      ...planned,
      voice: planned.voice.map((t) => ({
        ...t,
        sound: fileSource('/other/checkout/narration/a.1f33612e28ca.flac'),
      })),
      warnings: ['mix.stale sound=x'],
    };
    expect(mixKey(elsewhere)).toBe(mixKey(planned));
  });

  test('another score option, a new take, or an effect moved or louder is another plan', () => {
    const keys = [
      mixKey(planned),
      mixKey({
        ...planned,
        score: Option.map(planned.score, (s) => ({
          ...s,
          option: 'ensemble',
          sound: fileSource('/box/sound/ensemble-9ae0005a.mp3'),
        })),
      }),
      mixKey({
        ...planned,
        voice: planned.voice.map((t) => ({
          ...t,
          sound: fileSource('/box/narration/a.0000aaaa1111.flac'),
        })),
      }),
      mixKey({ ...planned, effects: planned.effects.map((e) => ({ ...e, at: 4.5 })) }),
      mixKey({ ...planned, effects: planned.effects.map((e) => ({ ...e, gain: 0.6 })) }),
      mixKey({ ...planned, score: Option.none() }),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });
});
