import { describe, expect, test } from 'bun:test';
import { Option } from 'effect';
import { layout } from './layout.ts';
import type { Sound, Timed, Timings } from './schema.ts';
import { timelineTicks } from './ticks.ts';

const noTakes: Timings = { voice: '', scenes: {} };

const scenes: ReadonlyArray<Timed> = [
  { id: 'open', min: 8 },
  {
    id: 'stamp',
    say: 'It is {fiction}no fiction',
    min: 6,
    timeline: { slam: { mark: 'fiction', offset: 0.5, dur: 0.4 } },
  },
];
const placed = layout(scenes, noTakes);
const [, stamp] = placed;

const sound: Sound = {
  music: {
    model: 'music_v2',
    styles: [],
    avoid: [],
    gain: 0.5,
    acts: [
      { from: 'stamp', name: 'Opening', styles: [] },
      { from: 'stamp', name: 'Turn', styles: [] },
      { from: 'nowhere', name: 'Lost', styles: [] },
    ],
  },
  effects: {
    thud: {
      sound: 'hit.thud',
      at: [
        { scene: 'stamp', cue: 'slam', edge: 'end' },
        { scene: 'stamp', cue: 'missing' },
      ],
    },
  },
};

describe('timelineTicks', () => {
  const ticks = timelineTicks(placed, Option.some(sound));
  const start = stamp?.start ?? Number.NaN;
  const speech = stamp?.speechStart ?? Number.NaN;
  const fiction = start + speech + (stamp?.voice.marks.get('fiction') ?? Number.NaN);

  test('marks and cue spans sit at film time', () => {
    expect(ticks.filter((t) => t.kind === 'mark')).toEqual([
      { kind: 'mark', name: 'stamp {fiction}', at: fiction, dur: 0 },
    ]);
    const [slam] = ticks.filter((t) => t.kind === 'cue');
    expect(slam?.name).toBe('stamp cue slam');
    expect(slam?.at).toBeCloseTo(fiction + 0.5);
    expect(slam?.dur).toBeCloseTo(0.4);
  });

  test('an effect lands where its cue does; one that does not resolve is left off', () => {
    const effects = ticks.filter((t) => t.kind === 'effect');
    expect(effects.map((t) => t.name)).toEqual(['thud · stamp']);
    expect(effects[0]?.at).toBeCloseTo(fiction + 0.9);
  });

  test('the first act opens the film; later acts start at their scene', () => {
    expect(ticks.filter((t) => t.kind === 'act').map((t) => [t.name, t.at])).toEqual([
      ['act Opening', 0],
      ['act Turn', start],
    ]);
  });

  test('a film without sound has only marks and cues', () => {
    expect(new Set(timelineTicks(placed, Option.none()).map((t) => t.kind))).toEqual(
      new Set(['mark', 'cue']),
    );
  });
});
