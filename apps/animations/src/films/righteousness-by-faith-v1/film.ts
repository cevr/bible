// Righteousness by Faith, the first cut. The tests pin its takes, score and mix; it stays for A/B with the rebuild.

import { type Film, createFilm } from '@bible/film/canvas';
import { type Timings, TimingsJson } from '@bible/film/core';
import { Schema } from 'effect';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';
import { sound } from './sound.ts';

const loadTimings = async (): Promise<Timings | undefined> => {
  const res = await fetch('/films/righteousness-by-faith-v1/narration/timings.json');
  return res.ok ? Schema.decodeSync(TimingsJson)(await res.text()) : undefined;
};

/** The first cut over `timings`: what the player loads, and what the tests hold frozen. */
export const firstCut = (timings?: Timings): Film =>
  createFilm({
    title: 'Righteousness by Faith (first cut)',
    paper: { base: palette.paper, tone: palette.paperTone, seed: 1888 },
    shade: palette.tealDeep,
    // Drawn before the paper carried its own grain and before scenes breathed:
    // the screen grain it was cut with, and no drift.
    finish: { grain: 0.09 },
    drift: 0,
    scenes,
    timings,
    audio: '/films/righteousness-by-faith-v1/narration/full.wav',
    sound,
    palette,
    captions: { font: `500 38px "${fonts.body}"`, color: palette.ink, plate: palette.robe },
  });

export const film = async () => firstCut(await loadTimings());
