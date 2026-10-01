import { createFilm } from '@bible/film/canvas';
import type { Narrated } from '@bible/film/player';
import { palette } from './palette.ts';
import { scenes } from './scenes/index.ts';
import { TITLE } from './script.ts';

export const film = ({ timings, audio }: Narrated) =>
  createFilm({
    title: TITLE,
    paper: { base: palette.shade, tone: palette.shade, seed: 12 },
    shade: palette.shade,
    finish: {
      vignette: 0.5,
      grain: 0.07,
      bloom: { amount: 0.6, radius: 48, threshold: 0.55 },
      grade: {
        shadows: '#1f7f8c',
        highlights: '#ffb067',
        split: 0.5,
        contrast: 0.3,
        saturation: 1.08,
      },
    },
    palette,
    scenes,
    timings,
    audio,
  });
