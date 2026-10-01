// The prototype's three shots, each paired with its drawing by the beat's id.

import { type SceneSpec, scenesOf } from '@bible/film/canvas';
import { script } from '../script.ts';
import { fire } from './fire.ts';
import { lamp } from './lamp.ts';
import { mount } from './mount.ts';

export const scenes: SceneSpec[] = scenesOf(script, {
  drawings: { mount, fire, lamp },
  card: { brief: 'serif', label: 'serif' },
});
