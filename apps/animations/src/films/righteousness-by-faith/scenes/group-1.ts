// Drawings for one slice of the script (split so scenes can be built in parallel).

import { centurion } from './centurion.ts';
import type { Drawing } from './index.ts';
import { rags } from './rags.ts';
import { voidScene } from './void.ts';
import { witness } from './witness.ts';

export const group1: Record<string, Drawing> = { rags, witness, void: voidScene, centurion };
