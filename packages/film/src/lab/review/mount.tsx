// The review page's browser entry (`/`, served by `film lab`): the review
// (`page.tsx`) over the browser's host, mounted as every studio page is
// (`mountStudio`): hydrated over the markup the lab rendered it with on the
// server (`server.tsx`), or rendered anew.

import { panesMediaLayer } from '../../browser/media-browser.ts';
import { LabClient } from '../api.ts';
import { mountStudio } from '../page-client.tsx';
import { REVIEW_PAGE, reviewOn } from './page.tsx';

/**
 * Mount the review into the page, with its styles, over the page's host
 * (`browser/host.ts`; its media plays a set's compare on WebCodecs panes
 * where it can, `panesMediaLayer`), with its commands and their one key
 * listener (`command/hub.ts`).
 */
export const mountReview = (): void =>
  mountStudio({
    page: REVIEW_PAGE,
    event: 'review.mounted',
    media: panesMediaLayer,
    on: (host) => reviewOn(host, LabClient.layer),
  });
