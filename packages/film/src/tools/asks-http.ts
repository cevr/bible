// The asks' routes, served by `film lab` (`AsksGroup` in `core/api.ts`): an
// ask read as its record, and a step's answers, which move its machine
// (`AskStore.answer`). The page answers a step at a time; each answer is
// kept, so a reload or the phone opens the ask where it was left.

import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi } from '../core/api.ts';
import { answered } from './api-server.ts';
import { AskStore } from './ask-store.ts';

export const asksGroup = HttpApiBuilder.group(LabHttpApi, 'asks', (handlers) =>
  handlers
    .handle('read', ({ params }) =>
      answered(Effect.flatMap(AskStore, (asks) => asks.read(params.ask))),
    )
    .handle('answer', ({ params, payload }) =>
      answered(
        Effect.flatMap(AskStore, (asks) => asks.answer(params.ask, payload.step, payload.values)),
      ),
    ),
);
