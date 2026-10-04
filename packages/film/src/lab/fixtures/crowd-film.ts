// A film of many short scenes with long names, for the browser tests of the
// tape bar on a phone: at 390 px its scenes are narrower than their names, so
// each name must shorten or drop rather than run into its neighbour's.

import { type Film, createFilm, drawing } from '../../canvas/film.ts';

/** The crowd film's name in its registry and in the player's URLs. */
export const CROWD = 'crowd';

const plain = drawing({
  timeline: {},
  draw: (f) => {
    f.ctx.fillStyle = '#6a5a48';
    f.ctx.fillRect(40, 40, 120, 80);
  },
});

/** Its scenes' names: some long, some short, as a real film's are. */
const NAMES = [
  'opening-question',
  'cold',
  'the-witness-stand',
  'gavel',
  'a-long-silence-after',
  'mirror',
  'the-verdict-read-aloud',
  'pause',
  'courtroom-empties',
  'hall',
  'walking-home-alone',
  'door',
  'the-letter-on-the-table',
  'end',
];

/**
 * The opening's longer line: it pushes the short scenes after it late into a
 * phone's half-minute line of the Scenes' tape, where the last few crowd its
 * end (a name there has no room after its rule, and little before it).
 */
const SAYS = new Map([
  [
    'opening-question',
    'A longer opening line that runs on for a while, so that the short scenes after it sit late in the first line of the tape.',
  ],
]);

/** The crowd film, laid out afresh: each scene one short line, the opening a long one. */
export const crowdFilm = (): Film =>
  createFilm({
    title: 'Crowd',
    width: 640,
    height: 360,
    fps: 30,
    paper: { base: '#f4ecd8', tone: '#2a2520', seed: 1 },
    shade: '#000',
    scenes: NAMES.map((id) => ({
      id,
      say: SAYS.get(id) ?? 'One short line.',
      ...plain,
      drift: 0,
    })),
  });
