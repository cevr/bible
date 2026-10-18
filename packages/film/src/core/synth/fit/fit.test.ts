import { describe, expect, test } from 'bun:test';
import { Predicate, Result, Schema } from 'effect';
import type { SoundUse } from '../../sfx.ts';
import { CodeSound, type Node } from '../graph/nodes.ts';
import { renderCode } from '../graph/render.ts';
import { MAX_CODE_WORK, SYNTH_RATE } from '../graph/units.ts';
import { loopSeam } from '../seam.ts';
import { fitSound } from './fit.ts';
import { type EarshotModel, EarshotModelJson, type Modal } from './model.ts';

const fitted = (model: EarshotModel, options: Partial<Parameters<typeof fitSound>[2]> = {}) =>
  Result.getOrThrow(
    fitSound('probe', model, { size: 'full', use: 'one-shot', rumble: 1, ...options }),
  );

/** A sound as the library reads it: written as JSON, decoded back. */
const CodeSoundJson = Schema.fromJsonString(CodeSound);

const render = (sound: CodeSound, seed = 1) =>
  renderCode(
    {
      name: 'probe',
      sound,
      key: { tonic: 'C', scale: 'major' },
      samples: new Map(),
      hash: 'probe',
    },
    seed,
  ).channels[0] ?? new Float32Array();

/** The mean square of `plane` from `from` to `to` seconds, in dB. */
const powerDb = (plane: Float32Array, from: number, to: number) => {
  let sum = 0;
  const a = Math.round(from * SYNTH_RATE);
  const b = Math.round(to * SYNTH_RATE);
  for (let i = a; i < b; i++) sum += (plane[i] ?? 0) ** 2;
  return 10 * Math.log10(sum / (b - a));
};

/** Every node under `node`, itself first. */
const nodesOf = (node: Node): ReadonlyArray<Node> => {
  switch (node._tag) {
    case 'Layer':
      return [node, ...node.of.flatMap((child) => nodesOf(child.node))];
    case 'Sequence':
      return [node, ...node.of.flatMap(nodesOf)];
    case 'Gain':
    case 'Envelope':
    case 'Fade':
    case 'Drive':
    case 'Crush':
    case 'Filter':
    case 'Loop':
    case 'Resample':
    case 'Delay':
    case 'Reverb':
    case 'Repeat':
      return [node, ...nodesOf(node.of)];
    default:
      return [node];
  }
};

const partialsOf = (node: Node) =>
  nodesOf(node).flatMap((n) => {
    if (n._tag !== 'Partials' || Predicate.isString(n.set)) return [];
    return n.set;
  });

/** A modal model: `strikes` over one band of noise from 1 to 2 kHz at `noiseDb` from 0 to `noiseTo` seconds. */
const modal = (
  strikes: ReadonlyArray<{
    t: number;
    modes: ReadonlyArray<readonly [number, number, number, number]>;
  }>,
  {
    secs = 1,
    noiseDb = -150,
    noiseTo = 0.5,
    extra = {},
  }: {
    readonly secs?: number;
    readonly noiseDb?: number;
    readonly noiseTo?: number;
    readonly extra?: Partial<Modal>;
  } = {},
): Modal => ({
  kind: 'modal',
  length_s: secs,
  strikes: strikes.map((s) => ({ ...s, ramp_ms: 0 })),
  noise: {
    edges: [1000, 2000],
    env: [
      [[0, -150]],
      [
        [0, noiseDb],
        [noiseTo, noiseDb],
        [noiseTo + 0.001, -150],
      ],
      [[0, -150]],
    ],
  },
  ...extra,
});

