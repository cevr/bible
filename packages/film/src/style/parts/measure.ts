// The numbers a part is measured in, as schemas: a length or a place in a
// figure's units (Board pixels at rest, as its rig has them), a point, an
// outline (three points or more, not all at one point or on one line), a
// share and an opacity; and an outline cut from its corners, no two in turn
// at one point, each rounded by its radius. Pure.

import { Schema } from 'effect';

/** A place or a length in the figure's units: any finite number. */
export const Units = Schema.Finite;

/** A length in the figure's units that is more than nothing. */
export const Length = Schema.Finite.check(Schema.isGreaterThan(0));

/** A point in the figure's units, (x, y), y down. */
export const Point = Schema.Tuple([Schema.Finite, Schema.Finite]);

/** How far a point may lie off its outline's line, as a share of the outline's span, and still lie on it: float error, no more. */
// oxlint-disable-next-line film/one-clock-epsilon -- a share of an outline's span, no time
const FLAT = 1e-9;

/**
 * An outline's points do not all lie at one point or on one line. They all
 * lie at one point when each lies at the first, and on one line when none
 * lies off the line through the first and the point farthest from it by
 * more than `FLAT` of the span between those two, so float error in a
 * line's numbers does not take its points off it. That is all it checks: an
 * outline that runs out and back along itself is taken. An outline of fewer
 * than three points is refused by its length alone.
 */
const notOnOneLine = Schema.makeFilter((pts: ReadonlyArray<readonly [number, number]>) => {
  const [first, ...rest] = pts;
  if (first === undefined || rest.length < 2) return true;
  const span = (p: readonly [number, number]) => Math.hypot(p[0] - first[0], p[1] - first[1]);
  const far = rest.reduce((a, p) => (span(p) > span(a) ? p : a), first);
  const reach = span(far);
  if (reach === 0)
    return `its points all lie at (${first[0]}, ${first[1]}), so it encloses no area`;
  const [dx, dy] = [far[0] - first[0], far[1] - first[1]];
  const off = (p: readonly [number, number]) =>
    Math.abs(dx * (p[1] - first[1]) - dy * (p[0] - first[0])) / reach;
  return rest.some((p) => off(p) > FLAT * reach)
    ? true
    : 'its points all lie on one line, so it encloses no area';
});

/**
 * An outline in the figure's units: three points or more, not all at one
 * point or on one line (`notOnOneLine`), closed from the last back to the
 * first.
 */
export const Outline = Schema.Array(Point).check(Schema.isMinLength(3), notOnOneLine);

/**
 * The corners an outline is cut from, in the figure's units: three or more,
 * not all on one line, no two in turn at one point, so each is rounded along
 * an edge either side of it.
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
