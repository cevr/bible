// The review's browser tests' film code: `toy`, the film the review's fakes
// describe (`fixtures/studio-film.ts`, the Project's tests): four scenes,
// open, close, coda and end, each a page of its own colour with a block in
// its middle, so a still drawn of a scene (`player/stills.ts`) can be told
// from another's by a pixel. Its project (acts, renders, approvals) is the
// fakes'; this is only what the page draws.

import { type Film, createFilm, drawing } from '../../canvas/film.ts';

/** The toy film's name in the review's registry and in its URLs. */
export const TOY = 'toy';

/** Each scene's block colour, by scene, as a still of it shows it in its middle. */
const TOY_COLOURS = {
  open: '#b03a2e',
  close: '#2e6fb0',
  coda: '#3a9a4a',
  end: '#8a5ab0',
} as const;

/** A scene that fills the frame's middle with `colour`. */
const block = (colour: string) =>
  drawing({
    timeline: {},
    draw: (f) => {
      f.ctx.fillStyle = colour;
      f.ctx.fillRect(160, 90, 320, 180);
    },
  });

/** The toy film, laid out afresh: each scene one short line, held still. */
export const toyFilm = (): Film =>
  createFilm({
    title: 'Toy',
    width: 640,
    height: 360,
    fps: 30,
    paper: { base: '#f4ecd8', tone: '#2a2520', seed: 1 },
    shade: '#000',
    scenes: Object.entries(TOY_COLOURS).map(([id, colour]) => ({
      id,
      say: `The ${id} of the toy film, one short line.`,
      ...block(colour),
      drift: 0,
    })),
  });
