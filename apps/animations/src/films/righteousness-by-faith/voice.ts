// Who reads the film: two voices in conversation, recorded a beat at a time
// as one dialogue take. `lead` explains; `ask` is the viewer beside him, and
// takes the line with `{@ask}`. Changing any of this re-records every beat.

import type { Voice } from '@bible/film/core';

export const voice = {
  model: 'eleven_v3',
  settings: { stability: 0.5 },
  voices: [
    /** ElevenLabs "Chris": natural, down to earth. */
    { name: 'lead', voiceId: 'iP95p4xoKVk53GoZ742B' },
    /** ElevenLabs "Will": young, relaxed, curious. */
    { name: 'ask', voiceId: 'bIHbv24MWmeRgasZH58o' },
  ],
} satisfies Voice;
