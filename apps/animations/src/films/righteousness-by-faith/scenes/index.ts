// Every beat of the script paired with its drawing. Beats without a drawing
// yet play as storyboard cards, so the whole film is watchable from day one.
// The script owns what is said and how it is timed; a drawing owns only its
// picture: `draw`, and the cues and knobs it reads. Imports nothing that
// touches the DOM at module load: the narrate script reads this to lay out
// the audio track.

import { type SceneSpec, storyboard } from '@bible/film/canvas';
import { script } from '../script.ts';

export type Drawing = Pick<SceneSpec, 'draw' | 'timeline' | 'knobs'>;

const drawings = new Map<string, Drawing>(Object.entries({}));

// The script's timing is spread last, so a storyboard card's own entrance
// holds only where the script names none.
export const scenes: SceneSpec[] = script.map(({ cite: _cite, picture, ...timed }) => ({
  ...(drawings.get(timed.id) ?? storyboard(timed.id, picture)),
  ...timed,
}));
