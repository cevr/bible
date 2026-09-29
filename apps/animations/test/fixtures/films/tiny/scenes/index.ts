// The fixture film: three short beats the framework's tests drive through the
// CLI, the mix and the lab's locator, so no test depends on a real film. Each
// beat is paired with its drawing by id, as a film's registry does.

import type { SceneSpec } from '@bible/film/canvas';
import { close, open, turn_ } from './beats.ts';

const drawings = { open, turn: turn_, close };

export const scenes: SceneSpec[] = [
  // Held long enough for the score's first act (acts run 3 s or more).
  { id: 'open', say: 'A small page {begins}begins here.', min: 3.5, ...drawings.open },
  { id: 'turn', say: 'Then the {page}page turns over.', ...drawings.turn },
  { id: 'close', say: 'And it ends.', ...drawings.close },
];
