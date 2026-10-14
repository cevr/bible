// How a sketch's shapes look, in one place for the surface (SVG) and the
// note's still (a canvas, `Path2D` over the same path data): a pen stroke is
// perfect-freehand's outline (MIT; pressure kept where the pen gave it,
// simulated from speed otherwise), filled; an arrow, a rectangle and an
// ellipse are lines of the stroke's width; a text is set at a share of the
// panel's height. Every size is a share of the panel's height, so a sketch
// reads the same at the size it is shown. Pure: path data and numbers.

import { Match } from 'effect';
import { getStroke } from 'perfect-freehand';
import { type SketchInk, TEXT_SHARE, type SketchItem, type View } from '../core/sketch.ts';

/** Each ink's colour: a drawing's ink, a correction's red, a gold for what works. */
export const INK_COLOUR: Readonly<Record<SketchInk, string>> = {
  ink: '#1d1f22',
  red: '#d4332a',
  gold: '#e0a526',
};

/** A line's width, as a share of the panel's height. */
const LINE_SHARE = 0.006;

/** A pen stroke's width, as a share of the panel's height. */
const PEN_SHARE = 0.011;

/** An arrowhead's length, as a share of the panel's height. */
const HEAD_SHARE = 0.03;

/** How wide a line is drawn in a view `view.h` high, in its pixels. */
export const lineWidth = (view: View): number => LINE_SHARE * view.h;

/** How a shape is drawn: a filled outline (a pen stroke), or a line of the stroke's width. */
interface Drawn {
  readonly d: string;
  readonly fill: boolean;
}

const num = (n: number) => Math.round(n * 100) / 100;

/** Path data through `points` (closed for an outline). */
const through = (points: ReadonlyArray<readonly [number, number]>, closed: boolean): string => {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const head = `M${num(first?.[0] ?? 0)} ${num(first?.[1] ?? 0)}`;
  const tail = rest.map(([x, y]) => `L${num(x)} ${num(y)}`).join('');
  return `${head}${tail}${closed ? 'Z' : ''}`;
};

/** The arrowhead's two barbs at `to`, pointing away from `from`. */
const head = (from: readonly [number, number], to: readonly [number, number], size: number) => {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const barb = (turn: number): readonly [number, number] => [
    to[0] - size * Math.cos(angle + turn),
    to[1] - size * Math.sin(angle + turn),
  ];
  return `M${num(barb(0.45)[0])} ${num(barb(0.45)[1])}L${num(to[0])} ${num(to[1])}L${num(barb(-0.45)[0])} ${num(barb(-0.45)[1])}`;
};

/** `item` drawn in a view of `view`'s size, in its pixels; none for a text (it is set, not drawn). */
export const drawnOf = (view: View, item: SketchItem): Drawn =>
  Match.valueTags(item, {
    Pen: (s) => {
      const stroke = getStroke(
        s.points.map((p) => ({ x: p.x * view.w, y: p.y * view.h, pressure: p.p ?? 0.5 })),
        {
          size: PEN_SHARE * view.h,
          thinning: 0.6,
          smoothing: 0.5,
          streamline: 0.4,
          simulatePressure: s.points.every((p) => p.p === undefined),
          last: true,
        },
      );
      return { d: through(stroke, true), fill: true };
    },
    Arrow: (s) => {
      const from = [s.from.x * view.w, s.from.y * view.h] as const;
      const to = [s.to.x * view.w, s.to.y * view.h] as const;
      return {
        d: `${through([from, to], false)}${head(from, to, HEAD_SHARE * view.h)}`,
        fill: false,
      };
    },
    Rect: (s) => {
      const [x, y, w, h] = [s.x * view.w, s.y * view.h, s.w * view.w, s.h * view.h];
      return {
        d: through(
          [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
          ],
          true,
        ),
        fill: false,
      };
    },
    Ellipse: (s) => {
      const rx = (s.w * view.w) / 2;
      const ry = (s.h * view.h) / 2;
      const cx = s.x * view.w + rx;
      const cy = s.y * view.h + ry;
      return {
        d: `M${num(cx - rx)} ${num(cy)}A${num(rx)} ${num(ry)} 0 1 0 ${num(cx + rx)} ${num(cy)}A${num(rx)} ${num(ry)} 0 1 0 ${num(cx - rx)} ${num(cy)}Z`,
        fill: false,
      };
    },
    Text: () => ({ d: '', fill: false }),
  });

/** The type size a text is set at in a view of `view`'s size. */
export const textSize = (view: View): number => TEXT_SHARE * view.h;

/** `items` painted on `ctx` over a `w` × `h` frame (the note's still): each as the surface draws it. */
export const paintSketch = (
  ctx: CanvasRenderingContext2D,
  items: ReadonlyArray<SketchItem>,
  w: number,
  h: number,
) => {
  const view = { w, h };
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth(view);
  for (const item of items) {
    const colour = INK_COLOUR[item.ink];
    if (item._tag === 'Text') {
      ctx.fillStyle = colour;
      ctx.font = `600 ${textSize(view)}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      for (const [i, line] of item.text.split('\n').entries())
        ctx.fillText(line, item.at.x * w, item.at.y * h + i * textSize(view) * 1.3);
      continue;
    }
    const drawn = drawnOf(view, item);
    const path = new Path2D(drawn.d);
    if (drawn.fill) {
      ctx.fillStyle = colour;
      ctx.fill(path);
    } else {
      ctx.strokeStyle = colour;
      ctx.stroke(path);
    }
  }
  ctx.restore();
};
