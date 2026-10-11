// The painterly courtroom, cut like film: four shots of one painted stage,
// each cut on a cue's first frame (so on its word).
//
// 1. "Imagine standing in a courtroom. The evidence is overwhelming." The
//    wide: the whole room side on, the accused in the dock against the tall
//    window, the judge high at the bench in his lamps' light, the evidence
//    thrown down on the table between them (`drop`). A slow push in.
// 2. "You did it." (`bow`) Close on the accused: the long face, head going
//    down, eyes shut, the stain on the shirt, the hands on the rail.
// 3. "And the judge looks at you and says," (`lean`) Close on the judge: he
//    leans in over the bench and looks down, and raises the gavel (`gavel`).
// 4. "righteous." (`stamp`) The two-shot: the gavel comes down, the verdict
//    is struck on the writ in gold leaf, and its light lifts the accused's
//    face (`lift`).
//
// The camera frames the stage in world units (the wide's 1920 × 1080); the
// oil pass paints the frame over once it is drawn (`oil.ts`).

import { type Key, clamp, lerp } from '@bible/film/core';
import type { CourtFrame } from '../../scenes/court.ts';
import { BRUSH_PX, type Easel } from './brush.ts';
import { accused, accusedHands, judge, judgeHands } from './figures.ts';
import { oil } from './oil.ts';
import {
  EXHIBITS,
  STAMP_POP,
  backdrop,
  bench,
  canopy,
  dock,
  evidence,
  lamps,
  shafts,
  table,
  verdict,
  writ,
} from './room.ts';

/** A camera: where it looks in the world, and how near. */
interface Cam {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

/** The camera at `k` of the way from `a` to `b`. */
const toward = (a: Cam, b: Cam, k: number): Cam => ({
  x: lerp(a.x, b.x, k),
  y: lerp(a.y, b.y, k),
  zoom: lerp(a.zoom, b.zoom, k),
});

/** Each shot's camera where it starts and where it has pushed to by its cut. */
const SHOTS = {
  wide: [
    { x: 950, y: 500, zoom: 1.1 },
    { x: 900, y: 500, zoom: 1.2 },
  ],
  accused: [
    { x: 600, y: 556, zoom: 2.25 },
    { x: 596, y: 548, zoom: 2.36 },
  ],
  judge: [
    { x: 1452, y: 392, zoom: 2.2 },
    { x: 1430, y: 404, zoom: 2.34 },
  ],
  verdict: [
    { x: 1010, y: 500, zoom: 1.42 },
    { x: 1000, y: 512, zoom: 1.5 },
  ],
} as const satisfies Record<string, readonly [Cam, Cam]>;

/** The gavel across its cue: up, a beat held, down hard on the block, a small bounce, at rest. */
const RAISE: ReadonlyArray<Key> = [
  [0, 0],
  [0.373, 1],
  [0.627, 0, 'inCubic'],
  [0.797, 0.1, 'outQuad'],
  [1, 0],
];

/** The camera `cam` over the frame, and the easel it paints on. */
const shoot = (f: CourtFrame, cam: Cam, draw: (e: Easel) => void) => {
  const { ctx, w, h } = f;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.translate(-cam.x, -cam.y);
  const vw = w / cam.zoom;
  const vh = h / cam.zoom;
  draw({
    ctx,
    view: { x: cam.x - vw / 2, y: cam.y - vh / 2, w: vw, h: vh },
    px: w / BRUSH_PX / cam.zoom,
  });
  ctx.restore();
};

/** The shot in play and how far its push has gone, from the cues: each cut falls on a cue's first frame. */
const shot = (f: CourtFrame): Cam => {
  const span = (from: number, to: number) => clamp((f.t - from) / Math.max(0.01, to - from));
  const bow = f.cue('bow').start;
  const lean = f.cue('lean').start;
  const stamp = f.cue('stamp').start;
  if (f.at('bow') <= 0) return toward(...SHOTS.wide, span(0, bow));
  if (f.at('lean') <= 0) return toward(...SHOTS.accused, span(bow, lean));
  if (f.at('stamp') <= 0) return toward(...SHOTS.judge, span(lean, stamp));
  return toward(...SHOTS.verdict, span(stamp, f.dur));
};

export const court = (f: CourtFrame) => {
  const { t } = f;
  const cam = shot(f);
  const lift = f.at('lift');
  const bow = f.at('bow');
  const stamp = f.at('stamp');
  // A breath: the drift a held figure never loses.
  const breath = Math.sin(t * 1.7);
  shoot(
    f,
    { ...cam, x: cam.x + 3 * Math.sin(t * 0.37), y: cam.y + 2 * Math.sin(t * 0.29) },
    (e) => {
      backdrop(e);
      canopy(e, t);
      judge(e, { lean: f.at('lean'), raise: f.keys('gavel', RAISE), breath }, f.hand('judge'));
      bench(e, t);
      writ(e, t, stamp);
      judgeHands(
        e,
        { lean: f.at('lean'), raise: f.keys('gavel', RAISE), breath },
        f.hand('judgeHands'),
      );
      lamps(e, t);
      verdict(e, stamp, f.keys('stamp', STAMP_POP), f.hand('verdict'));
      table(e);
      evidence(e, (i) => f.stagger('drop', i, EXHIBITS.length));
      accused(
        e,
        { bow, lift, gold: lift * stamp, breath: Math.sin(t * 1.5 + 1) },
        f.hand('accused'),
      );
      dock(e, t);
      accusedHands(e, f.hand('accusedHands'));
      shafts(e, t);
    },
  );
  oil(f.ctx, { brush: 2.4, ink: 0.9, weave: 0.09, impasto: 0.35, bristles: 0.14, t });
};
