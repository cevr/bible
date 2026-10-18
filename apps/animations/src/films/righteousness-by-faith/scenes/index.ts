// Every beat of the script paired with its drawing by the beat's id
// (`scenesOf`: an id the script lacks does not compile). Beats without a
// drawing yet play as storyboard cards, so the whole film is watchable from
// day one, and `film check` names each (`Storyboard`). The script owns what is
// said and how it is timed; a drawing owns only its picture: `draw`, the cues
// and knobs it reads, and a light of its own if it has one. Every other scene
// is lit by its act's light (`light.ts`, the colour script). No beat of this
// version is drawn yet: its scenes are built to its Board (the flow's step 7).
// Imports nothing that touches the DOM at module load: the narrate script
// reads this to lay out the audio track.

import { type SceneSpec, scenesOf } from '@bible/film/canvas';
import { lightOf } from '../light.ts';
import { fonts } from '../palette.ts';
import { script } from '../script.ts';
import { cold } from './cold.ts';
import { court } from './court.ts';
import { title } from './title.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: { cold, court, title },
  light: lightOf,
  card: { brief: fonts.display, label: fonts.body },
});
