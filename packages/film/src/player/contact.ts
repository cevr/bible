// The contact sheet: frames of the film tiled six across, 480 px wide and
// 4 px apart on black, composed in the page (`film render --contact`).

/** Tiles across. */
const COLS = 6;
/** A tile's width; its height keeps the frame's shape. */
const TILE_W = 480;
/** Between tiles. */
const GAP = 4;

/**
 * `frames` drawn by `draw` onto `canvas`, one after another, and tiled into a
 * sheet in order, left to right and top to bottom.
 */
export const composeContact = (
  draw: (i: number) => void,
  canvas: HTMLCanvasElement,
  frames: ReadonlyArray<number>,
): HTMLCanvasElement => {
  const tileH = Math.round((TILE_W * canvas.height) / canvas.width);
  const rows = Math.max(1, Math.ceil(frames.length / COLS));
  const sheet = document.createElement('canvas');
  sheet.width = COLS * TILE_W + (COLS - 1) * GAP;
  sheet.height = rows * tileH + (rows - 1) * GAP;
  const ctx = sheet.getContext('2d');
  if (ctx === null) throw new Error('2d context unavailable');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.imageSmoothingQuality = 'high';
  frames.forEach((i, k) => {
    draw(i);
    const x = (k % COLS) * (TILE_W + GAP);
    const y = Math.floor(k / COLS) * (tileH + GAP);
    ctx.drawImage(canvas, x, y, TILE_W, tileH);
  });
  return sheet;
};
