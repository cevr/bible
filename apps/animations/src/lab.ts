// The lab page's entry (`/films/<film>/lab[/<scene>]`, `film lab`): the film lab over
// this app's film registry. The render page (`main.ts`) never loads it.

import { mountLab } from '@bible/film/lab';
import { films } from './films/index.ts';

mountLab(films);
