// The review page's browser entry (`/`, served by `film lab`): the review
// (`page.tsx`) over the browser's host, mounted as every studio page is
// (`mountStudio`): hydrated over the markup the lab rendered it with on the
// server (`server.tsx`), or rendered anew.

import { panesMediaLayer } from '../../browser/media-browser.ts';
import type { Films } from '../../player/main.ts';
import { LabClient } from '../api.ts';
import { mountStudio } from '../page-client.tsx';
import { drawStills } from './options/draw-stills.ts';
import { REVIEW_PAGE, reviewOn } from './page.tsx';

/**
 * Mount the review into the page, with its styles, over the page's host
 * (`browser/host.ts`; its media plays a set's compare on WebCodecs panes
 * where it can, `panesMediaLayer`), with its commands and their one key
 * listener (`command/hub.ts`). `films` are the app's films, each loaded on
 * demand: a film's Project draws its scenes' stills from its code (none, no
 * stills).
 */
export const mountReview = (films: Films = {}): void =>
  mountStudio({
    page: REVIEW_PAGE,
    event: 'review.mounted',
    media: panesMediaLayer,
    on: (host) => reviewOn(host, LabClient.layer, drawStills(films)),
  });
