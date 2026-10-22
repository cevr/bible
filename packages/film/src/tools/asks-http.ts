// The asks' routes, served by `film lab` (`AsksGroup` in `core/api.ts`): an
// ask read as its record, or with the page of asks it is on, and its answers, each section's in order,
// which move its machine (`AskStore.answerPage`); each answer is kept, so a
// reload or the phone opens the ask where it was left. A page opened before
// the one-page ask sends one step, taken as one section (`sectionsPosted`).
// An image the ask shows from a file is served from the copy the lab made
// with the ask, one its receipt names (`AskStore.shownFile`), named by its
// own bytes' hash, so it is never stored stale.

import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi, sectionsPosted } from '../core/api.ts';
import { answered } from './api-server.ts';
import { AskStore } from './ask-store.ts';
import { CACHE, serveFile } from './review-file.ts';

export const asksGroup = HttpApiBuilder.group(LabHttpApi, 'asks', (handlers) =>
  handlers
    .handle('read', ({ params }) =>
      answered(Effect.flatMap(AskStore, (asks) => asks.read(params.ask))),
    )
    .handle('page', ({ params }) =>
      answered(Effect.flatMap(AskStore, (asks) => asks.page(params.ask))),
    )
    .handle('answer', ({ params, payload }) =>
      answered(
        Effect.flatMap(AskStore, (asks) => asks.answerPage(params.ask, sectionsPosted(payload))),
      ),
    )
    .handle('shown', ({ params, request }) =>
      answered(
        Effect.flatMap(
          Effect.flatMap(AskStore, (asks) => asks.shownFile(params.ask, params.file)),
          (copy) => serveFile(request, copy, CACHE.hashed),
        ),
      ),
    ),
);
