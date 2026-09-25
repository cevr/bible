// Drawings for one slice of the script (split so scenes can be built in parallel).

import { exchange } from './exchange.ts';
import { hand } from './hand.ts';
import type { Drawing } from './index.ts';
import { justified } from './justified.ts';
import { robe } from './robe.ts';

export const group2: Record<string, Drawing> = { justified, exchange, robe, hand };
