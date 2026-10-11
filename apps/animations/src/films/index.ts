// Every film the player and the renderer know about, loaded on demand, and
// the pages the player mounts: each film, each of its shorts (`shorts.ts`)
// under `<film>/shorts/<id>`, and each talk (`talkFilms`: the speaker's own
// take, cut on his words), a film of its own under its folder's name.

import { type Film, shortPages, talkFilms } from '@bible/film/canvas';
import { narratedFilms } from '@bible/film/player';
import { faces } from './faces.ts';
import { shorts as righteousnessByFaithShorts } from './righteousness-by-faith/shorts.ts';

const righteousnessByFaith = () => import('./righteousness-by-faith/film.ts');

/**
 * The films, by folder: each key names a folder under `src/films`, and the
 * framework loads that film's narration from it and the faces it draws in
 * (`faces.ts`) with it (`narratedFilms`). A talk's folder is listed in
 * `talkFilms`, its page module (its edit and its takes) loaded as a film's is.
 */
export const films = narratedFilms(
  {
    'righteousness-by-faith': righteousnessByFaith,
    ...talkFilms({}),
  },
  faces,
);

/** Every page the player serves: the films, then each film's shorts. */
export const pages = {
  ...films,
  ...shortPages(
    'righteousness-by-faith',
    films['righteousness-by-faith'],
    righteousnessByFaithShorts,
  ),
} satisfies Record<string, () => Promise<Film>>;
