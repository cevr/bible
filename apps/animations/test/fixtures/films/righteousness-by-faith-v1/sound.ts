// The first cut's music and effects. Its effects were placed on its canvas
// scenes' named cues; with the scenes retired, each sits at the offset from its
// scene's start that cue resolved to, so the mix places every one where it did.

import type { Sound } from '@bible/film/core';

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
      at: [
        { scene: 'measure', offset: 0.05 },
        { scene: 'witness', offset: 0.05 },
        { scene: 'centurion', offset: 0.05 },
        { scene: 'exchange', offset: 0.05 },
        { scene: 'hand', offset: 0.05 },
        { scene: 'within', offset: 0.05 },
        { scene: 'name', offset: 0.05 },
      ],
    },
    slide: {
      prompt: 'a sheet of thick paper sliding across a wooden desk, soft and short',
      secs: 1,
      gain: 0.4,
      at: [
        { scene: 'rags', offset: 0.05 },
        { scene: 'justified', offset: 0.05 },
        { scene: 'robe', offset: 0.05 },
        { scene: 'serpent', offset: 0.05 },
        { scene: '1888', offset: 0.05 },
      ],
    },
    stamp: {
      prompt: 'a rubber stamp pressed firmly onto paper on a wooden desk, one dull thud',
      secs: 0.7,
      gain: 0.7,
      at: [
        { scene: 'witness', offset: 6.598 }, // was cue guilty.end
        { scene: 'justified', offset: 6.8 }, // was cue slam.end
        { scene: '1888', offset: 0.633 }, // was cue yearStamp
      ],
    },
    tear: {
      prompt: 'old cloth fabric ripping apart, one short tear',
      secs: 1.2,
      gain: 0.55,
      at: [
        { scene: 'robe', offset: 7.77 }, // was cue tear
      ],
    },
    robe: {
      prompt: 'soft clean linen settling over someone, gentle fabric whoosh',
      secs: 1.6,
      gain: 0.5,
      at: [
        { scene: 'robe', offset: 9.91 }, // was cue robeFalls
      ],
    },
    coins: {
      prompt: 'a small stack of coins and medals toppling and clattering onto a wooden table',
      secs: 2,
      gain: 0.45,
      at: [
        { scene: 'hand', offset: 8.14 }, // was cue topple
      ],
    },
    shimmer: {
      prompt: 'a soft warm glockenspiel shimmer, gentle and bright, fading out',
      secs: 2.2,
      gain: 0.4,
      at: [
        { scene: 'void', offset: 10.25 }, // was cue burst
        { scene: 'hand', offset: 16.58 }, // was cue shine
        { scene: 'name', offset: 10.06 }, // was cue crown
      ],
    },
  },
};
