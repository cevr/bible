// `ps1`: late-90s PlayStation 3D (phase 2 draws it). For now the stub, with
// the three.js proof (`proof.ts`) composited into the court: the 3D path
// through the lab's preview, `look` and `render`.

import { write } from '@bible/film/canvas';
import { fonts } from '../../palette.ts';
import type { Look } from '../../look.ts';
import { stub } from '../stub.ts';
import { cube } from './proof.ts';

const base = stub('ps1', { ground: '#11151f', ink: '#e8e4d8', accent: '#d8a040' });

export const ps1: Look = {
  ...base,
  court: (f) => {
    base.court(f);
    const drawn = cube(f, 760, 650, 400, 300);
    write(
      f.ctx,
      drawn ? 'three.js · WebGL 2 · 320 × 240' : 'no WebGL 2 here: the 2D fallback',
      f.w / 2,
      120,
      { family: fonts.body, size: 30, weight: 600, color: '#d8a040', align: 'center' },
      f.hand('gl'),
      { boil: 0 },
    );
  },
};
