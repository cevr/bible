// Job's question: "Job asked it: “How should man be just with God?”" The
// verse on its page while "Job asked it" is said, its phrase highlighted in
// reading order (`sweep`); the highlight floods out to the whole frame
// landing on {job} (`flood`), and from {job} the full-screen card holds the
// frame to the end (`card`): its words land as they are spoken, "just" the
// payoff (CRAFT rule 1). The engine draws the card in place of the scene and
// the flood over the lit scene (`drawing({ card })`), grown from the box the
// draw returns on the same frame; the look in play draws the page and sets
// the card (`look.ts`).

import { type Box, drawing } from '@bible/film/canvas';
import { lookOf } from '../looks/index.ts';

export const job = drawing({
  timeline: {
    page: { at: 'start', dur: 0.4 },
    sweep: { at: 'speech', until: { cue: 'flood', edge: 'start' } },
    flood: { mark: 'job', dur: 0.45, ends: true },
    card: { mark: 'job', until: { at: 'end' } },
    // The payoff word said: a look that slams it reads this (it starts where the take's
    // timing starts "just"; the card sets the word at its voice, a breath later or none).
    payoff: { mark: 'job', word: 'just', dur: 0.35 },
  },
  // Its type said, not inferred: a look's frame type is read off this draw (`JobFrame`).
  draw: (f): Box => lookOf().job(f),
  light: () => lookOf().light ?? { color: '#ffffff', amount: 0 },
  card: {
    cue: 'card',
    from: 'job',
    payoff: 'just',
    flood: { cue: 'flood' },
    draw: (f, words) => lookOf().card(f, words),
  },
});

/** What a look draws Job's verse and the card with. */
export type JobFrame = Parameters<typeof job.draw>[0];
