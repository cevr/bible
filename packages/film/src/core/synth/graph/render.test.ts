import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Result, Schema } from 'effect';
import { GOLDEN, PROBES, type Probe } from './fixtures/golden.ts';
import { dbToGain } from './math.ts';
import { CodeSound, type Key, type Node, type Signal } from './nodes.ts';
import { pitchHz } from './pitch.ts';
import { type Kit, ROOT, type ResolvedSound, planNode } from './plan.ts';
import { RENDER_VERSION, renderCode } from './render.ts';
import { SYNTH_RATE, framesOf } from './units.ts';

const C_MAJOR: Key = { tonic: 'C', scale: 'major' };

/** A sound resolved by hand: the probes name their samples, so no library walk is needed. */
const resolvedOf = (
  name: string,
  sound: CodeSound,
  samples: Readonly<Record<string, CodeSound>> = {},
): ResolvedSound => ({
  name,
  sound,
  key: sound.key ?? C_MAJOR,
  samples: new Map(Object.entries(samples).map(([n, s]) => [n, resolvedOf(n, s)])),
  hash: name,
});

const sha256Hex = (data: string | Uint8Array): string =>
  createHash('sha256').update(data).digest('hex');

const digest = (plane: Float32Array): string =>
  sha256Hex(new Uint8Array(plane.buffer, plane.byteOffset, plane.byteLength));

const renderProbe = (probe: Probe, seed = probe.seed ?? 1): Float32Array => {
  const pcm = renderCode(resolvedOf(probe.name, probe.sound, probe.samples), seed);
  expect(pcm.rate).toBe(SYNTH_RATE);
  expect(pcm.channels.length).toBe(1);
  return pcm.channels[0] ?? new Float32Array(0);
};

const BY_NAME = new Map(PROBES.map((p) => [p.name, p]));

const probe = (name: string): Probe => BY_NAME.get(name)!;

/** Buffers that are never shared, for a plan read without its peak. */
const KIT: Kit = {
  take: (frames) => new Float32Array(frames),
  give: () => undefined,
  takeWide: (frames) => new Float64Array(frames),
  giveWide: () => undefined,
  sample: () => new Float32Array(0),
};

/** `node` planned and filled at `seed`, before the render's peak. */
const planned = (node: Node, seed = 1): Float32Array => {
  const sound = resolvedOf('plan', { play: node });
  const plan = planNode(node, ROOT, { seed, sound, kit: KIT });
  const out = new Float32Array(plan.frames);
  plan.fill(out);
  return out;
};

const white = (secs: number, stream?: string): Node =>
  stream === undefined
    ? { _tag: 'Noise', color: 'white', secs }
    : { _tag: 'Noise', color: 'white', secs, stream };

const sine = (secs: number): Node => ({ _tag: 'Osc', wave: 'sine', pitch: 'A4', secs, phase: 0 });

