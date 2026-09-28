// Every film the player and the renderer know about, loaded on demand, and
// the pages the player mounts: each film, and each of its shorts
// (`shorts.ts`) under `<film>/shorts/<id>`.

import { type Film, shortPages } from '@bible/film/canvas';
import { shorts as righteousnessByFaithShorts } from './righteousness-by-faith/shorts.ts';

const righteousnessByFaithModule = () => import('./righteousness-by-faith/film.ts');
const righteousnessByFaithV1 = () => import('./righteousness-by-faith-v1/film.ts');
const righteousnessByFaith = () => righteousnessByFaithModule().then((m) => m.film());

/** The films, by folder: each key names a folder under `src/films`. */
export const films = {
  'righteousness-by-faith': righteousnessByFaith,
  'righteousness-by-faith-v1': () => righteousnessByFaithV1().then((m) => m.film()),
} satisfies Record<string, () => Promise<Film>>;

/** Every page the player serves: the films, then each film's shorts. */
export const pages = {
  ...films,
  ...shortPages('righteousness-by-faith', righteousnessByFaith, righteousnessByFaithShorts),
} satisfies Record<string, () => Promise<Film>>;
