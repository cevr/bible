// The judge's hand and what the outline axis lays, under every option: the
// hand's casts in every pose, each palm one circle, each line the axis names.
// `direction-options.test.ts` tells the whole property.

import { describe, expect, test } from 'bun:test';
import { GAVEL_REST } from '../../../righteousness-by-faith/court.ts';
import { C } from '../../../righteousness-by-faith/kit.ts';
import type { Props } from '../cutpaper/court.ts';
import { HAND as ACCUSED_HAND } from './accused-rig.ts';
import { K1, propsOf } from './direction.ts';
import { figureRigs } from './figures.ts';
import { HAND_ART } from './judge-rig.ts';
import { riveJudge } from './judge.ts';
import { INK, type Pt } from './parts.ts';
import type { Element } from './rml.ts';
import {
  CASES,
  SHADED,
  A0,
  attr,
  num,
  walk,
  named,
  paintNamed,
  drawnOf,
  isPaper,
  shown,
} from './test/direction-rigs.ts';
import {
  laidBy,
  SWINGS,
  LEANS,
  handCasts,
  blackMiddleStop,
  castHolds,
  castFaults,
} from './test/direction-host.ts';

describe('the judge’s hand', () => {
  test('a cast shaded with black part way across fails: every stop of its feather is read', () => {
    expect(castFaults(handCasts(A0, 0, GAVEL_REST))).toEqual([]);
    expect(castFaults(handCasts(A0, 0, GAVEL_REST, blackMiddleStop)).length).toBeGreaterThan(0);
  });

  test('its cast is the shade of each surface it falls on, in every option and pose, past its ink', () => {
    const casts = SHADED.flatMap(([name, d]) =>
      LEANS.flatMap((lean) =>
        SWINGS.flatMap((swing) =>
          handCasts(d, lean, swing).map((c) => ({
            ...c,
            at: `${name} lean ${lean} swing ${swing}`,
          })),
        ),
      ),
    );
    expect(casts.length).toBeGreaterThan(0);
    const wrong = new Map(
      casts
        .filter((c) => !castHolds(c))
        .map((c) => [
          `${c.at} on the ${c.on}`,
          `${[...new Set(c.laid)].map(shown).join(', ')}, derives ${shown(c.want)}`,
        ]),
    );
    expect(Object.fromEntries(wrong)).toEqual({});
  });
});

// ─── the hand, and what the outline axis lays ─────────────────────────────────

/** A circle's handle length for `n` points round radius `r`: what makes each cubic arc a circle's. */
const circleHandle = (r: number, n: number) => (4 / 3) * Math.tan(Math.PI / (2 * n)) * r;

