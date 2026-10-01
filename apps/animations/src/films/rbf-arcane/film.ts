import { createFilm } from '@bible/film/canvas';
import type { Narrated } from '@bible/film/player';
import { P } from './kit.ts';
import { scenes } from './scenes/index.ts';
import { TITLE } from './script.ts';
export { look } from '../righteousness-by-faith/acts.ts';
export const film = ({ timings, audio }: Narrated) =>
  createFilm({
    title: TITLE,
    paper: { base: P.tealDeep, tone: P.tealDeep, seed: 1888 },
    shade: P.shade,
    palette: P,
    scenes,
    timings,
    audio,
    finish: {
      vignette: 0.3,
      grain: 0.055,
      bloom: { amount: 0.35, radius: 40, threshold: 0.6 },
      grade: {
        shadows: '#287b87',
        highlights: '#ffbf7e',
        split: 0.45,
        contrast: 0.18,
        saturation: 1.05,
      },
    },
  });
