// Every beat of the script paired with its drawing. Beats without a drawing
// yet play as storyboard cards, so the whole film is watchable from day one.
// Imports nothing that touches the DOM at module load: the narrate script
// reads this to lay out the audio track.

import { type SceneSpec, storyboard } from '@bible/film/canvas';
import { script } from '../script.ts';

export type Drawing = Omit<SceneSpec, 'id' | 'say'>;

const drawings = new Map<string, Drawing>(Object.entries({}));

export const scenes: SceneSpec[] = script.map((beat) => ({
  id: beat.id,
  ...(beat.say === undefined ? {} : { say: beat.say }),
  ...(drawings.get(beat.id) ?? storyboard(beat.id, beat.picture)),
}));
