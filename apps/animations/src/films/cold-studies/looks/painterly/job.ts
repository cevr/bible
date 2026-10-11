// Job's question, painted in the same hand as the courtroom. The verse: an
// old printed Bible open on a dark desk under a lamp, its right-hand page
// worn and foxed, Job 9:1-3 set in a book face; as "Job asked it" is said,
// a stroke of deep teal paint runs along "how should man be just with God?",
// and the teal floods the frame. The card: that teal, brushed, with the words
// lettered on it in cream as they are spoken, "just" large in gold leaf
// (the oil pass lays the leaf where the gold paint is). Both go through the
// oil pass, the page and the letters with a finer brush than the room's so
// the type stays sharp enough to read.

import {
  type Box,
  type CardStyle,
  type CardWord,
  type VerseStyle,
  fullCard,
  verse,
  write,
} from '@bible/film/canvas';
import { clamp, ease, hash2, lerp } from '@bible/film/core';
import { VERSE } from '../../look.ts';
import type { JobFrame } from '../../scenes/job.ts';
import { BRUSH_PX, type Easel, curve, glow, oval, paint, pool, rect, shade } from './brush.ts';
import { oil } from './oil.ts';
import { P, R, SERIF } from './palette.ts';

/** The page's printed ink: a warm brown-black, worn. */
const PRINT = '#2b2119';

/** The verses either side of Job 9:2, as the page prints them (KJV, `bible verse "Job 9:1-3"`). */
const BEFORE = 'Then Job answered and said,';
const AFTER = 'If he will contend with him, he cannot answer him one of a thousand.';

const VERSE_STYLE: VerseStyle = {
  type: { family: SERIF, size: 70, weight: 500, color: PRINT, leading: 1.32 },
  width: 1080,
  highlight: P.teal,
  lit: P.cream,
};

/** The page: its corners on the desk. */
const PAGE = { x: 300, y: 70, w: 1360, h: 960 } as const;

/** The text block's left edge and first baselines. */
const TEXT = { x: 470, head: 190, v1: 330, v2: 470 } as const;

/** The camera on the page: settled, then pushing toward the phrase as it is highlighted. */
const camera = (f: JobFrame, draw: (e: Easel) => void) => {
  const { ctx, w, h } = f;
  const settle = f.at('page');
  const push = f.at('sweep');
  const zoom = lerp(1, 1.07, push);
  const cx = lerp(960, 1010, push);
  const cy = lerp(560, 580, push) - 30 * (1 - settle);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.rotate(-0.012 + 0.02 * (1 - settle));
  ctx.translate(-cx, -cy);
  const vw = w / zoom;
  const vh = h / zoom;
  draw({
    ctx,
    view: { x: cx - vw / 2 - 40, y: cy - vh / 2 - 40, w: vw + 80, h: vh + 80 },
    px: w / BRUSH_PX / zoom,
  });
  ctx.restore();
};

