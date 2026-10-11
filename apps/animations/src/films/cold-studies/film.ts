// The looks study: Righteousness by Faith's cold open, its first sentences
// and Job's question, drawn in the look `palette.ts` plays.

import { createFilm } from '@bible/film/canvas';
import type { Narrated } from '@bible/film/player';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';
import { TITLE } from './script.ts';

/** The film, from its narration as the framework loads it (`narratedFilms`). */
export const film = ({ timings, audio }: Narrated) =>
  createFilm({
    title: TITLE,
    paper: { base: palette.paper, tone: palette.paperTone, seed: 1888 },
    shade: palette.shade,
    scenes,
    timings,
    audio,
    palette,
    captions: { font: `500 38px "${fonts.body}"`, color: palette.ink, plate: palette.plate },
  });
