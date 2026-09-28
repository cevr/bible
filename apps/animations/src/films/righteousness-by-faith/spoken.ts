// The spoken word, shared by `spoke`, `centurion` and `declared`: the word of
// light (the three icons' gold word-bubble, lit), the arc it flies on, and
// the dawn world it speaks into being; and `onWord`, which times a beat to an
// unmarked word of the narration. `declared` calls the dawn back in a
// panel, so both draw this one layout in 1920×1080 frame units.

import {
  type Frame,
  type Hand,
  type Pt,
  at,
  ellipseShape,
  length,
  quad,
  stroke,
  trim,
  sub,
} from '@bible/film/canvas';
import { clamp, ease, lerp } from '@bible/film/core';
import { C, blob, bubble, glow, piece, sky, type Hands } from './kit.ts';
import { tree } from './garden.ts';

/**
 * The word of light at the origin, `size` 1 being 160 units wide: the gold
 * word-bubble in its own glow. `lit` 0..1 is the glow's strength.
 */
export const wordLight = (ctx: CanvasRenderingContext2D, hand: Hand, size = 1, lit = 1) =>
  at(ctx, { x: 0, y: 0, scale: size }, () => {
    glow(ctx, 0, 0, 260, C.glow, 0.95 * lit);
    glow(ctx, 0, 0, 150, C.gold, 0.45 * lit);
    bubble(ctx, hand, (i) => sub(hand, 20 + i), { fill: C.gold, ink: C.cream, shadow: 0.2 });
  });

/** The arc a word flies from `from` to `to`, bowed up by `lift` over their midpoint. */
export const arc = (from: Pt, to: Pt, lift: number): Pt[] =>
  quad(from, [(from[0] + to[0]) / 2, Math.min(from[1], to[1]) - lift], to, 40);

/**
 * A word in flight along `path`, `p` 0..1 of the way: a trail of light behind
 * it that fades from the tail, and the word itself at the head, tipped along
 * its heading like a paper plane. Draws nothing at 0.
 */
export const flight = (
  ctx: CanvasRenderingContext2D,
  path: ReadonlyArray<Pt>,
  p: number,
  hand: Hand,
  size = 0.6,
) => {
  if (p <= 0) return;
  const drawn = trim(path, length(path) * clamp(p));
  const head = drawn.at(-1) ?? path[0] ?? [0, 0];
  const prev = drawn.at(-4) ?? drawn[0] ?? head;
  const tail = drawn.slice(Math.max(0, drawn.length - 22));
  stroke(
    ctx,
    tail,
    { color: C.glow, width: 34 * size, taper: 0.9, jitter: 0.6, alpha: 0.55 },
    sub(hand, 1),
  );
  stroke(
    ctx,
    tail,
    { color: C.gold, width: 12 * size, taper: 0.9, jitter: 0.4, alpha: 0.8 },
    sub(hand, 2),
  );
  const heading = Math.atan2(head[1] - prev[1], head[0] - prev[0]);
  at(ctx, { x: head[0], y: head[1], rot: 0.35 * Math.sin(heading) }, () =>
    wordLight(ctx, hand, size),
  );
};

/** Where the dawn's sun stands, and the tree the word draws up. */
export const SUN: Pt = [960, 300];
export const TREE: Pt = [1330, 905];

/** How far along the dawn world is; every value 0..1. */
export interface Dawn {
  /** Night gives way to dawn. */
  readonly flood: number;
  /** Dawn gives way to teal day. */
  readonly day: number;
  /** The sun bursts from the word. */
  readonly sun: number;
  /** Land and water tear in and rise into place. */
  readonly land: number;
  /** The tree grows up under the hanging word. */
  readonly tree: number;
}

export const DAWN_DONE: Dawn = { flood: 1, day: 1, sun: 1, land: 1, tree: 1 };

/** Rise from below, staggered: `k` 0..1 is how late this piece starts. */
const risen = (land: number, k: number) => ease.outBack(clamp((land - k * 0.4) / 0.6));

/**
 * The dawn world in 1920×1080 frame units: the dark, the sky it floods to,
 * the sun, cardboard land and water rising into place, and the tree.
 */
