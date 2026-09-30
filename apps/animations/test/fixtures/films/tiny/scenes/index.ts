// The fixture film: three short beats the framework's tests drive through the
// CLI, the mix and the lab's locator, so no test depends on a real film. Each
// beat is paired with its drawing by id through `scenesOf`, as a film's
// registry does (a drawing keyed by an id the script lacks does not compile).

import { type SceneSpec, scenesOf } from '@bible/film/canvas';
import { defineScript } from '@bible/film/core';
import { close, open, turn_ } from './beats.ts';

/** What the fixture says, beat by beat. */
const script = defineScript([
  // Held long enough for the score's first act (acts run 3 s or more).
  {
    id: 'open',
    say: 'A small page {begins}begins here.',
    picture: 'A band of paper rises on "begins".',
    min: 3.5,
  },
  { id: 'turn', say: 'Then the {page}page turns over.', picture: 'A card folds over.' },
  { id: 'close', say: 'And it ends.', picture: 'The last page.' },
]);

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: { open, turn: turn_, close },
  card: { brief: 'serif', label: 'sans-serif' },
});
