// The fixture film's score, bed and effects: a score in two acts, room tone
// from the second scene into the last, and effects placed every way a cue can
// place one (a scene's start, a cue's start, a cue's end). The bed and the
// effects are the fixture library's procedural sounds (`fixtures/sounds`), so
// the film needs no generated file; only the score is generated (sound/).

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
  beds: [{ sound: 'room.paper', from: { scene: 'turn' }, to: { scene: 'close', offset: 1 } }],
  effects: {
    page: { sound: 'tone.chime', level: -20, at: [{ scene: 'turn', offset: 0.05 }] },
    fold: {
      sound: 'tone.notes',
      at: [
        { scene: 'open', cue: 'rise' },
        { scene: 'turn', cue: 'fold', edge: 'end' },
      ],
    },
  },
};
