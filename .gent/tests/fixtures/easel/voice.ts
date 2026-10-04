// The synthetic film's reader: data only, never sent anywhere.

import type { Voice } from '@bible/film/core';

export const voice = {
  model: 'eleven_v4',
  settings: { stability: 0.5, similarity: 0.75 },
  voices: [{ name: 'lead', voiceId: 'fixture-voice' }],
} satisfies Voice;
