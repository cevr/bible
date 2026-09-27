// The title: a teal sky over a cardboard city that rises into place, the name
// of the film settling above it, and one small grey figure on a rooftop who
// looks up at it. The camera tilts up a little, so the two rows of buildings
// part in depth.

import { type Pt, at, drawing, multiplane, rectShape, write } from '@bible/film/canvas';
import { lerp, rng } from '@bible/film/core';
import { C, F, glow, person, piece, sky } from '../kit.ts';

interface Block {
  readonly x: number;
  readonly w: number;
  readonly top: number;
}

interface Window {
  readonly at: Pt;
  readonly lit: boolean;
}

/** A row of buildings, left to right across the frame, each `w` wide and standing to `top`. */
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

const BACK = row(1888, [110, 210], [300, 520], [-20, -4]);
/** The figure's roof: the first front block past x 1300, held at 250 tall. */
const FRONT = row(1889, [150, 260], [170, 340], [-10, 18]).map((b, i, all) =>
  all.findIndex((c) => c.x > 1300) === i ? { ...b, top: 830 } : b,
);
const ROOF = FRONT.find((b) => b.x > 1300) ?? { x: 1400, w: 200, top: 830 };

const WINDOWS: Window[] = FRONT.flatMap((b, i) => {
  const r = rng(500 + i);
  const out: Window[] = [];
  for (let y = b.top + 52; y < 1040; y += 64)
    for (const x of [b.x - b.w / 4, b.x + b.w / 4])
      if (r() < 0.8) out.push({ at: [x, y], lit: r() >= 0.6 });
  return out;
});

export const title = drawing({
  timeline: {
    rise: { scene: 'start', dur: 1.2, ease: 'outCubic' },
    settle: { scene: 'start', offset: 0.17, dur: 0.6, ease: 'outCubic' },
    lookUp: { scene: 'start', offset: 1.17, dur: 0.5 },
  },
  draw: (f) => {
    const { ctx, w, h } = f;
    const rise = f.at('rise');
    sky(ctx, w, h, [
      [0, C.tealTop],
      [0.62, C.tealMid],
      [1, C.tealLow],
    ]);
    glow(ctx, 960, 380, 750, C.glow, 0.55);

    // A slow tilt up over the whole title.
    const drift = f.t / Math.max(f.dur, 1);
    multiplane(ctx, { x: 960, y: lerp(580, 540, drift), zoom: lerp(1.04, 1, drift) }, w, h, [
      {
        z: 1.6,
        draw: () =>
          BACK.forEach((b, i) =>
            piece(
              ctx,
              rectShape(b.x - b.w / 2, b.top + (1 - rise) * 60, b.w, 1140 - b.top),
              C.boardShade,
              f.hand(`back${i}`),
              { line: 0, torn: 3, shadow: 0.5 },
            ),
          ),
      },
      {
        z: 1,
        lift: 1.4,
        draw: () => {
          const up = (1 - rise) * 110;
          FRONT.forEach((b, i) =>
            piece(
              ctx,
              rectShape(b.x - b.w / 2, b.top + up, b.w, 1120 - b.top),
              C.board,
              f.hand(`front${i}`),
              { line: 0, torn: 3, shadow: 0.6 },
            ),
          );
          WINDOWS.forEach((win, i) =>
            piece(
              ctx,
              rectShape(win.at[0] - 13, win.at[1] - 17 + up, 26, 34),
              win.lit ? C.glow : C.boardDeep,
              f.hand(`window${i}`),
              { line: 0, torn: 1.4, shadow: 0.2 },
            ),
          );
          piece(ctx, rectShape(-30, 1040, 1980, 60), C.boardDeep, f.hand('ground'), {
            line: 0,
            torn: 3,
          });
          const look = f.at('lookUp');
          at(ctx, { x: ROOF.x, y: ROOF.top + up, scale: 0.62 }, () =>
            person(
              ctx,
              {
                tilt: -0.1 * look,
                look: [1.5 * look, -3.5 * look],
                browL: 2 * look,
                browR: 3 * look,
                browTilt: 0.5 * look,
              },
              f.hand('figure'),
            ),
          );
        },
      },
    ]);

    // The name, with the paper shadow it casts on the sky.
    const settle = f.at('settle');
    ctx.save();
    ctx.shadowColor = `${C.boardDeep}48`;
    ctx.shadowOffsetX = 7;
    ctx.shadowOffsetY = 8;
    write(
      ctx,
      'Righteousness by Faith',
      960,
      lerp(445, 415, settle),
      { family: F.display, size: 132, weight: 700, color: C.cream, align: 'center' },
      f.hand('title'),
      { alpha: settle, boil: 0.4 },
    );
    ctx.restore();
  },
});
