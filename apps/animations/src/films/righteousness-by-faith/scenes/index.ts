// Every beat of the script paired with its drawing. Beats without a drawing
// yet play as storyboard cards, so the whole film is watchable from day one.
// The script owns what is said and how it is timed; a drawing owns only its
// picture: `draw`, and the cues and knobs it reads. Imports nothing that
// touches the DOM at module load: the narrate script reads this to lay out
// the audio track.

import { type SceneSpec, storyboard } from '@bible/film/canvas';
import { script } from '../script.ts';
import { accuser } from './accuser.ts';
import { centurion } from './centurion.ts';
import { cold } from './cold.ts';
import { daily } from './daily.ts';
import { declared } from './declared.ts';
import { end } from './end.ts';
import { exchange } from './exchange.ts';
import { look } from './look.ts';
import { message } from './message.ts';
import { mirror } from './mirror.ts';
import { name } from './name.ts';
import { rain } from './rain.ts';
import { robe } from './robe.ts';
import { spoke } from './spoke.ts';
import { thesis } from './thesis.ts';
import { title } from './title.ts';
import { within } from './within.ts';
import { word } from './word.ts';

export type Drawing = Pick<SceneSpec, 'draw' | 'timeline' | 'knobs' | 'drift'>;

const drawings = new Map<string, Drawing>(
  Object.entries({
    accuser,
    centurion,
    cold,
    daily,
    declared,
    end,
    exchange,
    look,
    message,
    mirror,
    name,
    rain,
    robe,
    spoke,
    thesis,
    title,
    within,
    word,
  }),
);

// The script's timing is spread last, so a storyboard card's own entrance
// holds only where the script names none.
export const scenes: SceneSpec[] = script.map(({ cite: _cite, picture, ...timed }) => ({
  ...(drawings.get(timed.id) ?? storyboard(timed.id, picture)),
  ...timed,
}));
