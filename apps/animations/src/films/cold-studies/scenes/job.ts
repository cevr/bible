// Job's question: "Job asked it: “How should man be just with God?”" The
// verse on its page while "Job asked it" is said, its phrase highlighted in
// reading order (`sweep`); the highlight floods out to the whole frame
// landing on {job} (`flood`), and from {job} the full-screen card holds the
// frame to the end (`card`): its words land as they are spoken, "just" the
// payoff (CRAFT rule 1). The engine draws the card in place of the scene and
// the flood over the lit scene (`drawing({ card })`); the look in play draws
// the page and sets the card (`look.ts`).

import { type Box, drawing } from '@bible/film/canvas';
import { lookOf } from '../looks/index.ts';

/** Where this frame's draw left the phrase. */
interface Drawn {
  box: Box;
}

/**
 * The phrase's box as this frame's draw left it: the flood, drawn right after
 * the scene in the same frame, grows from it (scratch, rewritten every frame).
 */
const phrase: Drawn = { box: { x: 0, y: 0, w: 0, h: 0 } };

export const job = drawing({
  timeline: {
    page: { at: 'start', dur: 0.4 },
    sweep: { at: 'speech', until: { cue: 'flood', edge: 'start' } },
    flood: { mark: 'job', dur: 0.45, ends: true },
    card: { mark: 'job', until: { at: 'end' } },
  },
  draw: (f) => {
    phrase.box = lookOf().job(f);
  },
  light: () => lookOf().light ?? { color: '#ffffff', amount: 0 },
  card: {
    cue: 'card',
    from: 'job',
    payoff: 'just',
    flood: { cue: 'flood', from: () => phrase.box },
    draw: (f, words) => lookOf().card(f, words),
  },
});

/** What a look draws Job's verse and the card with. */
export type JobFrame = Parameters<typeof job.draw>[0];
