// The fixture sound library: procedural sounds the fixture film places (they
// need no file, so its check and mix are whole), and generated ones only the
// mix test places, over a faked lock. Nothing here is ever sent to
// ElevenLabs.

import { defineLibrary } from '@bible/film/core';

export const library = defineLibrary({
  'paper.page': {
    kind: 'generated',
    prompt: 'a single soft paper page turning',
    secs: 1,
    use: 'one-shot',
    level: -12,
  },
  'paper.fold': {
    kind: 'generated',
    prompt: 'a sheet of paper folding over, one soft crease',
    secs: 0.7,
    use: 'one-shot',
  },
  'amb.hall': {
    kind: 'generated',
    prompt: 'the still air of a small empty stone hall',
    secs: 12,
    loop: true,
    use: 'bed',
  },
  'room.paper': {
    kind: 'procedural',
    recipe: { recipe: 'room', secs: 4 },
    variants: 1,
    use: 'bed',
    level: -36,
    duck: false,
  },
  'tone.chime': {
    kind: 'procedural',
    recipe: { recipe: 'bell', root: 'D5', partials: 'glass', secs: 1 },
    variants: 3,
    use: 'one-shot',
  },
  'tone.notes': {
    kind: 'procedural',
    recipe: { recipe: 'notes', root: 'A4', count: 3, secs: 1 },
    variants: 2,
    use: 'one-shot',
    level: -14,
  },
});

export const store = { kind: 'folder', folder: '~/film-media/fixture-sounds' };
