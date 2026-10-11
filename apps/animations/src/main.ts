// The render page's entry (`index.html`: the lab's `/films/<name>/export`,
// the PreviewServer's `/?film=<name>&export`): the film with no chrome, for the
// renderer and the easel, over this app's pages (its films and their shorts).

import { mountRender } from '@bible/film/render';
import { pages } from './films/index.ts';

mountRender(pages);
