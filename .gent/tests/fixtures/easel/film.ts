// The synthetic film: its scenes on plain paper.

import { createFilm } from '@bible/film/canvas';
import type { Narrated } from '@bible/film/player';
import { scenes } from './scenes/index.ts';

export const film = ({ timings, audio }: Narrated) =>
  createFilm({
    title: 'Easel',
    paper: { base: '#efe6d2', tone: '#d8cbb0', seed: 7 },
    shade: '#2a2420',
    scenes,
    timings,
    audio,
  });
