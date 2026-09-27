// What grows: the fig leaves we sew (`mirror`) and the garden's trees.

import { type Hand, type Pt, at, line, spline, stroke } from '@bible/film/canvas';
import { hash2 } from '@bible/film/core';
import { C, blob, piece, rounded, sub, type Hands } from './kit.ts';

/** A fig leaf, stem at (0, 0), pointing up, about 60 units long at size 1. */
export const leafShape = (s: number, seed: number): Pt[] =>
  spline(
    Array.from({ length: 15 }, (_, i): Pt => {
      const a = (2 * Math.PI * i) / 15 - Math.PI / 2;
      const lobes =
        0.72 + 0.28 * Math.abs(Math.cos(2.5 * (a + Math.PI / 2))) + 0.06 * hash2(i, seed);
      return [Math.cos(a) * 28 * s * lobes, -30 * s + Math.sin(a) * 32 * s * lobes];
    }),
    5,
    true,
  );

/**
 * A fig-leaf apron over a person's garment (in the person's units): `count`
 * leaves shown, `droop` 0..1 wilts them brown and lets them hang.
 */
export const APRON: ReadonlyArray<readonly [number, number, number]> = [
  [-16, -44, -0.3],
  [18, -46, 0.35],
  [0, -84, 0.05],
  [-24, -100, -0.5],
  [26, -98, 0.55],
  [2, -28, 0.1],
];

export const apron = (
  ctx: CanvasRenderingContext2D,
  hand: Hand,
  count: number,
  droop = 0,
  stitch = 1,
) => {
  const color = droop > 0.5 ? C.leafDry : C.leaf;
  APRON.forEach(([x, y, rot], i) => {
    const shown = Math.max(0, Math.min(1, count - i));
    if (shown <= 0) return;
    const hang = droop * (6 + 5 * hash2(i, 3));
    at(
      ctx,
      {
        x,
        y: y + 30 + hang,
        rot: rot + droop * (0.5 - hash2(i, 5)) * 1.4,
        scale: shown * (1 - 0.15 * droop),
      },
      () => piece(ctx, leafShape(0.8, i), color, sub(hand, 90 + i), { line: 2.5, shadow: 0.25 }),
    );
    // The seams, stained where they are sewn.
    if (i > 0 && shown >= 1 && stitch > 0)
      stroke(
        ctx,
        line([x - 8, y + 28 + hang], [x + 8, y + 22 + hang]),
        { color: C.scarlet, width: 3, jitter: 0.6, alpha: stitch },
        sub(hand, 110 + i),
      );
  });
};

/** A tree of the garden: a board trunk and a round crown of leaves, feet at (0, 0), `s` scaled. */
export const tree = (ctx: CanvasRenderingContext2D, hand: Hand, s: number, seed: number) =>
  at(ctx, { x: 0, y: 0, scale: s }, () => {
    piece(ctx, rounded(0, -110, 44, 230, 12), C.boardShade, sub(hand, seed), { line: 3, torn: 2 });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + seed;
      piece(
        ctx,
        blob(Math.cos(a) * 70, -270 + Math.sin(a) * 45, 150, 120, seed * 10 + i),
        i % 2 === 0 ? C.leaf : '#8fb06a',
        sub(hand, seed * 10 + i + 1),
        { line: 3, torn: 2 },
      );
    }
  });

/** The tree the figure rests under in `within`: its foot at the origin, about 520 tall. */
export const shadeTree = (ctx: CanvasRenderingContext2D, hand: Hands, leaves: string) => {
  piece(ctx, rounded(0, -150, 60, 300, 20), C.boardShade, hand('trunk'), { line: 3 });
  piece(ctx, blob(0, -380, 380, 260, 41), leaves, hand('crown'), { line: 3 });
  piece(ctx, blob(-90, -330, 180, 140, 42), leaves, hand('crown2'), { line: 3 });
};
