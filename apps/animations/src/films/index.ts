// Every film the player and the renderer know about, loaded on demand.

import type { Film } from '@bible/film/canvas';

export const films: Record<string, () => Promise<Film>> = {
  'righteousness-by-faith': () => import('./righteousness-by-faith/film.ts').then((m) => m.film()),
};
