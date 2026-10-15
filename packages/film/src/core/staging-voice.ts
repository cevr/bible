// The staging voice: the one ElevenLabs voice every film and every series
// draft is staged in until the owner records the final read (owner,
// 2026-10-14: "lets go with A1, a bit faster pace"). One setting: a film's
// `voice.ts` is `stagingVoice`, the lab reads the drafts in it, and a later
// voice (a clone of the owner, say) is this one line changed. Changing it
// marks every staging take stale; a person's take never.

import type { Cast } from './schema.ts';

/**
 * ElevenLabs' designed voice "First the Blade staging" (A1 of the owner's
 * picks). On eleven_v4 it reads about 156 words a minute of its own, inside
 * the delivery rules' 150–165 (measured 2026-10-14; v4 takes no speed, so the
 * pace is the voice's).
 */
export const STAGING_VOICE_ID = 'uklw0mSGyyFcEsdp2z45';

/** The staging voice's own pace on eleven_v4, in words a minute (measured 2026-10-14). */
export const STAGING_VOICE_PACE = 156;

/**
 * The staging voice as a film's `voice.ts` reads it: one narrator, `lead`,
 * through text-to-dialogue on eleven_v4, so a turn (`{@lead}`) and a cast's
 * neighbour stay the same voice and a beat is one take.
 */
export const stagingVoice = {
  model: 'eleven_v4',
  settings: { stability: 0.5, similarity: 0.75 },
  voices: [{ name: 'lead', voiceId: STAGING_VOICE_ID }],
} as const satisfies Cast;
