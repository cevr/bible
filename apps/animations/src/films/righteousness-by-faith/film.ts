// Righteousness by Faith: the rebuild, read by two voices.

import { createFilm } from '@bible/film/canvas';
import { type Timings, TimingsJson } from '@bible/film/core';
import { Schema } from 'effect';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';

const loadTimings = async (): Promise<Timings | undefined> => {
  const res = await fetch('/films/righteousness-by-faith/narration/timings.json');
  return res.ok ? Schema.decodeSync(TimingsJson)(await res.text()) : undefined;
};

export const film = async () =>
  createFilm({
    title: 'Righteousness by Faith',
    paper: { base: palette.paper, tone: palette.paperTone, seed: 1888 },
    shade: palette.boardDeep,
    scenes,
    timings: await loadTimings(),
    audio: '/films/righteousness-by-faith/narration/full.wav',
    palette,
    captions: { font: `500 38px "${fonts.body}"`, color: palette.ink, plate: palette.robe },
    short: {
      hook: { font: `600 64px "${fonts.display}"`, color: palette.ink },
      caption: { font: `600 60px "${fonts.body}"`, color: palette.ink, highlight: palette.gold },
    },
  });
