// The colours, for every direction (CRAFT 12): the bases sit in the film's
// saturation band, the live ramps meet its floors, and every colour a rig
// paints is a base or what `ramp` derives from one. `direction-options.test.ts`
// tells the whole property.

import type { Hex } from '@bible/film/canvas';
import { describe, expect, test } from 'bun:test';
import { Predicate } from 'effect';
import { type Ramp, hues, keyLight, ramps, robes } from '../../palette.ts';
import { K1 } from './direction.ts';
import { figureRigs } from './figures.ts';
import { type Element, argb, el } from './rml.ts';
import {
  SHADED,
  attr,
  walk,
  paintNamed,
  type Drawn,
  drawnOf,
  isPaper,
  lchOf,
  shown,
  coverOf,
  shadowOf,
  castsOf,
  auditOf,
} from './test/direction-rigs.ts';

/** The HSV saturation of hex colour `hex`, to the hundredth a hex can hold it to. */
const saturation = (hex: string) => {
  const [r, g, b] = [0, 1, 2].map((i) => Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16));
  const most = Math.max(r ?? 0, g ?? 0, b ?? 0);
  return most === 0
    ? 0
    : Math.round((100 * (most - Math.min(r ?? 0, g ?? 0, b ?? 0))) / most) / 100;
};

test('every garment, robe and prop base sits in the film’s saturation band (CRAFT 12; shades may leave it)', () => {
  const bases = [
    ...Object.entries(hues).flatMap(([name, v]: [string, Hex | Ramp | ReadonlyArray<Hex>]) =>
      Predicate.isString(v)
        ? [[name, v] as const]
        : Array.isArray(v)
          ? v.map((h, i) => [`${name}[${i}]`, h] as const)
          : [[name, (v as Ramp).base] as const],
    ),
    ...Object.entries(robes).map(([name, r]) => [`robes.${name}`, r.base] as const),
  ];
  const out = bases
    .filter(([, hex]) => saturation(hex) < 0.2 || saturation(hex) > 0.35)
    .map(([name, hex]) => `${name}: ${hex} at ${saturation(hex)}`);
  expect(out).toEqual([]);
});

/**
 * CRAFT 12's floors in numbers, as the film's colour model holds its knobs
 * to them (`ramp`), here held to what the palette derives with no gamut
 * excuse: a knob the model accepts can still ask for more than sRGB shows
 * (a light near white keeps no chroma). Chroma is allowed half a unit for
 * the hex's 8-bit rounding; a hue's turn the angle a unit of rounding moves
 * it at that chroma.
 */
const LIVE_FLOORS = { chroma: 5.5, turn: 10 } as const;

test('every live ramp meets CRAFT 12’s floors as drawn: darker and lighter, chroma 6, a 10° turn', () => {
  const key = lchOf(keyLight).h;
  const complement = (key + 180) % 360;
  const apart = (h: number, k: number) => {
    const d = Math.abs(h - k) % 360;
    return d > 180 ? 360 - d : d;
  };
  const slack = (C: number) => (Math.atan(1 / Math.max(C, 1)) * 180) / Math.PI;
  const turned = (from: number, to: number, toward: number, C: number) =>
    apart(to, toward) <=
    apart(from, toward) - Math.min(LIVE_FLOORS.turn, apart(from, toward)) + slack(C);
  const live = [
    ...Object.entries(ramps).map(([n, r]) => [`ramps.${n}`, r] as const),
    ...Object.entries(robes).map(([n, r]) => [`robes.${n}`, r] as const),
    ...Object.entries(hues).flatMap(([n, v]: [string, Hex | Ramp | ReadonlyArray<Hex>]) =>
      Predicate.hasProperty(v, 'base') ? [[`hues.${n}`, v as Ramp] as const] : [],
    ),
  ];
  const wrong = live.flatMap(([name, r]) => {
    const [b, s, l] = [lchOf(r.base), lchOf(r.shade), lchOf(r.light)];
    return [
      ...(s.L < b.L ? [] : ['shade not darker']),
      ...(s.C >= LIVE_FLOORS.chroma ? [] : [`shade ${shown(r.shade)} grey`]),
      ...(turned(b.h, s.h, complement, s.C)
        ? []
        : [`shade ${r.shade} not turned 10° toward the complement`]),
      ...(l.L > b.L ? [] : ['light not lighter']),
      ...(l.C >= LIVE_FLOORS.chroma ? [] : [`light ${shown(r.light)} grey`]),
      ...(turned(b.h, l.h, key, l.C) ? [] : [`light ${r.light} not turned 10° toward the key`]),
    ].map((w) => `${name}: ${w}`);
  });
  expect(wrong).toEqual([]);
});

