// The narrator of Righteousness by Faith, whose `cold` take this study cuts
// (script.ts): the same voice, so the takes' key matches. The
// study never records; a changed voice here would mark both cuts stale.

import type { Voice } from '@bible/film/core';

export const voice = {
  model: 'eleven_v4',
  settings: { stability: 0.5, similarity: 0.75 },
  voices: [
    /** ElevenLabs "Chris": natural, down to earth. */
    { name: 'lead', voiceId: 'iP95p4xoKVk53GoZ742B' },
  ],
} satisfies Voice;
