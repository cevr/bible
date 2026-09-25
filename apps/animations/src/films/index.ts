// Every film the player and the renderer know about, loaded on demand.

import type { Film } from '@bible/film/canvas';

const righteousnessByFaith = () => import('./righteousness-by-faith/film.ts');

export const films = {
  'righteousness-by-faith': () => righteousnessByFaith().then((m) => m.film()),
} satisfies Record<string, () => Promise<Film>>;
