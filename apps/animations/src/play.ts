// A film's studio page's entry (`/films/<film>/studio`): the studio over
// this app's pages (its films and their shorts). The render page
// (`main.ts`) never loads it.

import { mountFilmStudio } from '@bible/film/play';
import { pages } from './films/index.ts';

mountFilmStudio(pages);
