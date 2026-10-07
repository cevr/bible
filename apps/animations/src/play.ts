// A film's Scenes and Play pages' entry (`/films/<film>/scenes`,
// `/films/<film>/play`): the tape or the preview in the studio's shell,
// over this app's pages (its films and their shorts). The render page
// (`main.ts`) never loads it.

import { mountPlay } from '@bible/film/lab';
import { pages } from './films/index.ts';

mountPlay(pages);
