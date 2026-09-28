// Who reads the film: one narrator, recorded a beat at a time as one take. He
// asks the viewer's question at each turn and answers it himself. Changing
// any of this re-records every beat.

import type { Voice } from '@bible/film/core';

export const voice = {
  model: 'eleven_v3',
  settings: { stability: 0.5 },
  voices: [
    /** ElevenLabs "Chris": natural, down to earth. */
    { name: 'lead', voiceId: 'iP95p4xoKVk53GoZ742B' },
  ],
} satisfies Voice;
