// Righteousness by Faith — the film.

import { createFilm } from '../../engine/film.ts';
import type { Timings } from '../../engine/narration.ts';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';

const loadTimings = async (): Promise<Timings | undefined> => {
  const res = await fetch('/films/righteousness-by-faith/narration/timings.json');
  return res.ok ? ((await res.json()) as Timings) : undefined;
};

export const film = async () =>
  createFilm({
    title: 'Righteousness by Faith',
    paper: { base: palette.paper, tone: palette.paperTone, seed: 1888 },
    shade: palette.tealDeep,
    scenes,
    timings: await loadTimings(),
    audio: '/films/righteousness-by-faith/narration/full.mp3',
    captions: { font: `500 38px "${fonts.body}"`, color: palette.ink, plate: palette.robe },
  });
