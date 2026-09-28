// The browser entry: the film player over this app's pages (its films and
// their shorts).

import { mountPlayer } from '@bible/film/player';
import { pages } from './films/index.ts';

mountPlayer(pages);
