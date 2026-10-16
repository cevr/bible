// A sketch drawn over a storyboard panel, as pure data: the shapes a note
// carries (a pen stroke, an arrow, a rectangle, an ellipse, a text pinned to
// a point), each in one of three inks, in the panel's own fractions (0 at its
// left or top edge, 1 at its right or bottom), so a sketch lands where it was
// drawn at any size the panel is shown; and a sketch said in a few words.
// Pure and DOM-free.

import { Schema } from 'effect';

/** The sketch's inks: ink for a drawing, red for a correction, gold to point at what works. */
const SketchInk = Schema.Literals(['ink', 'red', 'gold']);
type SketchInk = typeof SketchInk.Type;

/** A point of the panel, in its fractions (a shape may run a little past an edge). */
const SketchPoint = Schema.Struct({
  x: Schema.Finite,
  y: Schema.Finite,
  /** The pen's pressure, 0–1, where the device gave one. */
  p: Schema.optionalKey(Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1 }))),
});
type SketchPoint = typeof SketchPoint.Type;

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

/** What a sketch holds, said in a few words for a terminal line: `pen 2, arrow 1`. */
export const sketchSummary = (items: ReadonlyArray<SketchItem>): string => {
  const counts = new Map<string, number>();
  for (const s of items) counts.set(s._tag, (counts.get(s._tag) ?? 0) + 1);
  return [...counts].map(([tag, n]) => `${tag.toLowerCase()} ${n}`).join(', ');
};
