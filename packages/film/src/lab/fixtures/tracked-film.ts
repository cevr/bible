// A film of one scene whose two cues name one track, for the browser tests
// of the strip's tracks: the cues sit apart on its one lane, so a drag of
// the second over the first makes them overlap while it is held (the bar
// keeps its lane until let go). Kept apart from the probe film, whose cues
// name no track and draw a row each, as every film's did before tracks.

import { type Film, createFilm, drawing } from '../../canvas/film.ts';

/** The tracked film's name in its registry and in the lab's URLs. */
export const TRACKED = 'tracked';

/** Its one scene's name. */
export const TRACKED_SCENE = 'duet';

const duet = drawing({
  timeline: {
    lead: { mark: 'lead', dur: 0.6, track: 'pair' },
    echo: { mark: 'echo', dur: 0.6, track: 'pair' },
  },
  draw: (f) => {
    f.ctx.fillStyle = '#6a5a48';
    f.ctx.fillRect(40 + 200 * f.at('lead'), 40 + 80 * f.at('echo'), 120, 80);
  },
});

/** The tracked film, laid out afresh: one scene, its two marks a few words apart. */
export const trackedFilm = (): Film =>
  createFilm({
    title: 'Tracked',
    width: 640,
    height: 360,
    fps: 30,
    paper: { base: '#f4ecd8', tone: '#2a2520', seed: 1 },
    shade: '#000',
    scenes: [
      {
        id: TRACKED_SCENE,
        say: 'The {lead}first one moves, and a few words after it the {echo}second one answers.',
        ...duet,
        drift: 0,
      },
    ],
  });