describe('the golden renders', () => {
  test('every probe decodes as a code sound, as written', () => {
    const decode = Schema.decodeUnknownSync(CodeSound);
    for (const p of PROBES) {
      expect(decode(p.sound)).toEqual(p.sound);
      for (const sampled of Object.values(p.samples ?? {}))
        expect(decode(sampled)).toEqual(sampled);
    }
  });

  test('each probe is pinned, and each pin is a probe’s', () => {
    expect([...GOLDEN.keys()].toSorted()).toEqual(PROBES.map((p) => p.name).toSorted());
  });

  test('the renderer’s version is the digest of the pins', () => {
    const lines = [...GOLDEN]
      .map(([name, pin]) => `${name}=${pin}\n`)
      .toSorted()
      .join('');
    expect(RENDER_VERSION).toBe(sha256Hex(lines).slice(0, 8));
  });

  for (const p of PROBES) {
    test(`${p.name}: two renders byte for byte, as pinned`, () => {
      const once = digest(renderProbe(p));
      expect(digest(renderProbe(p))).toBe(once);
      expect(once).toBe(GOLDEN.get(p.name) ?? 'unpinned');
    });
  }

  test('a pick by seed plays the variant’s own choice, around again past the last', () => {
    expect(GOLDEN.get('pick.seed.4')).toBe(GOLDEN.get('pick.seed.1') ?? 'unpinned');
    expect(GOLDEN.get('pick.seed.2')).not.toBe(GOLDEN.get('pick.seed.1') ?? 'unpinned');
  });

  test('a sample with a seed of its own is the same in every variant; one drawn is not', () => {
    const seeded = probe('sample.seeded');
    const drawn = probe('sample.drawn');
    expect(digest(renderProbe(seeded, 2))).toBe(digest(renderProbe(seeded, 1)));
    expect(digest(renderProbe(drawn, 2))).not.toBe(digest(renderProbe(drawn, 1)));
  });

  test('a render peaks at −1 dBFS; silence stays silent', () => {
    const loud = renderProbe(probe('noise.white'));
    expect(Math.max(...loud.map(Math.abs))).toBe(Math.fround(dbToGain(-1)));
    const silent = renderProbe(probe('silence'));
    expect(silent.length).toBe(framesOf(0.05));
    expect(silent.every((x) => x === 0)).toBe(true);
  });
});

describe('the draws', () => {
  test('a named stream keeps its draws when a node is put before it; a path does not', () => {
    const alone = planned({ _tag: 'Sequence', of: [white(0.05, 'grain')] });
    const after = planned({ _tag: 'Sequence', of: [sine(0.03), white(0.05, 'grain')] });
    const unnamed = planned({ _tag: 'Sequence', of: [sine(0.03), white(0.05)] });
    expect(after.subarray(framesOf(0.03))).toEqual(alone);
    expect(unnamed.subarray(framesOf(0.03))).not.toEqual(alone);
  });

  test('a layer of its own length cuts each child there, and makes none that starts past it', () => {
    const whole = planned({
      _tag: 'Layer',
      of: [{ node: sine(0.1) }, { node: white(0.05), at: 0.03, db: -12 }],
    });
    const cut = planned({
      _tag: 'Layer',
      secs: 0.06,
      of: [
        { node: sine(0.1) },
        { node: white(0.05), at: 0.03, db: -12 },
        { node: white(0.05), at: 0.08 },
      ],
    });
    expect(cut.length).toBe(framesOf(0.06));
    expect(cut).toEqual(whole.subarray(0, framesOf(0.06)));
  });

  test('a longer noise keeps its first samples', () => {
    for (const color of ['white', 'pink', 'brown'] as const) {
      const short = planned({ _tag: 'Noise', color, secs: 0.05 });
      const long = planned({ _tag: 'Noise', color, secs: 0.1 });
      expect(long.subarray(0, short.length)).toEqual(short);
    }
  });

  test('a thousand repetitions each land on their own time, rounded once', () => {
    // One frame at the top of a sine: a 1 at each onset.
    const impulse: Node = {
      _tag: 'Osc',
      wave: 'sine',
      pitch: 'A4',
      secs: 1 / SYNTH_RATE,
      phase: 0.25,
    };
    const every = 0.0123;
    const out = planned({
      _tag: 'Repeat',
      timing: { _tag: 'Count', every, count: 1000 },
      of: impulse,
    });
    const onsets = Array.from(out).flatMap((x, i) => (x === 1 ? [i] : []));
    const times = Array.from({ length: 1000 }, (_, k) => Math.round(k * every * SYNTH_RATE));
    expect(onsets).toEqual(times);
    // A frame step rounded once and added up would end 430 frames early.
    expect(out.length - 1).toBe(Math.round(999 * every * SYNTH_RATE));
    expect(out.length - 1 - 999 * Math.round(every * SYNTH_RATE)).toBe(430);
  });
});

