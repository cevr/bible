// The study's two beats, each paired with its drawing (`scenesOf`). Imports
// nothing that touches the DOM at module load: the narrate and mix scripts
// read this to lay out the audio track.

import { type SceneSpec, scenesOf } from '@bible/film/canvas';
import { fonts } from '../palette.ts';
import { script } from '../script.ts';
import { court } from './court.ts';
import { job } from './job.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: { court, job },
  card: { brief: fonts.display, label: fonts.body },
});
