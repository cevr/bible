// The film's music and effects. The score follows the argument in acts; the
// effects are paper and desk sounds, kept sparse so the voice leads. Each
// effect that hits a picture names the scene's cue, so it lands where the
// drawing does; only page and slide sounds sit at a scene's start. Changing a
// prompt or an act regenerates that asset on the next `bun run score`; gains
// only need a remix.

import type { Sound } from '@bible/film/core';

/** Scenes that open on a new sheet get a page sound. */
const PAGES = ['measure', 'witness', 'centurion', 'exchange', 'hand', 'within', 'name'];
const SLIDES = ['rags', 'justified', 'robe', 'serpent', '1888'];

export const sound: Sound = {
  music: {
    model: 'music_v2_5',
    gain: 0.5,
    styles: [
      'instrumental',
      'felt piano',
      'warm strings',
      'gentle cinematic underscore',
      'slow tempo',
      'reflective',
      'hopeful',
      'sparse and spacious',
    ],
    avoid: [
      'vocals',
      'choir',
      'drums',
      'percussion',
      'electronic beats',
      'synth leads',
      'loud brass',
    ],
    acts: [
      {
        from: 'question',
        name: 'The question',
        styles: ['solo felt piano', 'single notes', 'searching', 'unresolved', 'quiet'],
        avoid: ['strings', 'full chords'],
      },
      {
        from: 'measure',
        name: 'The measure and the failure',
        styles: ['low cello drone', 'sparse piano', 'minor key', 'weight', 'restraint'],
        avoid: ['bright', 'major key resolution'],
      },
      {
        from: 'void',
        name: 'The creating word',
        styles: [
          'wonder',
          'strings slowly rising',
          'piano arpeggios',
          'light breaking',
          'major key',
        ],
      },
      {
        from: 'justified',
        name: 'Declared righteous',
        styles: ['warm full strings', 'piano melody', 'tender', 'grace', 'gently building'],
        avoid: ['bombast'],
      },
      {
        from: 'hand',
        name: 'The empty hand',
        styles: ['intimate piano', 'soft string pad', 'simple melody', 'trust', 'calm'],
      },
      {
        from: '1888',
        name: 'The message',
        styles: ['piano with pizzicato strings', 'forward motion', 'historic', 'earnest'],
      },
      {
        from: 'name',
        name: 'The answer',
        styles: ['full warm strings swell', 'piano theme returns', 'resolved', 'then quiet ending'],
      },
    ],
  },
  effects: {
    page: {
      prompt: 'a single soft paper page turning, dry, close, quiet room',
      secs: 1,
      gain: 0.45,
      at: PAGES.map((scene) => ({ scene, offset: 0.05 })),
    },
    slide: {
      prompt: 'a sheet of thick paper sliding across a wooden desk, soft and short',
      secs: 1,
      gain: 0.4,
      at: SLIDES.map((scene) => ({ scene, offset: 0.05 })),
    },
    stamp: {
      prompt: 'a rubber stamp pressed firmly onto paper on a wooden desk, one dull thud',
      secs: 0.7,
      gain: 0.7,
      at: [
        // Each stamp thuds as it meets the paper.
        { scene: 'witness', cue: 'guilty', edge: 'end' },
        { scene: 'justified', cue: 'slam', edge: 'end' },
        { scene: '1888', cue: 'yearStamp' },
      ],
    },
    tear: {
      prompt: 'old cloth fabric ripping apart, one short tear',
      secs: 1.2,
      gain: 0.55,
      at: [{ scene: 'robe', cue: 'tear' }],
    },
    robe: {
      prompt: 'soft clean linen settling over someone, gentle fabric whoosh',
      secs: 1.6,
      gain: 0.5,
      at: [{ scene: 'robe', cue: 'robeFalls' }],
    },
    coins: {
      prompt: 'a small stack of coins and medals toppling and clattering onto a wooden table',
      secs: 2,
      gain: 0.45,
      at: [{ scene: 'hand', cue: 'topple' }],
    },
    shimmer: {
      prompt: 'a soft warm glockenspiel shimmer, gentle and bright, fading out',
      secs: 2.2,
      gain: 0.4,
      at: [
        { scene: 'void', cue: 'burst' },
        { scene: 'hand', cue: 'shine' },
        { scene: 'name', cue: 'crown' },
      ],
    },
  },
};
