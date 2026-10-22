// The asks' routes, served by `film lab` (`AsksGroup` in `core/api.ts`): an
// ask read as its record, or with the page of asks it is on, and its answers, each section's in order,
// which move its machine (`AskStore.answerPage`); each answer is kept, so a
// reload or the phone opens the ask where it was left. A page opened before
// the one-page ask sends one step, taken as one section (`sectionsPosted`).
// An ask's images keep the receipt rule (`receipted` in `ask-store.ts`): an
// image whose src the receipt names is served only as its copy. Each
// file-served image of an image block or an option is copied as the ask is
// made, or the make is refused (`AskRefused`, naming the src). A board
// block's panels and a video's poster or frame show live and bind nothing.
// A copy's bytes are read once and checked against its hash before they are
// answered (`AskStore.shownFile`), so the immutable copy a browser keeps is
// the one the receipt holds.

import { Effect, Option, Record } from 'effect';
import { HttpServerResponse } from 'effect/http';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi, sectionsPosted } from '../core/api.ts';
import { answered } from './api-server.ts';
import { AskStore } from './ask-store.ts';
import { CACHE } from './review-file.ts';

/** The type of a copy by its extension: an image an ask shows. */
const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

const typeOf = (name: string): string =>
  Option.getOrElse(
    Record.get(IMAGE_TYPES, (name.split('.').at(-1) ?? '').toLowerCase()),
    () => 'application/octet-stream',
  );

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
    .handle('shown', ({ params }) =>
      answered(
        Effect.map(
          Effect.flatMap(AskStore, (asks) => asks.shownFile(params.ask, params.file)),
          ({ name, bytes }) =>
            HttpServerResponse.uint8Array(bytes, {
              contentType: typeOf(name),
              headers: { 'cache-control': CACHE.hashed },
            }),
        ),
      ),
    ),
);
