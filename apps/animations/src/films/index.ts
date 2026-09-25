// Every film the player and the renderer know about, loaded on demand.

import type { Film } from '../engine/film.ts';

export const films: Record<string, () => Promise<Film>> = {};
