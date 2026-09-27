// Every film the player and the renderer know about, loaded on demand.

import type { Film } from '@bible/film/canvas';

const righteousnessByFaithV1 = () => import('./righteousness-by-faith-v1/film.ts');

export const films = {
  'righteousness-by-faith-v1': () => righteousnessByFaithV1().then((m) => m.film()),
} satisfies Record<string, () => Promise<Film>>;
