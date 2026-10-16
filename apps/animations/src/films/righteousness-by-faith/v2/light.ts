// Version 2's colour script: its acts (`acts.ts` here) lit by the film's
// lights (`../light.ts`, where each light and its lift are made):
//   - cold open: a cool, even room without sun;
//   - message: the peach afternoon going toward dusk;
//   - faith: a hazed noon, the dark world's own black in `spoke`;
//   - forgiveness, the valley: sunset on `declared` and the cross, the court
//     at first light after it, and the day coming up in `robe` as the loom
//     weaves (its drawing's own light);
//   - power: early gold morning, warm cream;
//   - landing: teal day, the lightest touch.

import type { Light } from '@bible/film/canvas';
import { membersOf } from '@bible/film/core';
import { Result } from 'effect';
import { LIGHT } from '../light.ts';
import { type ActName, look } from './acts.ts';
import { type BeatId, script } from './script.ts';

/** Each act's light (`acts.ts` declares the acts and the scenes they hold). */
const byAct: Readonly<Record<ActName, Light>> = {
  'cold open': LIGHT.room,
  message: LIGHT.dusk,
  faith: LIGHT.haze,
  forgiveness: LIGHT.sunset,
  power: LIGHT.morning,
  landing: LIGHT.day,
};

/**
 * The scenes lit apart from their act: the valley's court at first light. A
 * light that changes on a scene's own cue (`robe`'s dawn as the loom weaves)
 * is that drawing's `light`, typed by its cues.
 */
const byScene: Partial<Record<BeatId, Light>> = {
  accuser: LIGHT.firstLight,
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
