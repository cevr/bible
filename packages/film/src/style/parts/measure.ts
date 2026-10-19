// The numbers a part is measured in, as schemas: a length or a place in a
// figure's units (Board pixels at rest, as its rig has them), a point, an
// outline, a share and an opacity; and an outline cut from its corners, no
// two in turn at one point, each rounded by its radius. Pure.

import { Schema } from 'effect';

/** A place or a length in the figure's units: any finite number. */
export const Units = Schema.Finite;

/** A length in the figure's units that is more than nothing. */
export const Length = Schema.Finite.check(Schema.isGreaterThan(0));

/** A point in the figure's units, (x, y), y down. */
export const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

/** An outline in the figure's units: three points or more, closed from the last back to the first. */
export const Outline = Schema.Array(Point).check(Schema.isMinLength(3));

/**
 * The corners an outline is cut from, in the figure's units: three or more,
 * no two in turn at one point, so each is rounded along an edge either side
 * of it.
 */
export const Corners = Outline.check(
  Schema.makeFilter((corners: ReadonlyArray<readonly [number, number]>) => {
    const at = corners.findIndex((c, i) => {
      const next = corners[(i + 1) % corners.length] ?? c;
      return c[0] === next[0] && c[1] === next[1];
    });
    return at < 0
      ? true
      : `corners ${at} and ${(at + 1) % corners.length} lie at one point: a corner is rounded along its edges`;
  }),
);

/** A share of a whole, more than nothing and less than all. */
export const Share = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1, exclusiveMinimum: true, exclusiveMaximum: true }),
);

/** An opacity: more than none, and at most whole. */
export const Opacity = Schema.Finite.check(
  Schema.isBetween({ minimum: 0, maximum: 1, exclusiveMinimum: true }),
);

/** An outline cut from its corners: one radius rounds them all, or each corner takes its own, in turn. */
export const oneRadiusOrEach = Schema.makeFilter(
  (cut: { readonly corners: ReadonlyArray<unknown>; readonly radii: ReadonlyArray<unknown> }) =>
    cut.radii.length === 1 || cut.radii.length === cut.corners.length
      ? true
      : `${cut.radii.length} radii for ${cut.corners.length} corners: give one, or one for each`,
);
