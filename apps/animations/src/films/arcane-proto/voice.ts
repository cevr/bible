// Who would read the film. The look prototype is silent: no beat says a word,
// so no take is ever recorded; the tools still read a voice for every film.

import type { Voice } from '@bible/film/core';

export const voice = {
  model: 'eleven_v4',
  settings: { stability: 0.5, similarity_boost: 0.75 },
  voiceId: 'iP95p4xoKVk53GoZ742B',
} satisfies Voice;
