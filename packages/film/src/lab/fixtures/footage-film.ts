// A film that reads footage, for the footage tests: one scene of a
// numbered clip (`numbered-frames.ts`) drawn whole, with one seam: the film
// plays the clip from its start until `SEAM` seconds, then jumps `JUMP`
// seconds on in the clip, as a talk's cut does. Each frame reads the clip
// at the middle of the source frame its edit names, and draws exactly that
// frame; one drawn without its footage is all white (every bar a one,
// 1023), which no frame it reads shows.

import { Option } from 'effect';
import { type Film, createFilm } from '../../canvas/film.ts';
import { CLIP_H, CLIP_W } from './numbered-frames.ts';

/** The footage film's name in its registry. */
export const FOOTAGE = 'footage';

/** The clip it reads, as the library names a source (`<name>/<sha12>`). */
export const FOOTAGE_SOURCE = 'clip.numbered/0123456789ab';

/** Its rate, and its clip's. */
export const FOOTAGE_FPS = 30;

/** Its length in frames. */
const FOOTAGE_FRAMES = 120;

/** Where its seam falls, in film frames, and how far on in the clip it jumps there. */
const SEAM = 60;
const JUMP = 30;

/** The clip's frames the film needs: up to the last frame read after the jump. */
export const FOOTAGE_CLIP_FRAMES = FOOTAGE_FRAMES + JUMP;

/** The source frame film frame `i` shows: the clip's own up to the seam, `JUMP` on after it. */
export const sourceFrameOf = (i: number): number => i + JUMP * Number(i >= SEAM);

/** The footage film, laid out afresh. */
export const footageFilm = (): Film => {
  const base = createFilm({
    title: 'Footage',
    width: CLIP_W,
    height: CLIP_H,
    fps: FOOTAGE_FPS,
    paper: { base: '#f4ecd8', tone: '#2a2520', seed: 1 },
    shade: '#000',
    scenes: [{ id: 'take', say: 'A take.', draw: () => {}, drift: 0 }],
  });
  const readAt = (T: number) => ({
    source: FOOTAGE_SOURCE,
    at: (sourceFrameOf(Math.round(T * FOOTAGE_FPS)) + 0.5) / FOOTAGE_FPS,
  });
  return {
    ...base,
    duration: FOOTAGE_FRAMES / FOOTAGE_FPS,
    footageAt: (T) => [readAt(T)],
    render: (ctx, T, opts) =>
      Option.match(Option.fromUndefinedOr(opts?.footage?.frame(readAt(T))), {
        onNone: () => {
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, CLIP_W, CLIP_H);
        },
        onSome: (frame) => ctx.drawImage(frame, 0, 0, CLIP_W, CLIP_H),
      }),
  };
};
