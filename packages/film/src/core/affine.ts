// 2D affine transforms as the canvas reports them (`getTransform()`), as six
// numbers: what a frame read a knob under (`KnobRead`). Pure and DOM-free.

/**
 * `[a, b, c, d, e, f]`, as `DOMMatrix` and `setTransform` take it: a point
 * `[x, y]` lands at `[a x + c y + e, b x + d y + f]`.
 */
export type Affine = readonly [number, number, number, number, number, number];

export const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];