/** `board` with a second colour, black, in the first paint named `role`: a light or a shadow shaded with black part way across. */
const blackenedSecond = (board: Element, role: string): Element => {
  let done = false;
  const visit = (e: Element): Element => {
    if (!done && attr(e, 'name') === role && (e.name === 'Fill' || e.name === 'Stroke')) {
      done = true;
      return { ...e, children: [...e.children, el('SolidColor', { colorValue: argb('#000000') })] };
    }
    return { ...e, children: e.children.map(visit) };
  };
  return visit(board);
};

test.each(['Core', 'Shadow'])(
  'a %s with a black second colour fails: every colour of a paint is read',
  (role) => {
    const board = figureRigs(K1).accused[0] as Element;
    expect(auditOf(board, K1)).toEqual([]);
    expect(auditOf(blackenedSecond(board, role), K1).join('; ')).toContain('#000000');
  },
);

describe.each(SHADED)('the colours under %s', (_, d) => {
  const rigs = figureRigs(d);
  const boards = [rigs.accused, rigs.judge, rigs.hand].map((rig) => rig[0] as Element);

  test('every colour a rig paints is a declared base or what ramp derives from one (CRAFT 12)', () => {
    expect(boards.flatMap((b) => auditOf(b, d))).toEqual([]);
  });

  test('no timeline animates a colour, so what holds at rest holds in every pose', () => {
    const keyed = [rigs.accused, rigs.judge, rigs.hand]
      .flatMap((rig) => walk(rig))
      .filter((e) => e.name === 'KeyFrameColor');
    expect(keyed).toHaveLength(0);
  });

  test('a cast is laid only where it can show past its piece’s ink', () => {
    const edge = figureRigs({ ...d, outline: 'edge' });
    const edgeBoards = [edge.accused, edge.judge, edge.hand].map((rig) => rig[0] as Element);
    const wrong: string[] = [];
    const reaches = (all: ReadonlyArray<Drawn>, p: Drawn) =>
      [p, ...castsOf(all, p.name)].flatMap((s) => {
        const shadow = paintNamed(s.e, 'Shadow');
        return shadow === undefined ? [] : [[s.name, shadowOf(shadow).reach] as const];
      });
    boards.forEach((b, i) => {
      const shapes = drawnOf(b);
      const twins = drawnOf(edgeBoards[i] as Element);
      for (const p of shapes.filter(isPaper)) {
        const cover = coverOf(p.e);
        const laid = reaches(shapes, p);
        for (const [name, reach] of laid)
          if (reach <= cover)
            wrong.push(
              `${attr(b, 'name')}.${name}: reaches ${reach.toFixed(2)}, under an ink of ${cover.toFixed(2)}`,
            );
        // Laid nowhere: under no ink (`edge`) the same piece shows how far its cast reaches.
        const twin = twins.find((t) => t.name === p.name);
        const could = twin === undefined ? [] : reaches(twins, twin);
        const reach = Math.max(0, ...could.map(([, r]) => r));
        if (laid.length === 0 && reach > cover)
          wrong.push(
            `${attr(b, 'name')}.${p.name}: no cast, though it reaches ${reach.toFixed(2)} past an ink of ${cover.toFixed(2)}`,
          );
      }
    });
    expect(wrong).toEqual([]);
  });
});
