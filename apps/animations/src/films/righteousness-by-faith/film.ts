// Righteousness by Faith: the rebuild, read by two voices.

import { createFilm } from '@bible/film/canvas';
import { type Look, type Timings, TimingsJson } from '@bible/film/core';
import { Schema } from 'effect';
import { fonts, palette } from './palette.ts';
import { scenes } from './scenes/index.ts';

/**
 * The film's shape and colour script (CRAFT rule 11): each act from its first
 * scene, the narrator's question that names its chapter, and the light it
 * should measure. `film check` warns outside a target; `film lookbook` prints
 * what each act measures; `film chapters` prints the chapters.
 */
export const look: Look = {
  acts: [
    {
      from: 'cold',
      name: 'cold open',
      chapter: 'How should man be just with God?',
      luma: [150, 165],
      saturation: [0.15, 0.2],
    },
    {
      from: 'message',
      name: 'problem',
      chapter: 'So what was the message?',
      luma: [120, 140],
      saturation: [0.2, 0.3],
    },
    {
      from: 'spoke',
      name: 'valley',
      chapter: 'Where does righteousness come from?',
      luma: [90, 110],
      dark: 0.05,
    },
    {
      from: 'look',
      name: 'power',
      chapter: 'What does faith do?',
      luma: [150, 160],
      saturation: [0.25, 0.35],
    },
    {
      from: 'rain',
      name: 'landing',
      chapter: 'Where was all this heading?',
      luma: [150, 165],
      saturation: [0.3, 0.4],
    },
  ],
};

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