describe.each(CASES)('hands and lines under %s', (_, d) => {
  const rigs = figureRigs(d);
  const accused = rigs.accused[0] as Element;
  const judge = rigs.judge[0] as Element;
  const hand = rigs.hand[0] as Element;

  test('each hand node holds one shape, the palm: one closed path, a circle by its points and its handles', () => {
    for (const [node, r] of [
      [named([accused], 'nearHand')[0], ACCUSED_HAND.r],
      [named([accused], 'farHand')[0], ACCUSED_HAND.r],
      [named([hand], 'hand')[0], HAND_ART.r],
    ] as const) {
      const all = walk(node ? [node] : []).filter((e) => e.name === 'Shape');
      const shapes = all.filter((e) => !String(attr(e, 'name')).includes('Cast'));
      expect([attr(node, 'name'), shapes.length]).toEqual([attr(node, 'name'), 1]);
      // Anything else in the node is the palm's cast shadow: its outline again, with only a shadow.
      const palm = String(attr(shapes[0], 'name'));
      const outline = (s: Element | undefined) =>
        walk(s ? [s] : [])
          .filter((v) => v.name === 'CubicMirroredVertex')
          .map((v) => [
            num(v, 'x', 0),
            num(v, 'y', 0),
            num(v, 'rotation', 0),
            num(v, 'distance', 0),
          ]);
      for (const cast of all.filter((e) => String(attr(e, 'name')).includes('Cast'))) {
        const name = String(attr(cast, 'name'));
        expect([name, name.startsWith(`${palm}Cast`)]).toEqual([name, true]);
        expect([name, outline(cast)]).toEqual([name, outline(shapes[0])]);
        const paints = cast.children
          .filter((c) => c.name === 'Fill' || c.name === 'Stroke')
          .map((c) => attr(c, 'name'));
        expect([name, paints]).toEqual([name, ['Shadow']]);
      }
      const paths = (shapes[0]?.children ?? []).filter((c) => c.name === 'PointsPath');
      expect(paths).toHaveLength(1);
      expect(String(attr(paths[0], 'isClosed'))).toBe('true');
      const vertices = paths[0]?.children ?? [];
      expect(vertices.every((v) => v.name === 'CubicMirroredVertex')).toBe(true);
      const n = vertices.length;
      expect(n).toBe(12);
      const knots = vertices.map((v) => {
        const [x, y, rot, dist] = [
          num(v, 'x', 0),
          num(v, 'y', 0),
          num(v, 'rotation', 0),
          num(v, 'distance', 0),
        ];
        return {
          at: [x, y] as Pt,
          out: [x + Math.cos(rot) * dist, y + Math.sin(rot) * dist] as Pt,
          into: [x - Math.cos(rot) * dist, y - Math.sin(rot) * dist] as Pt,
          rot,
          dist,
        };
      });
      for (const k of knots) {
        // On the circle, its handle along the circle's tangent, as long as a circle's.
        expect(Math.hypot(k.at[0], k.at[1])).toBeCloseTo(r, 6);
        const tangent = Math.atan2(k.at[1], k.at[0]) + Math.PI / 2;
        expect(Math.abs(Math.sin(k.rot - tangent))).toBeLessThan(1e-6);
        expect(Math.cos(k.rot - tangent)).toBeGreaterThan(0);
        expect(Math.abs(k.dist / circleHandle(r, n) - 1)).toBeLessThan(0.1);
      }
      // And what it draws between them is the circle: every arc within half a percent of the radius.
      knots.forEach((k, i) => {
        const next = knots[(i + 1) % n] ?? k;
        for (const t of [0.25, 0.5, 0.75]) {
          const s = 1 - t;
          const p = [0, 1].map(
            (j) =>
              s ** 3 * (k.at[j] ?? 0) +
              3 * s ** 2 * t * (k.out[j] ?? 0) +
              3 * s * t ** 2 * (next.into[j] ?? 0) +
              t ** 3 * (next.at[j] ?? 0),
          );
          expect(Math.abs(Math.hypot(p[0] ?? 0, p[1] ?? 0) / r - 1)).toBeLessThan(0.005);
        }
      });
    }
  });

  test('the outline axis lays what it names on every piece, by the line the piece carries', () => {
    // A piece's line by its weight under the centred line (A0): outer 5, small 3.5, trim 2.5, none.
    const lineRigs = figureRigs({ ...d, outline: 'line' });
    const weightOf = new Map(
      [lineRigs.accused, lineRigs.judge, lineRigs.hand].flatMap((rig) =>
        drawnOf(rig[0] as Element)
          .filter(isPaper)
          .map((s) => {
            const ink = paintNamed(s.e, 'Ink');
            const width = ink === undefined ? 0 : num(ink, 'thickness', 0);
            const weight = width === 0 ? 'none' : width === INK.trim ? 'trim' : 'silhouette';
            return [`${attr(rig[0], 'name')}.${s.name}`, weight] as const;
          }),
      ),
    );
    const LAYS = {
      none: { line: ['Paper'], thick: ['Paper'], edge: ['Paper'], both: ['Paper'] },
      trim: {
        line: ['Paper', 'Ink'],
        thick: ['Paper', 'Ink'],
        edge: ['Paper', 'Core'],
        both: ['Ink', 'Paper', 'Core'],
      },
      silhouette: {
        line: ['Paper', 'Ink'],
        thick: ['Ink', 'Paper'],
        edge: ['Paper', 'Core'],
        both: ['Ink', 'Paper', 'Core'],
      },
    } as const;
    const pieces = [accused, judge, hand].flatMap((b) =>
      drawnOf(b)
        .filter(isPaper)
        .map((s) => [`${attr(b, 'name')}.${s.name}`, s] as const),
    );
    expect(pieces.length).toBe(weightOf.size);
    for (const [name, s] of pieces) {
      const weight = weightOf.get(name) ?? 'none';
      const laid = s.e.children
        .map((c) => String(attr(c, 'name')))
        .filter((n) => n === 'Ink' || n === 'Paper' || n === 'Core');
      expect([name, weight, laid]).toEqual([name, weight, [...LAYS[weight][d.outline]]]);
    }
    expect([...weightOf.values()].filter((w) => w === 'silhouette').length).toBeGreaterThan(5);
    // Only the stains go unlined: they are marks on the tunic, not pieces of their own.
    for (const [name, weight] of weightOf)
      expect([name, weight === 'none']).toEqual([name, name.startsWith('Accused.stain')]);
  });

  test('the gavel and the paper he reads are drawn lined in the props’ inks', () => {
    const props = propsOf(d);
    const drawn = benchTopInks(props);
    expect(drawn.filter((c) => c === props.gavelInk.toLowerCase()).length).toBeGreaterThanOrEqual(
      2,
    );
    expect(drawn).toContain(props.sheetInk.toLowerCase());
  });
});

/**
 * The colours `riveJudge.over` fills with, in order, drawn into a recording
 * context: what the bench top (the sheet he reads, the gavel) is drawn in.
 * His hand is a rig, which this context does not draw.
 */
const benchTopInks = (props: Props): string[] =>
  laidBy((f) => riveJudge.over(f, 0.2, 0.5, props))
    .filter((l) => l.kind === 'fill')
    .flatMap((l) => l.colours);

test('the bench top is lined in the props it is given, never the kit’s own outline', () => {
  const props: Props = { ...propsOf(K1), sheetInk: '#0a0b0c', gavelInk: '#0d0e0f' };
  const drawn = benchTopInks(props);
  expect(drawn.filter((c) => c === '#0d0e0f').length).toBeGreaterThanOrEqual(2);
  expect(drawn).toContain('#0a0b0c');
  expect(drawn).not.toContain(C.outline.toLowerCase());
});
