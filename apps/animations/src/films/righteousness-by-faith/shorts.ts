// Vertical shorts cut from the film: each one spans of its scenes, by marks
// and cues, played back to back at 1080×1920 (`film render <film> --short <id>`).

import type { Shorts } from '@bible/film/core';

export const shorts = [
  {
    id: 'verdict',
    title: "Is God's verdict a cover-up?",
    hook: "Is God's verdict a cover-up?",
    spans: [
      // The courtroom, "righteous", "That is a cover-up", "God justifies the ungodly".
      { scene: 'cold', from: { scene: 'speech' }, to: { mark: 'oldest' } },
      // Paul's answer: not only counted righteous, made righteous.
      { scene: 'declared', from: { mark: 'paul' }, to: { scene: 'speechEnd' } },
      // "He makes it true": the stamp lands solid.
      { scene: 'name', from: { mark: 'verdict' }, to: { mark: 'jer' } },
    ],
  },
] as const satisfies Shorts;
