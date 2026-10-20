// Every beat of the script paired with its drawing by the beat's id
// (`scenesOf`). No beat has a drawing yet, so each plays as its storyboard
// card and the whole film is watchable from day one; `film check` names each
// (`Storyboard`). The scenes are built to the film's Board (the flow's step
// 7). Imports nothing that touches the DOM at module load: the narrate script
// reads this to lay out the audio track.

import { type SceneSpec, scenesOf } from '@bible/film/canvas';
import { fonts } from '../palette.ts';
import { script } from '../script.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: {},
  card: { brief: fonts.display, label: fonts.body },
});
