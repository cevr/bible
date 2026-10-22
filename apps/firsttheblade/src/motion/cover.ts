/**
 * Where a picture drawn `object-fit: cover` lands in its box, so a canvas
 * laid over the box samples the picture at the very place the picture shows
 * it (`./scene.ts`).
 */

/** A width and a height, in any one unit. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Where the picture sits in its box, each a share from 0 (left, top) to 1 (right, bottom). */
export interface Position {
  readonly x: number;
  readonly y: number;
}

const CENTRE: Position = { x: 0.5, y: 0.5 };

/**
 * A computed `object-position` read as shares: two percentages, as the
 * site's stylesheet writes it (`38% 60%`). Any other form is read as the
 * centre, the browser's own default.
 */
export const positionOf = (computed: string): Position => {
  const found = /^\s*(-?[\d.]+)%\s+(-?[\d.]+)%\s*$/.exec(computed);
  if (!found) return CENTRE;
  return { x: Number(found[1]) / 100, y: Number(found[2]) / 100 };
};

/**
 * The map from the box's uv (0 to 1 across and down the box) to the
 * picture's: the picture's uv is the box's times the first two numbers, plus
 * the last two.
 */
export const coverMap = (box: Size, picture: Size, position: Position) => {
  const scale = Math.max(box.width / picture.width, box.height / picture.height);
  const drawn = { width: picture.width * scale, height: picture.height * scale };
  const left = (box.width - drawn.width) * position.x;
  const top = (box.height - drawn.height) * position.y;
  return [
    box.width / drawn.width,
    box.height / drawn.height,
    -left / drawn.width,
    -top / drawn.height,
  ] as const;
};
