// Righteousness by Faith: the rebuild, read by one narrator.

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
      // The question and the problem: the cool page to the peach garden.
      from: 'cold',
      name: 'cold open',
      chapter: 'How should man be just with God?',
      luma: [140, 165],
      saturation: [0.15, 0.25],
    },
    {
      // The answer's shape, and the two stories that count it.
      from: 'message',
      name: 'message',
      chapter: 'So what was the message?',
      luma: [135, 150],
      saturation: [0.2, 0.3],
    },
    {
      // The first gift: down to black on the dark world, and back up to dawn.
      from: 'spoke',
      name: 'faith',
      chapter: 'Where does faith come from?',
      luma: [135, 150],
      saturation: [0.2, 0.3],
    },
    {
      // The second gift: the valley, and its one black moment at the cross.
      from: 'declared',
      name: 'forgiveness',
      chapter: "Isn't that a cover-up?",
      luma: [90, 110],
      dark: 0.05,
    },
    {
      // The third gift: early gold.
      from: 'within',
      name: 'power',
      chapter: 'So is the law out of the picture?',
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
