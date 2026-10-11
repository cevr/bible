// Type inside the ps1 world: painted into small 2D canvases at about the
// size it shows on the low-res screen and worn as textures, so it is pixel
// type, chunky and a little uneven where the texture is sampled
// nearest-neighbour, the way the console's games put words on things. The
// verdict on its plate is painted once; Job's page is repainted every frame
// from `f` (its highlight moves), into the one canvas kept for it.

import {
  type Box,
  type Hand,
  type TextStyle,
  type VerseStyle,
  verse,
  write,
} from '@bible/film/canvas';
import { fonts } from '../../palette.ts';
import { VERSE } from '../../look.ts';

/** A 2D canvas off the page, `w` × `h`. */
const sheet = (w: number, h: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
};

/** The hand type in the world is set with: still, no boil. */
const STILL: Hand = { boil: 0, seed: 1 };

/** "Righteous" in gold on a cream plate with a dark rule round it: the verdict, stamped. */
export const verdictPlate = (): HTMLCanvasElement => {
  const canvas = sheet(144, 36);
  const ctx = canvas.getContext('2d');
  if (ctx === null) return canvas;
  ctx.fillStyle = '#3a2a18';
  ctx.fillRect(0, 0, 144, 36);
  ctx.fillStyle = '#efe6cf';
  ctx.fillRect(2, 2, 140, 32);
  const style: TextStyle = {
    family: fonts.body,
    size: 22,
    weight: 700,
    color: '#b8862a',
    align: 'center',
  };
  write(ctx, 'Righteous', 73, 27, { ...style, color: '#5a3a10' }, STILL, { boil: 0 });
  write(ctx, 'Righteous', 72, 26, style, STILL, { boil: 0 });
  return canvas;
};

/** Job's page: its size in texels, its paper and ink. */
export const PAGE = { w: 256, h: 360, paper: '#e9e1cc', ink: '#2a2420', rule: '#9a8a70' } as const;

/** Where the verse starts on the page, and the reference above it. */
const TEXT = { x: 18, y: 104, ref: 62 } as const;

/** A canvas for the page, made once with the desk it lies on. */
export const pageCanvas = (): HTMLCanvasElement => sheet(PAGE.w, PAGE.h);

/**
 * Job 9:2 painted whole onto `canvas`, the phrase highlighted `highlight` of
 * the way, in `style`; returns the highlight's last line, in the page's texels.
 */
export const paintPage = (
  canvas: HTMLCanvasElement,
  highlight: number,
  style: VerseStyle,
  hand: Hand,
): Box => {
  const ctx = canvas.getContext('2d');
  if (ctx === null) return { x: 0, y: 0, w: 0, h: 0 };
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = PAGE.paper;
  ctx.fillRect(0, 0, PAGE.w, PAGE.h);
  // A rule at the head of the page and down its outer edge, as a Bible prints them.
  ctx.fillStyle = PAGE.rule;
  ctx.fillRect(14, 30, PAGE.w - 28, 2);
  ctx.fillRect(14, PAGE.h - 24, PAGE.w - 28, 1);
  write(
    ctx,
    'JOB',
    PAGE.w / 2,
    24,
    { family: fonts.body, size: 13, weight: 700, color: PAGE.rule, align: 'center', tracking: 0.3 },
    STILL,
    { boil: 0 },
  );
  write(
    ctx,
    VERSE.ref,
    TEXT.x,
    TEXT.ref,
    { family: fonts.body, size: 15, weight: 700, color: '#6a5a48' },
    STILL,
    { boil: 0 },
  );
  // The verses round it, as grey lines too small to read: only Job 9:2 is set in words.
  ctx.fillStyle = '#c4b89e';
  for (let row = 0; row < 7; row++) {
    const y = 210 + row * 18;
    ctx.fillRect(TEXT.x, y, PAGE.w - 36 - ((row * 37) % 60), 5);
  }
  return verse(ctx, VERSE, style, { x: TEXT.x, y: TEXT.y, highlight }, hand);
};
