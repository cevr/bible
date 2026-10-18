// The studio's edits over HTTP: the handlers of the lab API's `edits` group
// (`LabHttpApi` in `core/api.ts`). A beat moved, a hold set, and Undo and Redo
// of the film's newest change, each made by `BeatEdits` (the history the MCP
// tools share) and answered at once with what it says to the owner and what
// Undo and Redo would step now: no check runs, the agents re-check.

import { Effect, Option } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi, type StudioEdit } from '../core/api.ts';
import { answered } from './api-server.ts';
import { BeatEdits, type Edited, STUDIO_BY } from './beat-edits.ts';
import { filmNamed } from './film-repo.ts';
import { history } from './steps-http.ts';

/** An edit as the page reads it: its change's id, what it set and said, and the history now. */
const editAnswer = Effect.fn('lab.editAnswer')(function* (film: string, edited: Edited) {
  const steps = yield* history(yield* filmNamed(film));
  const answer: StudioEdit = {
    ...Option.match(edited.change, { onNone: () => ({}), onSome: (c) => ({ change: c.id }) }),
    target: edited.target,
    said: edited.said,
    steps,
  };
  return answer;
});

export const editsGroup = HttpApiBuilder.group(LabHttpApi, 'edits', (handlers) =>
  handlers
    .handle('move', ({ params, payload }) =>
      answered(
        Effect.flatMap(
          Effect.flatMap(BeatEdits, (edits) =>
            edits.move({
              film: params.film,
              version: Option.fromUndefinedOr(payload.version),
              beat: payload.beat,
              before: Option.fromUndefinedOr(payload.before),
              by: STUDIO_BY,
            }),
          ),
          (edited) => editAnswer(params.film, edited),
        ),
      ),
    )
    .handle('hold', ({ params, payload }) =>
      answered(
        Effect.flatMap(
          Effect.flatMap(BeatEdits, (edits) =>
            edits.hold({
              film: params.film,
              version: Option.fromUndefinedOr(payload.version),
              beat: payload.beat,
              edge: payload.edge,
              seconds: payload.seconds,
              by: STUDIO_BY,
            }),
          ),
          (edited) => editAnswer(params.film, edited),
        ),
      ),
    )
    .handle('undo', ({ params, payload }) =>
      answered(
        Effect.flatMap(
          Effect.flatMap(BeatEdits, (edits) => edits.step('undo', params.film, payload)),
          (edited) => editAnswer(params.film, edited),
        ),
      ),
    )
    .handle('redo', ({ params, payload }) =>
      answered(
        Effect.flatMap(
          Effect.flatMap(BeatEdits, (edits) => edits.step('redo', params.film, payload)),
          (edited) => editAnswer(params.film, edited),
        ),
      ),
    ),
);
