import { describe, expect, test } from 'bun:test';
import { accusedRig } from './accused-rig.ts';
import { figuresRml } from './figures.ts';
import { handRig, judgeRig } from './judge-rig.ts';
import { type K, LIGHT, type Pt, creaseOf, figure, reachAbout } from './parts.ts';
import { type Element, ids } from './rml.ts';

/** Every element under `roots`, depth first. */
const walk = (roots: ReadonlyArray<Element>): Element[] =>
  roots.flatMap((e) => [e, ...walk(e.children)]);

const named = (roots: ReadonlyArray<Element>, name: string) =>
  walk(roots).filter((e) => e.attrs.some(([k, v]) => k === 'name' && v === name));

const attr = (e: Element | undefined, key: string) => e?.attrs.find(([k]) => k === key)?.[1];

/** The three rigs' artboards (their view models aside), from one id counter as `figures.ts` makes them. */
const rigs = () => {
  const next = ids();
  return {
    accused: accusedRig(figure(next, 'Accused', 1888, 0)).slice(0, 1),
    judge: judgeRig(figure(next, 'Judge', 1889, 400)).slice(0, 1),
    hand: handRig(figure(next, 'Hand', 1890, 840)).slice(0, 1),
  };
};

describe('the figure parts', () => {
  test('the project file has no thumbs and no mittens', () => {
    expect(figuresRml()).not.toMatch(/thumb|mitten/i);
  });

  test('the project file is the same text every time, and every id in it is its own', () => {
    const rml = figuresRml();
    expect(figuresRml()).toBe(rml);
    const defined = [...rml.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(defined).size).toBe(defined.length);
  });

  test('every hand is the same part: a plain circle of twelve points, creased and outlined alike', () => {
    const { accused, hand } = rigs();
    const palms = [
      ...named(accused, 'nearPalm'),
      ...named(accused, 'farPalm'),
      ...named(hand, 'palm'),
    ];
    expect(palms).toHaveLength(3);
    const shapeOf = (palm: Element) => ({
      points: walk([palm]).filter((e) => e.name === 'CubicMirroredVertex').length,
      paints: palm.children.filter((e) => e.name !== 'PointsPath').map((e) => attr(e, 'name')),
    });
    for (const palm of palms)
      expect(shapeOf(palm)).toEqual({ points: 12, paints: ['Shadow', 'Paper', 'Ink'] });
  });

  test('the accused and the judge wear the same face kit, the judge at his own scale', () => {
    const { accused, judge } = rigs();
    const parts = ['face', 'features', 'brows', 'eyeL', 'eyeR', 'mouthLine', 'mouthOh', 'faceRest'];
    for (const part of parts) {
      expect([part, named(accused, part).length, named(judge, part).length]).toEqual([part, 1, 1]);
    }
    expect(attr(named(judge, 'face')[0], 'scaleX')).toBeGreaterThan(1);
  });

  test('an outline crawls: no point moves more than a fifth of its wander a tick, round the loop too', () => {
    const fig = figure(ids(), 'Test', 7, 0);
    fig.boil('piece', [[3, 4]], 1);
    const { x = [], y = [] } = fig.boilTracks()['piece.0'] ?? {};
    expect(x).toHaveLength(48);
    const step = (keys: ReadonlyArray<K>) =>
      Math.max(...keys.map(([, v], i) => Math.abs((keys[(i + 1) % keys.length]?.[1] ?? v) - v)));
    expect(step(x)).toBeLessThanOrEqual(0.21);
    expect(step(y)).toBeLessThanOrEqual(0.21);
    for (const [, v] of x) expect(Math.abs(v - 3)).toBeLessThanOrEqual(1);
  });

  test('the crease runs along the one light, from the upper left', () => {
    const { start, end, at } = creaseOf({ x0: -10, y0: -20, x1: 30, y1: 40 });
    expect(Math.atan2(end[1] - start[1], end[0] - start[0])).toBeCloseTo(LIGHT.toward);
    expect(start[0]).toBeLessThan(end[0]);
    expect(start[1]).toBeLessThan(end[1]);
    expect(at).toBe(LIGHT.crease);
  });
});

describe('reachAbout', () => {
  const shoulder: Pt = [0, 0];
  const rest: Pt = [0, 100];
  const to: Pt = [100, 0];

  test('starts at rest and ends on what it reaches for', () => {
    for (const [reach, at] of [
      [0, rest],
      [1, to],
    ] as const) {
      const [x, y] = reachAbout(shoulder, rest, to, reach);
      expect(x).toBeCloseTo(at[0]);
      expect(y).toBeCloseTo(at[1]);
    }
  });

  test('travels round the shoulder, bowed away from the straight line between', () => {
    const [x, y] = reachAbout(shoulder, rest, to, 0.5);
    expect(Math.hypot(x, y)).toBeCloseTo(100);
    // The chord's midpoint is (50, 50), about 70.7 from the shoulder.
    expect(Math.hypot(x, y)).toBeGreaterThan(Math.hypot(50, 50));
  });

  test('holds its reach to 0..1', () => {
    expect(reachAbout(shoulder, rest, to, -1)).toEqual(reachAbout(shoulder, rest, to, 0));
    expect(reachAbout(shoulder, rest, to, 2)).toEqual(reachAbout(shoulder, rest, to, 1));
  });
});
