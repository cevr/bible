// How a numbered clip's frame says its number (`numbered-clip.ts`): `BITS`
// bars across the picture, white for a one and black for a zero, most
// significant first. Its own module, so the browser's footage film
// (`footage-film.ts`) reads it without the Bun-only clip maker.

/** How many bars a frame's number is written in: frames 0 to 1023. */
export const BITS = 10;
/** The clip's size: each bar 32 px wide. */
export const CLIP_W = 320;
export const CLIP_H = 180;

/** A number from bar lumas (0–255), most significant first: a bar over the middle grey is a one. */
export const numberOf = (bars: ReadonlyArray<number>): number =>
  bars.reduce((n, luma) => n * 2 + Number(luma > 128), 0);
