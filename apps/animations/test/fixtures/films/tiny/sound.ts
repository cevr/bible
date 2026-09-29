// The fixture film's score and effects: a score in two acts, and effects
// placed every way a cue can place one (a scene's start, a cue's start, a
// cue's end). Only the score is generated (sound/); the effects stay unmade.

import type { Sound } from '@bible/film/core';

export const sound: Sound = {
  music: {
    model: 'music_v2_5',
    gain: 0.5,
    styles: ['instrumental', 'felt piano'],
    avoid: ['vocals'],
    acts: [
      { from: 'open', name: 'The page', styles: ['quiet', 'searching'] },
      { from: 'turn', name: 'The turn', styles: ['resolved'] },
    ],
  },
  effects: {
    page: {
      prompt: 'a single soft paper page turning',
      secs: 1,
      gain: 0.45,
      at: [{ scene: 'turn', offset: 0.05 }],
    },
    fold: {
      prompt: 'a sheet of paper folding over, one soft crease',
      secs: 0.7,
      gain: 0.6,
      at: [
        { scene: 'open', cue: 'rise' },
        { scene: 'turn', cue: 'fold', edge: 'end' },
      ],
    },
  },
};
