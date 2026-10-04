// The synthetic film's scenes: every beat a storyboard card.

import { type SceneSpec, scenesOf } from '@bible/film/canvas';
import { script } from '../script.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: {},
  card: { brief: 'serif', label: 'serif' },
});
