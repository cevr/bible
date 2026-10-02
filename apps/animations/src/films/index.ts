// Every film the player and the renderer know about, loaded on demand, and
// the pages the player mounts: each film, and each of its shorts
// (`shorts.ts`) under `<film>/shorts/<id>`.

import { type Film, shortPages } from '@bible/film/canvas';
import { narratedFilms } from '@bible/film/player';
import { shorts as righteousnessByFaithShorts } from './righteousness-by-faith/shorts.ts';

const righteousnessByFaith = () => import('./righteousness-by-faith/film.ts');

/**
 * The films, by folder: each key names a folder under `src/films`, and the
 * framework loads that film's narration from it (`narratedFilms`).
 */
export const films = narratedFilms({
  'righteousness-by-faith': righteousnessByFaith,
});

/** Every page the player serves: the films, then each film's shorts. */
export const pages = {
  ...films,
  ...shortPages(
    'righteousness-by-faith',
    films['righteousness-by-faith'],
    righteousnessByFaithShorts,
  ),
} satisfies Record<string, () => Promise<Film>>;
