// A film of many short scenes with long names, as a real film's are: the
// second film of the render page's registry and the studio's test page's
// (`render-page.ts`, `player-page.ts`). It carries captions.

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
 * The opening's longer line, so the short scenes after it start late. Its
 * mark is a word in.
 */
const SAYS = new Map([
  [
    'opening-question',
    'A {first}longer opening line that runs on for a while, so that the short scenes after it sit late in the first line of the tape.',
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
    captions: { font: '20px sans-serif', color: '#000', plate: '#fff' },
    scenes: NAMES.map((id) => ({
      id,
      say: SAYS.get(id) ?? 'One short line.',
      ...plain,
      drift: 0,
    })),
  });
