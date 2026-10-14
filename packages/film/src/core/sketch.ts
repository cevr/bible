// A sketch drawn over a storyboard panel, as pure data: the shapes a note
// carries (a pen stroke, an arrow, a rectangle, an ellipse, a text pinned to
// a point), each in one of three inks, in the panel's own fractions (0 at its
// left or top edge, 1 at its right or bottom), so a sketch lands where it was
// drawn at any size the panel is shown. Beside the schema: the geometry the
// surface hit-tests and moves shapes by, measured in a view of a given size,
// so a tolerance is in the pixels the hand sees. Pure and DOM-free.

import { Array as Arr, Match, Schema } from 'effect';
import type { Option } from 'effect';

/** The sketch's inks: ink for a drawing, red for a correction, gold to point at what works. */
const SketchInk = Schema.Literals(['ink', 'red', 'gold']);
export type SketchInk = typeof SketchInk.Type;

/** A point of the panel, in its fractions (a shape may run a little past an edge). */
const SketchPoint = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  /** The pen's pressure, 0–1, where the device gave one. */
  p: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
});
export type SketchPoint = typeof SketchPoint.Type;

const Common = { id: Schema.String, ink: SketchInk };

/** A box of the panel, in its fractions, from its top-left corner. */
const Box = {
  x: Schema.Finite,
  y: Schema.Finite,
  w: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  h: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
};

/** One shape of a sketch. */
export const SketchItem = Schema.Union([
  /** A freehand stroke: its points in the order drawn (one point is a dot). */
  Schema.TaggedStruct('Pen', { ...Common, points: Schema.NonEmptyArray(SketchPoint) }),
  /** An arrow from its tail to its head. */
  Schema.TaggedStruct('Arrow', { ...Common, from: SketchPoint, to: SketchPoint }),
  Schema.TaggedStruct('Rect', { ...Common, ...Box }),
  Schema.TaggedStruct('Ellipse', { ...Common, ...Box }),
  /** Words pinned to a point (their top-left). */
  Schema.TaggedStruct('Text', {
    ...Common,
    at: SketchPoint,
    text: Schema.String.check(Schema.isNonEmpty()),
  }),
]).pipe(Schema.toTaggedUnion('_tag'));
export type SketchItem = typeof SketchItem.Type;

/** The view a sketch is measured in: the panel's size on screen, in pixels. */
export interface View {
  readonly w: number;
  readonly h: number;
}

/** A point in view pixels. */
interface Px {
  readonly x: number;
  readonly y: number;
}

const toPx = (view: View, p: Pick<SketchPoint, 'x' | 'y'>): Px => ({
  x: p.x * view.w,
  y: p.y * view.h,
});

/** How far along the segment from `a` (by `dx`, `dy`, of squared length `len`) `p` falls nearest, 0 to 1. */
const along = (p: Px, a: Px, dx: number, dy: number, len: number): number => {
  if (len === 0) return 0;
  return Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
};

/** Distance from `p` to the segment `a`–`b`, in pixels. */
const toSegment = (p: Px, a: Px, b: Px): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = along(p, a, dx, dy, len);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/** Distance from `p` to a polyline's nearest segment (a single point: to it). */
const toPolyline = (p: Px, points: ReadonlyArray<Px>): number => {
  if (points.length === 1) {
    const only = points[0] ?? p;
    return Math.hypot(p.x - only.x, p.y - only.y);
  }
  return Arr.reduce(Arr.range(1, points.length - 1), Infinity, (best, i) =>
    Math.min(best, toSegment(p, points[i - 1] ?? p, points[i] ?? p)),
  );
};

/** How wide a text's box runs per character and how tall a line is, in view pixels per pixel of type. */
const TEXT_SIZE = { em: 0.6, line: 1.3 } as const;

/** The type size a text shape is drawn at, as a share of the view's height. */
export const TEXT_SHARE = 0.045;

/** A shape's box in view pixels: what a select brush and a move read. */
const boundsOf = (view: View, item: SketchItem) =>
  Match.valueTags(item, {
    Pen: (s) => {
      const px = s.points.map((p) => toPx(view, p));
      const xs = px.map((p) => p.x);
      const ys = px.map((p) => p.y);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs),
        h: Math.max(...ys) - Math.min(...ys),
      };
    },
    Arrow: (s) => {
      const a = toPx(view, s.from);
      const b = toPx(view, s.to);
      return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        w: Math.abs(b.x - a.x),
        h: Math.abs(b.y - a.y),
      };
    },
    Rect: (s) => ({ x: s.x * view.w, y: s.y * view.h, w: s.w * view.w, h: s.h * view.h }),
    Ellipse: (s) => ({ x: s.x * view.w, y: s.y * view.h, w: s.w * view.w, h: s.h * view.h }),
    Text: (s) => {
      const size = TEXT_SHARE * view.h;
      const lines = s.text.split('\n');
      const widest = Math.max(...lines.map((l) => l.length));
      return {
        x: s.at.x * view.w,
        y: s.at.y * view.h,
        w: widest * size * TEXT_SIZE.em,
        h: lines.length * size * TEXT_SIZE.line,
      };
    },
  });

