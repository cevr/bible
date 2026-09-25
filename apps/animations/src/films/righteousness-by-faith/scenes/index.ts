// Every beat of the script paired with its drawing. Beats without a drawing
// yet play as storyboard cards, so the whole film is watchable from day one.
// Imports nothing that touches the DOM at module load: the narrate script
// reads this to lay out the audio track.

import type { SceneSpec } from '../../../engine/film.ts';
import { storyboard } from '../../../engine/storyboard.ts';
import { script } from '../script.ts';
import { measure } from './measure.ts';
import { question } from './question.ts';
import { title } from './title.ts';
import { group1 } from './group-1.ts';
import { group2 } from './group-2.ts';
import { group3 } from './group-3.ts';

export type Drawing = Omit<SceneSpec, 'id' | 'say'>;

const drawings: Record<string, Drawing> = {
  question,
  title,
  measure,
  ...group1,
  ...group2,
  ...group3,
};

export const scenes: SceneSpec[] = script.map((beat) => ({
  id: beat.id,
  ...(beat.say === undefined ? {} : { say: beat.say }),
  ...(drawings[beat.id] ?? storyboard(beat.id, beat.picture)),
}));