export const dawn = (ctx: CanvasRenderingContext2D, w: number, h: number, hand: Hands, d: Dawn) => {
  ctx.save();
  ctx.fillStyle = C.night;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
  if (d.flood > 0) {
    ctx.save();
    ctx.globalAlpha *= d.flood;
    sky(ctx, w, h, [
      [0, C.dawnTop],
      [0.7, C.dawnLow],
      [1, C.peachLow],
    ]);
    ctx.restore();
  }
  if (d.day > 0) {
    ctx.save();
    ctx.globalAlpha *= d.day;
    sky(ctx, w, h, [
      [0, C.tealTop],
      [0.62, C.tealMid],
      [1, C.tealLow],
    ]);
    ctx.restore();
  }

  // The sun, burst from the word: a ring of light and a gold disc.
  if (d.sun > 0) {
    const [sx, sy] = SUN;
    glow(ctx, sx, sy, 700 * d.sun, C.glow, 0.9);
    const ring = clamp(d.sun * 1.4);
    if (ring < 1)
      stroke(
        ctx,
        [...ellipseShape(sx, sy, 90 + 400 * ring, 90 + 400 * ring, 64)],
        { color: C.glow, width: 26 * (1 - ring), taper: 0, jitter: 0.8, alpha: 1 - ring },
        hand('burst'),
      );
    at(ctx, { x: sx, y: sy, scale: ease.outBack(clamp(d.sun)) }, () =>
      piece(ctx, ellipseShape(0, 0, 92, 92), C.gold, hand('sun'), { line: 0, shadow: 0.2 }),
    );
  }

  // Land and water, torn from board, rising from below in turn.
  if (d.land > 0) {
    const far = (1 - risen(d.land, 0)) * 520;
    piece(
      ctx,
      [
        [-60, 760 + far],
        [260, 610 + far],
        [560, 690 + far],
        [880, 580 + far],
        [1240, 700 + far],
        [1580, 600 + far],
        [1980, 700 + far],
        [1980, 1120],
        [-60, 1120],
      ],
      C.boardShade,
      hand('hills'),
      { line: 0, torn: 4, shadow: 0.5 },
    );
    const sea = (1 - risen(d.land, 0.5)) * 460;
    piece(
      ctx,
      [
        [-60, 790 + sea],
        [900, 770 + sea],
        [900, 1120],
        [-60, 1120],
      ],
      C.water,
      hand('water'),
      { line: 0, torn: 3, shadow: 0.35 },
    );
    const near = (1 - risen(d.land, 1)) * 420;
    piece(
      ctx,
      [
        [640, 900 + near],
        [980, 820 + near],
        [1400, 850 + near],
        [1980, 800 + near],
        [1980, 1120],
        [640, 1120],
      ],
      C.board,
      hand('shore'),
      { line: 0, torn: 4, shadow: 0.6 },
    );
    piece(ctx, blob(260, 950 + near, 320, 110, 3), C.boardLight, hand('isle'), {
      line: 0,
      torn: 3,
      shadow: 0.5,
      alpha: clamp(d.land * 2 - 1),
    });
  }

  // The tree: a trunk that climbs, then its crown opening out of it.
  if (d.tree > 0)
    at(ctx, { x: TREE[0], y: TREE[1] }, () =>
      tree(ctx, hand('tree'), {
        height: 300,
        trunk: 34,
        lobes: 5,
        spread: 70,
        leaves: [C.leafShade, C.leaf],
        bark: C.boardDeep,
        seed: 9,
        grow: d.tree,
      }),
    );
};

/** Linear blend, for a camera or a place on its way between two. */
export const toward = (a: Pt, b: Pt, t: number): Pt => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

/** A letter or digit's code, upper case folded to lower; -1 for anything else (punctuation, quotes, space). */
const letter = (c: number) =>
  c >= 65 && c <= 90
    ? c + 32
    : (c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c > 0x2e7f
      ? c
      : -1;

/** Whether a spoken word reads `word` (lower case): its letters and digits, any case, punctuation ignored. */
const reads = (text: string, word: string) => {
  let j = 0;
  for (let i = 0; i < text.length; i++) {
    const c = letter(text.charCodeAt(i));
    if (c < 0) continue;
    if (j >= word.length || c !== word.charCodeAt(j)) return false;
    j++;
  }
  return j === word.length;
};

/** The frame as `onWord` reads it. */
type Heard = Pick<Frame, 't' | 'words' | 'mark'>;

/**
 * When the first word said at or after the mark `from` reads `word` (lower
 * case) starts, scene-local; the mark itself if the line never says it (the
 * pins are held to the script by `test/word-pins.test.ts`).
 */
export const wordStart = (f: Heard, from: string, word: string): number => {
  const a = f.mark(from);
  for (const w of f.words) if (w.start >= a - 1e-3 && reads(w.text, word)) return w.start;
  return a;
};

/**
 * 0→1 over `dur` seconds from `offset` after that word starts, eased like a
 * cue (`inOutCubic` unless given): a beat pinned to a word that has no mark,
 * so it moves with the word if the line is re-recorded.
 */
export const onWord = (
  f: Heard,
  from: string,
  word: string,
  offset: number,
  dur: number,
  curve: (t: number) => number = ease.inOutCubic,
) => curve(clamp((f.t - wordStart(f, from, word) - offset) / dur));
