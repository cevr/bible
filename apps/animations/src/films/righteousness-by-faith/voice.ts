// Who reads the film, and how. Changing any of this re-records every beat.

import type { Voice } from '@bible/film/core';

export const voice = {
  /** ElevenLabs "George" — warm British storyteller. */
  voiceId: 'JBFqnCBsd6RMkjVDRZzb',
  model: 'eleven_v3',
  settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, speed: 1 },
} satisfies Voice;
