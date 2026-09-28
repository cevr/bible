// Vertical shorts cut from the film: each one spans of its scenes, by marks
// and cues, played back to back at 1080×1920 (`film render <film> --short <id>`).

import type { Shorts } from '@bible/film/core';

export const shorts = [
  {
    id: 'verdict',
    title: "Is God's verdict a cover-up?",
    hook: "Is God's verdict a cover-up?",
    spans: [
      // The evidence dropping (the first motion, so the open moves), "righteous",
      // "That is a cover-up", "God justifies the ungodly".
      { scene: 'cold', from: { mark: 'evidence' }, to: { mark: 'oldest' } },
      // Paul's answer: not only counted righteous, made righteous.
      { scene: 'declared', from: { mark: 'paul' }, to: { scene: 'speechEnd' } },
      // Job's question asked again, and answered: "How should man be just with
      // God? … By taking God at his word … it is not a cover-up. He makes it
      // true": the stamp lands solid.
      { scene: 'name', from: { mark: 'how' }, to: { mark: 'jer' } },
    ],
  },
  {
    id: 'mirror',
    title: "You can't wash your face with a mirror",
    hook: "You can't wash your face with a mirror.",
    spans: [
      // Fig leaves, trying harder, "How is that going?", the rags, the law as a
      // mirror: "you cannot wash your face with a mirror".
      { scene: 'mirror', from: { mark: 'fig' }, to: { scene: 'speechEnd' } },
      // The turn's answer: "So what does faith do? … the hand that takes hold of Christ."
      { scene: 'look', from: { scene: 'speech' }, to: { mark: 'desert' } },
    ],
  },
] as const satisfies Shorts;
