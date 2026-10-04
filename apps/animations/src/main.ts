// The render page's entry (`index.html`, `?film=<name>&export`): the film
// with no chrome, for the renderer, over this app's pages (its films and
// their shorts).

import { mountRender } from '@bible/film/player';
import { pages } from './films/index.ts';

mountRender(pages);