describe('the units', () => {
  test('a note by name, on A4 = 440 Hz', () => {
    expect(pitchHz('A4', C_MAJOR)).toBe(440);
    expect(pitchHz('A5', C_MAJOR)).toBe(880);
    expect(pitchHz('C4', C_MAJOR)).toBeCloseTo(261.6256, 4);
    expect(pitchHz('F#3', C_MAJOR)).toBeCloseTo(184.9972, 4);
    expect(pitchHz('Bb2', C_MAJOR)).toBeCloseTo(116.5409, 4);
    expect(pitchHz(123.4, C_MAJOR)).toBe(123.4);
  });

  test("a note's whole octave is read: E10 is ten octaves over E0, never E0", () => {
    expect(pitchHz('E10', C_MAJOR) / pitchHz('E0', C_MAJOR)).toBeCloseTo(1024, 6);
    expect(pitchHz('B8', C_MAJOR)).toBeCloseTo(7902.1328, 4);
  });

  test('the schema takes a note of octaves 0 to 8, and refuses one past them by its name', () => {
    const decode = Schema.decodeUnknownResult(CodeSound);
    const note = (pitch: string) => ({
      play: { _tag: 'Osc', wave: 'sine', pitch, secs: 0.1, phase: 0 },
    });
    expect(decode(note('C0'))._tag).toBe('Success');
    expect(decode(note('B8'))._tag).toBe('Success');
    for (const name of ['C9', 'D9', 'E10', 'H4']) {
      const refused = decode(note(name));
      expect(Result.isFailure(refused) ? refused.failure.message : '').toContain(
        `"${name}" is no note name of octaves 0 to 8`,
      );
    }
  });

  test('a degree counts in its key from the tonic, an octave on past the scale', () => {
    expect(pitchHz({ degree: 0, octave: 4 }, C_MAJOR)).toBeCloseTo(261.6256, 4);
    expect(pitchHz({ degree: 7, octave: 4 }, C_MAJOR)).toBeCloseTo(523.2511, 4);
    expect(pitchHz({ degree: -1, octave: 4 }, C_MAJOR)).toBeCloseTo(246.9417, 4);
    const g = { tonic: 'G', scale: 'majorPentatonic' } as const;
    expect(pitchHz({ degree: 2, octave: 4 }, g)).toBeCloseTo(493.8833, 4);
    expect(pitchHz({ degree: 5, octave: 4 }, g)).toBeCloseTo(783.9909, 4);
    expect(pitchHz({ degree: 1, octave: 3 }, { tonic: 'Eb', scale: 'minor' })).toBeCloseTo(
      174.6141,
      4,
    );
  });

  test('the schema refuses a curve or a range it cannot draw', () => {
    const decode = Schema.decodeUnknownResult(CodeSound);
    const gain = (db: Signal<number>) => ({ play: { _tag: 'Gain', db, of: white(0.05) } });
    expect(decode(gain({ _tag: 'Ramp', from: -40, to: 0, curve: 'exponential' }))._tag).toBe(
      'Failure',
    );
    expect(decode(gain({ _tag: 'Ramp', from: -40, to: 0, curve: 'linear' }))._tag).toBe('Success');
    const envelope = {
      _tag: 'Envelope',
      points: [
        [0, 0],
        [0.05, 1],
      ],
      curve: 'exponential',
      of: white(0.05),
    };
    expect(decode({ play: envelope })._tag).toBe('Success');
    const secs = (min: number) => ({
      play: { _tag: 'Noise', color: 'white', secs: { _tag: 'Vary', min, max: 1, curve: 'log' } },
    });
    expect(decode(secs(0))._tag).toBe('Failure');
    expect(decode(secs(0.1))._tag).toBe('Success');
    expect(
      decode({
        play: {
          _tag: 'Repeat',
          timing: { _tag: 'Count', every: 0.001, count: 2 },
          of: white(0.01),
        },
      })._tag,
    ).toBe('Failure');
  });
});
