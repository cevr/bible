// Righteousness by Faith — the film.

import { createFilm } from '@bible/film/canvas';
import { type Timings, TimingsJson } from '@bible/film/core';
import { Schema } from 'effect';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';
import { sound } from './sound.ts';

const loadTimings = async (): Promise<Timings | undefined> => {
  const res = await fetch('/films/righteousness-by-faith/narration/timings.json');
  return res.ok ? Schema.decodeSync(TimingsJson)(await res.text()) : undefined;
};

export const film = async () =>
  createFilm({
    title: 'Righteousness by Faith',
    paper: { base: palette.paper, tone: palette.paperTone, seed: 1888 },
    shade: palette.tealDeep,
    scenes,
    timings: await loadTimings(),
    audio: '/films/righteousness-by-faith/narration/full.mp3',
    sound,
    captions: { font: `500 38px "${fonts.body}"`, color: palette.ink, plate: palette.robe },
  });
