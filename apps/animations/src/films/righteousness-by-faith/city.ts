// The film's cardboard city under the teal sky: the title's, and the
// landing's (`rain`, `thesis`), one layout from the same rows and seeds.

import { type Pt, rectShape } from '@bible/film/canvas';
import { lerp, rng } from '@bible/film/core';
import { C, type Hands, piece, sky } from './kit.ts';

/** The landing sky: teal at the top warming to yellow at the horizon. */
export const landingSky = (ctx: CanvasRenderingContext2D, w: number, h: number) =>
  sky(ctx, w, h, [
    [0, C.tealTop],
    [0.5, C.tealMid],
    [0.8, C.tealLow],
    [1, C.peachLow],
  ]);

interface Block {
  readonly x: number;
  readonly w: number;
  readonly top: number;
}

const row = (seed: number, widths: Pt, heights: Pt, overlap: Pt): Block[] => {
  const r = rng(seed);
  const blocks: Block[] = [];
  let x = -40;
  while (x < 1960) {
    const w = lerp(widths[0], widths[1], r());
    const h = lerp(heights[0], heights[1], r());
    blocks.push({ x: x + w / 2, w, top: 1080 - h });
    x += w + lerp(overlap[0], overlap[1], r());
  }
  return blocks;
};

export const CITY_BACK = row(1888, [110, 210], [300, 520], [-20, -4]);
export const CITY_FRONT = row(1889, [150, 260], [170, 340], [-10, 18]).map((b, i, all) =>
  all.findIndex((c) => c.x > 1300) === i ? { ...b, top: 830 } : b,
);
/** The rooftop the title's figure stood on. */
export const ROOF = CITY_FRONT.find((b) => b.x > 1300) ?? { x: 1400, w: 200, top: 830 };

const WINDOWS = CITY_FRONT.flatMap((b, i) => {
  const r = rng(500 + i);
  const out: { at: Pt; lit: boolean }[] = [];
  for (let y = b.top + 52; y < 1040; y += 64)
    for (const x of [b.x - b.w / 4, b.x + b.w / 4])
      if (r() < 0.8) out.push({ at: [x, y], lit: r() >= 0.6 });
  return out;
});

/** The back row; `up` holds it that far below its place, for the title's rise. */
export const cityBack = (ctx: CanvasRenderingContext2D, hand: Hands, up = 0) =>
  CITY_BACK.forEach((b, i) =>
    piece(
      ctx,
      rectShape(b.x - b.w / 2, b.top + up, b.w, 1140 - b.top),
      C.boardShade,
      hand(`back${i}`),
      {
        line: 0,
        torn: 3,
        shadow: 0.5,
      },
    ),
  );

/** The front row, its windows and the ground; `up` as for `cityBack` (the ground stays). */
export const cityFront = (ctx: CanvasRenderingContext2D, hand: Hands, up = 0) => {
  CITY_FRONT.forEach((b, i) =>
    piece(
      ctx,
      rectShape(b.x - b.w / 2, b.top + up, b.w, 1120 - b.top),
      C.board,
      hand(`front${i}`),
      {
        line: 0,
        torn: 3,
        shadow: 0.6,
      },
    ),
  );
  WINDOWS.forEach((win, i) =>
    piece(
      ctx,
      rectShape(win.at[0] - 13, win.at[1] - 17 + up, 26, 34),
      win.lit ? C.glow : C.boardDeep,
      hand(`window${i}`),
      { line: 0, torn: 1.4, shadow: 0.2 },
    ),
  );
  piece(ctx, rectShape(-30, 1040, 1980, 60), C.boardDeep, hand('ground'), { line: 0, torn: 3 });
};