/** Distance from `p` to an ellipse's outline inside box `b`, near enough for a hit test (pixels). */
const toEllipse = (p: Px, b: { x: number; y: number; w: number; h: number }): number => {
  const rx = b.w / 2;
  const ry = b.h / 2;
  if (rx === 0 || ry === 0) return toSegment(p, { x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h });
  const cx = b.x + rx;
  const cy = b.y + ry;
  const angle = Math.atan2((p.y - cy) / ry, (p.x - cx) / rx);
  const on = { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
  return Math.hypot(p.x - on.x, p.y - on.y);
};

/**
 * Whether the view point `at` touches `shape` within `tolerance` pixels: a
 * stroke, an arrow or an outline by its line (an open shape's middle is not
 * the shape: a press there goes through to what is under it), a text by its
 * box.
 */
const hits = (view: View, item: SketchItem, at: Px, tolerance: number): boolean =>
  Match.valueTags(item, {
    Pen: (s) =>
      toPolyline(
        at,
        s.points.map((p) => toPx(view, p)),
      ) <= tolerance,
    Arrow: (s) => toSegment(at, toPx(view, s.from), toPx(view, s.to)) <= tolerance,
    Rect: () => {
      const b = boundsOf(view, item);
      const corners = [
        { x: b.x, y: b.y },
        { x: b.x + b.w, y: b.y },
        { x: b.x + b.w, y: b.y + b.h },
        { x: b.x, y: b.y + b.h },
      ];
      return (
        Arr.range(0, 3).some(
          (i) => toSegment(at, corners[i] ?? at, corners[(i + 1) % 4] ?? at) <= tolerance,
        ) || false
      );
    },
    Ellipse: () => toEllipse(at, boundsOf(view, item)) <= tolerance,
    Text: () => {
      const b = boundsOf(view, item);
      return (
        at.x >= b.x - tolerance &&
        at.x <= b.x + b.w + tolerance &&
        at.y >= b.y - tolerance &&
        at.y <= b.y + b.h + tolerance
      );
    },
  });

/** The topmost shape (drawn last) the view point `at` touches, if any. */
export const itemAt = (
  view: View,
  items: ReadonlyArray<SketchItem>,
  at: Px,
  tolerance: number,
): Option.Option<SketchItem> => Arr.findLast(items, (s) => hits(view, s, at, tolerance));

/** Whether `shape`'s box lies inside the view box `brush` (a marquee selects what it wholly holds). */
export const inside = (
  view: View,
  item: SketchItem,
  brush: { x: number; y: number; w: number; h: number },
): boolean => {
  const b = boundsOf(view, item);
  return (
    b.x >= brush.x &&
    b.y >= brush.y &&
    b.x + b.w <= brush.x + brush.w &&
    b.y + b.h <= brush.y + brush.h
  );
};

/** `shape` moved by `dx`, `dy` panel fractions. */
export const moved = (item: SketchItem, dx: number, dy: number): SketchItem => {
  const by = <P extends SketchPoint>(p: P): P => ({ ...p, x: p.x + dx, y: p.y + dy });
  return Match.valueTags(item, {
    Pen: (s): SketchItem => ({
      ...s,
      points: [by(s.points[0]), ...s.points.slice(1).map(by)],
    }),
    Arrow: (s): SketchItem => ({ ...s, from: by(s.from), to: by(s.to) }),
    Rect: (s): SketchItem => ({ ...s, x: s.x + dx, y: s.y + dy }),
    Ellipse: (s): SketchItem => ({ ...s, x: s.x + dx, y: s.y + dy }),
    Text: (s): SketchItem => ({ ...s, at: by(s.at) }),
  });
};

/** What a sketch holds, said in a few words for a terminal line: `pen 2, arrow 1`. */
export const sketchSummary = (items: ReadonlyArray<SketchItem>): string => {
  const counts = new Map<string, number>();
  for (const s of items) counts.set(s._tag, (counts.get(s._tag) ?? 0) + 1);
  return [...counts].map(([tag, n]) => `${tag.toLowerCase()} ${n}`).join(', ');
};
