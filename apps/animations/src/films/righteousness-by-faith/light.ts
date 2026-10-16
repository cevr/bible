// The colour script, lit (CRAFT rule 11; `look` in acts.ts holds the acts
// and the targets they are measured against). Each scene is lit by its act's
// light (`membersOf` says which act holds it): a colour over the middle of the
// frame, falling to a deeper one at the corners, so the page dims round the
// subject rather than all over, and gold stays the brightest thing on it. The parchment itself stays the parchment; the light is what
// changes, act by act:
//   - verdict: the sunlit court of the kept panels, a near-white warm light
//     from the high window at the upper left, its corners hardly dimmed and
//     none of the film's vignette, so the judge at his bench in the upper
//     right is lit as the prosecutor is (cold-34 darkens neither);
//   - seed: a hazed noon on the parchment, the dark world's own black in
//     `spoke`;
//   - gifts: the peach afternoon going toward dusk;
//   - grain, the valley: sunset on the hill and the furrow, down to black;
//   - still at work: first light in heaven's sanctuary and its court
//     (`priest`, `accuser`, `robe`), then early gold morning, warm cream;
//   - harvest: teal day, the lightest touch.
// As the ground lifts (`GROUND` in palette.ts), each light lifts with it: its
// edge rises toward its colour by the lift, so the corners fall less far, and
// its colour rises toward white by half the lift, so a deep light (sunset)
// tints the page less. The valley's lights take only part of the lift, so the
// valley rises by about as much as the acts round it and stays as far below
// them. Every act gets lighter and their order and gaps hold.

import { type Hex, type Light, mix } from '@bible/film/canvas';
import { membersOf } from '@bible/film/core';
import { Result } from 'effect';
import { type ActName, look } from './acts.ts';
import { LIFT } from './palette.ts';
import { type BeatId, script } from './script.ts';

/** The share of the lift the valley's lights (sunset, first light) take. */
const VALLEY = 0.5;

/** A light of `color` falling to `edge` at the corners, both raised by `share` of the ground's lift. */
const lit = (color: Hex, edge: Hex, share = 1): Light => {
  const lift = LIFT * share;
  const raised = mix(color, '#ffffff', lift / 2);
  return { color: raised, edge: mix(edge, raised, lift) };
};

/** The film's lights. */
export const LIGHT = {
  // The court: near white, its corners barely warmer, no vignette over it (verdict, above).
  room: { ...lit('#fffcf5', '#f9f4ec'), vignette: 0 },
  dusk: lit('#f2f2f4', '#cccfd8'),
  haze: lit('#e6e8f0', '#aab2c8'),
  sunset: lit('#c8ac9a', '#3e3034', VALLEY),
  firstLight: lit('#d2ccc8', '#4a4652', VALLEY),
  morning: lit('#f0eadf', '#b6aa98'),
  day: lit('#f6f8f7', '#d6e0dd'),
} as const satisfies Record<string, Light>;

/** Each act's light (`acts.ts` declares the acts and the scenes they hold). */
const byAct: Readonly<Record<ActName, Light>> = {
  verdict: LIGHT.room,
  seed: LIGHT.haze,
  gifts: LIGHT.dusk,
  grain: LIGHT.sunset,
  'still at work': LIGHT.morning,
  harvest: LIGHT.day,
};

/**
 * The scenes lit apart from their act: dawn after the black, in heaven's
 * sanctuary and its court. A light that changes on a scene's own cue is that
 * drawing's `light`, typed by its cues.
 */
const byScene: Partial<Record<BeatId, Light>> = {
  priest: LIGHT.firstLight,
  accuser: LIGHT.firstLight,
  robe: LIGHT.firstLight,
};

/** Each scene's act light. */
const byActOf: ReadonlyMap<string, Light> = new Map(
  Result.getOrThrow(
    membersOf(
      look.acts,
      script.map((beat) => beat.id),
    ),
  ).flatMap(({ part, scenes }) => scenes.map((id) => [id, byAct[part.name]] as const)),
);

/** A scene's light, where its drawing brings none: its own where `byScene` names one, else its act's. */
export const lightOf = (id: BeatId): Light | undefined => byScene[id] ?? byActOf.get(id);
