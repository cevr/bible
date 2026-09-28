// The lab page's entry (`/lab?film=<film>`, `film lab`): the film lab over
// this app's film registry. The player page (`main.ts`) never loads it.

import { mountLab } from '@bible/film/lab';
import { films } from './films/index.ts';

mountLab(films);
