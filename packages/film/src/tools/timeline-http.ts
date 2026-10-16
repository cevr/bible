// A film's timeline over HTTP: the handler of the lab API's `timeline` group
// (`LabHttpApi` in `core/api.ts`), the studio page's one read of the model,
// answered by the same service the `timeline` tool reads (`FilmTimelines`),
// so the owner's page and an agent read one model.

import { Effect, Option } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi } from '../core/api.ts';
import { answered } from './api-server.ts';
import { FilmTimelines } from './film-timeline.ts';

export const timelineGroup = HttpApiBuilder.group(LabHttpApi, 'timeline', (handlers) =>
  handlers.handle('read', ({ params, query }) =>
    answered(
      Effect.flatMap(FilmTimelines, (timelines) =>
        timelines.timeline(params.film, Option.fromUndefinedOr(query.v)),
      ),
    ),
  ),
);
