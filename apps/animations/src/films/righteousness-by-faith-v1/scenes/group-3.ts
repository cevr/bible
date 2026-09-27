// Drawings for one slice of the script (split so scenes can be built in parallel).

import { eighteen88 } from './eighteen88.ts';
import { end } from './end.ts';
import type { Drawing } from './index.ts';
import { name } from './name.ts';
import { serpent } from './serpent.ts';
import { within } from './within.ts';

export const group3 = { serpent, within, '1888': eighteen88, name, end } satisfies Record<
  string,
  Drawing
>;
