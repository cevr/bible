// The browser player: the narrated films, and the faces they draw in. The
// render page the renderer and the easel drive is its own entry
// (`@bible/film/render`, render.ts): every page imports the films through
// this one, so a page that reached the render page's module here would load
// its encoder too, however the lab's bundler splits the pages' code.

export { type Face, SUBSETS, pictureFaces } from './face.ts';
export { type Narrated, narratedFilms } from './narrated.ts';
