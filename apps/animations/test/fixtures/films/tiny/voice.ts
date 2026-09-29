// The fixture film's reader: data only, never sent anywhere (the tests run no
// paid call). Its key names the takes in narration/timings.json.

import type { Voice } from '@bible/film/core';

export const voice = {
  voiceId: 'fixture-voice',
  model: 'eleven_v3',
  settings: { stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 },
} satisfies Voice;