describe('a fit, from an earshot model', () => {
  test('writes a sound the library decodes as code', () => {
    const made = fitted(modal([{ t: 0.1, modes: [[440, 0.3, 0.5, 0.2]] }], { noiseDb: -30 }));
    const written = Result.getOrThrow(Schema.encodeResult(CodeSoundJson)(made.sound));
    expect(Schema.decodeResult(CodeSoundJson)(written)._tag).toBe('Success');
  });

  test('a struck mode keeps its phase: a cosine starts at its peak', () => {
    const made = fitted(modal([{ t: 0, modes: [[441, 0.5, 0.5, 0]] }]));
    expect(partialsOf(made.sound.play)).toEqual([{ ratio: 1, level: 1, decay: 0.5, phase: 0.25 }]);
    const plane = render(made.sound);
    expect(plane[0]).toBeCloseTo(Math.max(...plane.slice(0, 200)), 4);
  });

  test('a negative amplitude is the same mode half a turn on', () => {
    const made = fitted(modal([{ t: 0, modes: [[441, 0.5, -0.5, 0]] }]));
    expect(partialsOf(made.sound.play)).toEqual([{ ratio: 1, level: 1, decay: 0.5, phase: 0.75 }]);
  });

  test('small merges a strike’s overlapping modes by their sum, so opposite phases leave the difference', () => {
    const made = fitted(
      modal([
        {
          t: 0,
          modes: [
            [440, 0.5, 0.5, 0],
            [440.2, 0.5, 0.3, Math.PI],
            [1500, 0.2, 0.1, 0],
          ],
        },
      ]),
      { size: 'small' },
    );
    const set = partialsOf(made.sound.play);
    expect(set).toHaveLength(2);
    // The 440 Hz pair sums to 0.2 at phase 0; the 1500 Hz mode stands at 0.1, half the pair's.
    expect(set.map((m) => m.level).sort()).toEqual([0.5, 1]);
    expect(set.find((m) => m.level === 1)?.phase).toBeCloseTo(0.25, 4);
  });

  test('a band of noise is levelled to the power earshot wrote, against a mode at its own', () => {
    // −30 dB of noise until 0.5 s; then a sine of amplitude 0.0447 (−30 dB of power) from 0.6 s.
    const a = Math.sqrt(2 * 10 ** (-30 / 10));
    const made = fitted(
      modal([{ t: 0.6, modes: [[440, 100, a, 0]] }], { noiseDb: -30, noiseTo: 0.5 }),
    );
    const plane = render(made.sound);
    expect(Math.abs(powerDb(plane, 0.05, 0.45) - powerDb(plane, 0.65, 0.95))).toBeLessThan(0.5);
  });

  test('a bed is looped and tilted so its seam is unheard', () => {
    // A level rising 8 dB over the sound would jump at every loop.
    const made = fitted(
      {
        kind: 'spectral_noise',
        dur: 12,
        bands: { n: 4, f_lo: 100, f_hi: 8000 },
        env: {
          t: [0, 12],
          db: [
            [-60, -60, -60, -60],
            [-52, -52, -52, -52],
          ],
        },
      },
      { use: 'bed' satisfies SoundUse },
    );
    expect(made.sound.play._tag).toBe('Loop');
    expect(
      loopSeam({
        rate: SYNTH_RATE,
        frames: render(made.sound).length,
        channels: [render(made.sound)],
      }).db,
    ).toBeLessThan(1);
  });

  test('a source with little rumble is high-passed under 30 Hz; one with its own is not', () => {
    const json = modal([{ t: 0, modes: [[440, 0.5, 0.5, 0]] }]);
    const highpasses = (rumble: number) =>
      nodesOf(fitted(json, { rumble }).sound.play).filter(
        (n) => n._tag === 'Filter' && n.type === 'highpass' && n.hz === 30,
      ).length;
    expect(highpasses(0.001)).toBe(2);
    expect(highpasses(0.2)).toBe(0);
  });

  test('a fit over the work a render may do merges its bands and keeps fewer modes until it fits', () => {
    // 60 s of 400 long modes over 28 bands: every one kept would write far past the budget.
    const modes = Array.from({ length: 400 }, (_, i) => [60 + i * 37, 30, 0.01, 0] as const);
    const edges = Array.from({ length: 27 }, (_, i) => 40 * 1.3 ** i);
    const made = fitted({
      kind: 'modal',
      length_s: 60,
      strikes: [{ t: 0, ramp_ms: 0, modes }],
      noise: {
        edges,
        env: Array.from({ length: 28 }, () => [
          [0, -40],
          [60, -40],
        ]),
      },
    });
    expect(made.work).toBeLessThanOrEqual(MAX_CODE_WORK);
    expect(made.merged).toBeDefined();
    expect(made.modes).toBeLessThan(400);
  });

  test('a model longer than a code sound may be is refused, by its length', () => {
    const made = fitSound('long', modal([], { secs: 200 }), {
      size: 'small',
      use: 'bed',
      rumble: 1,
    });
    expect(Result.isFailure(made) && made.failure.measure).toBe('length');
  });

  test('a sines track is a sine at its own phase, risen and released', () => {
    const made = fitted({
      kind: 'sines',
      duration: 0.5,
      partials: [
        {
          t0: 0.1,
          t1: 0.3,
          rel: 0.05,
          rise: 0.01,
          ph: 0,
          freq: [[0.1, 880]],
          amp: [[0.1, -20]],
        },
      ],
      transients: [],
      residual: { bands: [1000], times: [0], db: [[-150]] },
    });
    const oscs = nodesOf(made.sound.play).filter((n) => n._tag === 'Osc');
    expect(oscs).toEqual([{ _tag: 'Osc', wave: 'sine', pitch: 880, secs: 0.25, phase: 0.25 }]);
    const plane = render(made.sound);
    expect(powerDb(plane, 0, 0.09)).toBeLessThan(-100);
    expect(powerDb(plane, 0.15, 0.25)).toBeGreaterThan(-10);
  });

  test('names what it leaves out: a sub wave, a stereo side, an attack clamp', () => {
    const json = modal([{ t: 0, modes: [[440, 0.5, 0.5, 0]] }], {
      extra: { channels: 2, sub: { wave: [0.1] }, post: { eq_db: [], pre: { t_on: 0 } } },
    });
    expect(fitted(json).left).toEqual([
      'its sub wave under 20 Hz',
      'its stereo side',
      'the attack clamp of its post stage',
    ]);
    expect(fitted(modal([{ t: 0, modes: [[440, 0.5, 0.5, 0]] }])).left).toEqual([]);
  });

  test('a model of a kind it cannot read is refused at the boundary', () => {
    const decoded = Schema.decodeResult(EarshotModelJson)('{"kind":"hybrid","dur":1}');
    expect(decoded._tag).toBe('Failure');
  });
});
