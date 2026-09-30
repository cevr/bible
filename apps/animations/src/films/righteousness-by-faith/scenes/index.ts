// Every beat of the script paired with its drawing by the beat's id
// (`scenesOf`: an id the script lacks does not compile). Beats without a
// drawing yet play as storyboard cards, so the whole film is watchable from
// day one, and `film check` names each (`Storyboard`). The script owns what is
// said and how it is timed; a drawing owns only its picture: `draw`, the cues
// and knobs it reads, and a light of its own if it has one. Every other scene
// is lit by its act's light (`light.ts`, the colour script). Imports nothing that touches the DOM
// at module load: the narrate script reads this to lay out the audio track.

import { type SceneSpec, scenesOf } from '@bible/film/canvas';
import { lightOf } from '../light.ts';
import { fonts } from '../palette.ts';
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
import { roof } from './roof.ts';
import { spoke } from './spoke.ts';
import { thesis } from './thesis.ts';
import { title } from './title.ts';
import { within } from './within.ts';
import { woman } from './woman.ts';
import { word } from './word.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: {
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
    roof,
    spoke,
    thesis,
    title,
    within,
    woman,
    word,
  },
  light: lightOf,
  card: { brief: fonts.display, label: fonts.body },
});
