// In Its Order: The Path of the Just's opener, read by one narrator.

import { createFilm } from '@bible/film/canvas';
import type { Narrated } from '@bible/film/player';
import { CARD_STYLE, VERSE_STYLE } from './card.ts';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';
import { TITLE } from './script.ts';

/** The film's acts and colour script (`acts.ts`), read by `film check`, `film lookbook` and `film chapters`. */
export { look } from './acts.ts';

/** The film, from its narration as the framework loads it (`narratedFilms`). */
export const film = ({ timings, audio }: Narrated) =>
  createFilm({
    title: TITLE,
    paper: { base: palette.paper, tone: palette.paperTone, seed: 1844 },
    shade: palette.boardDeep,
    scenes,
    timings,
    audio,
    palette,
    captions: { font: `500 38px "${fonts.body}"`, color: palette.ink, plate: palette.robe },
    card: { style: CARD_STYLE, verse: VERSE_STYLE },
  });
