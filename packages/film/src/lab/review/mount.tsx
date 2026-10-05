// The review page's browser entry (`/`, served by `film lab`): the review
// (`page.tsx`) over the browser's host, hydrated over the markup the lab
// rendered it with on the server (`server.tsx`), or rendered anew.

import { Location } from '@bible/url-state';
import { Effect } from 'effect';
import { hostOf } from '../../browser/host.ts';
import { BrowserHost } from '../../browser/host-browser.ts';
import { registerFace } from '../../player/face.ts';
import type { Films } from '../../player/main.ts';
import { LabClient } from '../api.ts';
import { mountPage } from '../page-client.tsx';
import { drawStills } from './options/draw-stills.ts';
import { REVIEW_PAGE, reviewOn } from './page.tsx';

/**
 * Mount the review into the page, with its styles, over the page's host
 * (`browser/host.ts`), with its commands and their one key listener
 * (`command/hub.ts`): hydrated over the markup the lab rendered it with on
 * the server, or rendered anew (`page-client.tsx`). `films` are the app's
 * films, each loaded on demand: a film's Project draws its scenes' stills
 * from its code (none, no stills).
 */
export const mountReview = (films: Films = {}): void => {
  const host = hostOf(BrowserHost.layer);
  Effect.runSyncWith(host)(
    Effect.gen(function* () {
      registerFace(document.fonts);
      const { hub, app } = yield* reviewOn(host, LabClient.layer, drawStills(films));
      yield* Effect.forkDetach(hub.listen);
      const { how } = mountPage({ ...REVIEW_PAGE, app });
      const { href } = yield* Location.use((bar) => bar.current);
      yield* Effect.logInfo(`review.mounted href=${href} how=${how}`);
    }),
  );
};
