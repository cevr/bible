// A synthetic film for the painter's tests: two beats, both storyboard cards.

import { defineScript } from '@bible/film/core';

export const script = defineScript([
  { id: 'roof', say: 'A man on a {roof} looks down.', cite: [], picture: 'STORY: a roof.' },
  { id: 'gate', say: 'The {gate} stands open.', cite: [], picture: 'IDEA: a gate.' },
]);
