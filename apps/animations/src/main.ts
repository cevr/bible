// The browser entry: the film player over this app's film registry.

import { mountPlayer } from '@bible/film/player';
import { films } from './films/index.ts';

mountPlayer(films);