/** The desk, the open book and its page, worn at the edges and foxed. */
const page = (e: Easel, t: number) => {
  const { ctx } = e;
  const desk: Box = { x: -200, y: -200, w: 2400, h: 1500 };
  paint(e, rect(desk), {
    ramp: R.desk,
    box: desk,
    seed: 600,
    dir: 0.1,
    spread: 0.1,
    size: 28,
    ratio: 0.25,
    tone: (x, y) => 0.1 + 0.6 * pool(x, y, 1650, 80, 1300),
  });
  // The pages beneath, their edges stacked at the right and the foot.
  for (let k = 5; k >= 1; k--)
    shade(
      ctx,
      rect({ x: PAGE.x + 4 * k, y: PAGE.y + 5 * k, w: PAGE.w, h: PAGE.h }),
      k % 2 === 0 ? R.paper[1] : R.paper[2],
      1,
    );
  const sheet = curve(
    [
      [PAGE.x, PAGE.y + 10],
      [PAGE.x + PAGE.w * 0.5, PAGE.y - 4],
      [PAGE.x + PAGE.w, PAGE.y + 6],
      [PAGE.x + PAGE.w + 6, PAGE.y + PAGE.h * 0.5],
      [PAGE.x + PAGE.w - 4, PAGE.y + PAGE.h],
      [PAGE.x + PAGE.w * 0.5, PAGE.y + PAGE.h + 6],
      [PAGE.x - 6, PAGE.y + PAGE.h - 4],
      [PAGE.x - 14, PAGE.y + PAGE.h * 0.5],
    ],
    0.5,
  );
  paint(e, sheet, {
    ramp: R.paper,
    box: { x: PAGE.x - 20, y: PAGE.y - 10, w: PAGE.w + 30, h: PAGE.h + 20 },
    seed: 610,
    dir: -0.15,
    spread: 0.3,
    size: 18,
    jitter: 0.05,
    tone: (x, y) => {
      const gutter = clamp((x - PAGE.x) / 220);
      const edge = Math.min(
        clamp((PAGE.x + PAGE.w - x) / 80),
        clamp((y - PAGE.y) / 60),
        clamp((PAGE.y + PAGE.h - y) / 70),
      );
      return 0.3 + 0.5 * gutter * (0.6 + 0.4 * edge) + 0.22 * pool(x, y, 1500, 200, 1100);
    },
  });
  // Foxing: the brown spots of an old page.
  for (let i = 0; i < 26; i++) {
    const x = PAGE.x + 60 + hash2(i, 620) * (PAGE.w - 120);
    const y = PAGE.y + 40 + hash2(i, 621) * (PAGE.h - 80);
    const r = 3 + 12 * hash2(i, 622) ** 2;
    shade(ctx, oval(x, y, r, r * 0.8), '#7a5a32', 0.18);
  }
  // The gutter's shadow, where the page curves down into the binding.
  ctx.save();
  const g = ctx.createLinearGradient(PAGE.x - 20, 0, PAGE.x + 200, 0);
  g.addColorStop(0, 'rgba(20,16,12,0.75)');
  g.addColorStop(1, 'rgba(20,16,12,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  sheet(ctx);
  ctx.fill();
  ctx.restore();
  glow(ctx, 1560, 150, 900, P.lamp, 0.22 + 0.02 * Math.sin(t * 9.1));
};

/** The running head, the verses around Job 9:2, and their numbers. */
const print = (e: Easel, f: JobFrame) => {
  const { ctx } = e;
  const small = { family: SERIF, size: 40, weight: 500, color: PRINT, tracking: 0.12 } as const;
  write(ctx, 'JOB.', TEXT.x + 540, TEXT.head, { ...small, align: 'center' }, f.hand('head'), {
    boil: 0,
  });
  write(ctx, 'CHAP. IX.', TEXT.x, TEXT.head, small, f.hand('chap'), { boil: 0, alpha: 0.8 });
  ctx.fillStyle = PRINT;
  ctx.fillRect(TEXT.x, TEXT.head + 24, 1080, 3);
  ctx.fillRect(TEXT.x, TEXT.head + 31, 1080, 1.2);
  const body = { family: SERIF, size: 54, weight: 400, color: PRINT, leading: 1.3 } as const;
  const number = { family: SERIF, size: 36, weight: 600, color: PRINT } as const;
  write(ctx, '1', TEXT.x - 46, TEXT.v1, number, f.hand('n1'), { boil: 0, alpha: 0.7 });
  write(ctx, BEFORE, TEXT.x, TEXT.v1, body, f.hand('v1'), { boil: 0, alpha: 0.72 });
  write(ctx, '2', TEXT.x - 46, TEXT.v2, number, f.hand('n2'), { boil: 0 });
  const v3 = TEXT.v2 + 2 * 70 * 1.32 + 60;
  write(ctx, '3', TEXT.x - 46, v3, number, f.hand('n3'), { boil: 0, alpha: 0.7 });
  const words = AFTER.split(' ');
  const half = Math.ceil(words.length * 0.55);
  write(ctx, words.slice(0, half).join(' '), TEXT.x, v3, body, f.hand('v3a'), {
    boil: 0,
    alpha: 0.72,
  });
  write(ctx, words.slice(half).join(' '), TEXT.x, v3 + 54 * 1.3, body, f.hand('v3b'), {
    boil: 0,
    alpha: 0.72,
  });
};

/**
 * The flood's brushed edge: teal strokes dragged out past the box the card
 * floods in through, so its edge reads as paint pushed across the page, not a
 * cut. The engine clips the card to `floodBox(box, …, f.at('flood'))`; this
 * grows the same box by the same ease (it is not exported), in canvas px.
 */
const fringe = (ctx: CanvasRenderingContext2D, from: Box, flood: number) => {
  if (flood <= 0 || flood >= 1) return;
  const { width: W, height: H } = ctx.canvas;
  const k = ease.inOutCubic(flood);
  const b: Box = {
    x: lerp(from.x, 0, k),
    y: lerp(from.y, 0, k),
    w: lerp(from.w, W, k),
    h: lerp(from.h, H, k),
  };
  const unit = W / 1920;
  const reach = 46 * unit * clamp(flood * 8);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // The four edges: [start x, start y, along x, along y].
  const edges: ReadonlyArray<readonly [number, number, number, number]> = [
    [b.x, b.y, b.w, 0],
    [b.x + b.w, b.y, 0, b.h],
    [b.x, b.y + b.h, b.w, 0],
    [b.x, b.y, 0, b.h],
  ];
  // Broad dabs laid along each edge, overlapping, each pushed its own way out:
  // a ragged, scalloped front in the ground's own dark teals.
  for (const [n, color] of [R.card[0], R.card[1]].entries()) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const [side, [x0, y0, ax, ay]] of edges.entries()) {
      const count = Math.ceil(Math.hypot(ax, ay) / (22 * unit));
      for (let i = 0; i <= count; i++) {
        if ((hash2(i, side * 7 + 900) < 0.3 ? 0 : 1) !== n) continue;
        const u = (i + 0.5 * hash2(i, side * 7 + 904)) / Math.max(1, count);
        const out = reach * (0.2 + 0.8 * hash2(i, side * 7 + 901));
        const l = 40 * unit * (0.8 + 0.6 * hash2(i, side * 7 + 902));
        const x = x0 + ax * u;
        const y = y0 + ay * u;
        // Along the edge, a little askew, reaching `out` past it.
        const rot = Math.atan2(ay, ax) + (hash2(i, side * 7 + 903) - 0.5) * 0.5;
        ctx.moveTo(x + Math.cos(rot) * l * 0.5, y + Math.sin(rot) * l * 0.5);
        ctx.ellipse(x, y, l * 0.5, out, rot, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }
  ctx.restore();
};

export const job = (f: JobFrame): Box => {
  let box: Box = { x: 0, y: 0, w: 0, h: 0 };
  camera(f, (e) => {
    page(e, f.t);
    print(e, f);
    box = verse(
      e.ctx,
      VERSE,
      VERSE_STYLE,
      { x: TEXT.x, y: TEXT.v2, highlight: f.at('sweep') },
      f.hand('verse'),
    );
  });
  fringe(f.ctx, box, f.at('flood'));
  oil(f.ctx, { brush: 1.1, ink: 0.55, weave: 0.1, impasto: 0.3, bristles: 0.06, t: f.t });
  return box;
};

/** The card's ground: deep teal brushed over the whole frame, darker toward its edges. */
const ground = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const e: Easel = { ctx, view: { x: 0, y: 0, w, h }, px: w / BRUSH_PX };
  paint(e, rect({ x: -10, y: -10, w: w + 20, h: h + 20 }), {
    ramp: R.card,
    box: { x: -10, y: -10, w: w + 20, h: h + 20 },
    seed: 700,
    dir: -0.35,
    spread: 0.5,
    size: 34,
    ratio: 0.3,
    jitter: 0.08,
    tone: (x, y) => 0.15 + 0.6 * pool(x, y, w * 0.5, h * 0.48, w * 0.75),
  });
};

const CARD_STYLE: CardStyle = {
  ground,
  type: { family: SERIF, size: 104, weight: 500, color: P.cream, leading: 1.18 },
  payoffScale: 2.7,
  payoffColor: P.gold,
  payoffType: { weight: 700, italic: true },
  case: 'said',
  align: 'center',
  treatment: {
    under: true,
    // The leaf's warmth on the teal round it as it is laid.
    draw: (ctx, b, since) => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      glow(ctx, cx, cy, Math.max(b.w, b.h) * 0.9, '#a77b2a', 0.5 * clamp(since * 4));
    },
  },
};

export const card = (f: JobFrame, words: ReadonlyArray<CardWord>) => {
  fullCard(f, words, CARD_STYLE);
  oil(f.ctx, { brush: 0.9, ink: 0.3, weave: 0.14, impasto: 0.4, bristles: 0.1, t: f.t });
};
