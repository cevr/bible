// A film's choices over HTTP: the handlers of the review API's `choices`
// group (`core/api.ts`), served by `film review` for every film of the app.
// A pick or a knob is a write: it lands in the film's source through the
// SourceWriter and is answered like the lab's knob writes, with the film's
// static check after it (and the choices as they now stand). The page runs
// the sound check (`soundCheck`, dead air and balance in the mix the film now
// makes) after a pick. Approvals and comments land in the film's catalogue.
// A film is named as one of the films in the app's folder (`FilmScope.repo`)
// before anything reads it: any other name is a 404 that lists the films,
// never a path.

import { Effect, Option, Path } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { ReviewHttpApi } from '../core/api.ts';
import type { ChoiceWrite } from '../core/choice.ts';
import type { CheckLine } from '../core/schema.ts';
import { answered, named } from './api-server.ts';
import { Choices, type Picked } from './choices.ts';
import { type FilmName, FilmRepo } from './film-repo.ts';
import { serveFile } from './review-file.ts';
import { StaticCheck } from './static-check.ts';
import { findings } from './steps-http.ts';

/** A take or an attempt: named by its sha256 or file, so it never changes under its URL. */
const IMMUTABLE = 'max-age=86400';
/**
 * A mix: its URL names the point and variant, not the source it was mixed
 * from, so a page asks again each time (a revalidation, answered 304 while the
 * film's source stands).
 */
const MIXED = 'no-cache';

/** What a write answers: the file it changed (relative to the film), the choices now, the check. */
const answer = Effect.fn('choices.answer')(function* (film: FilmName, picked: Picked) {
  const path = yield* Path.Path;
  const dir = (yield* FilmRepo).paths(film).dir;
  const wrote: ChoiceWrite = {
    file: path.relative(dir, picked.file),
    target: Option.match(picked.change, {
      onNone: () => `${picked.target} (already so)`,
      onSome: (c) => c.target,
    }),
    choices: yield* (yield* Choices).list(film),
    findings: yield* findings(film),
  };
  return wrote;
});

/** The choices' handlers. */
export const choicesGroup = HttpApiBuilder.group(ReviewHttpApi, 'choices', (handlers) =>
  handlers
    .handle('films', () =>
      answered(
        Effect.map(
          FilmRepo.use((repo) => repo.names),
          (films) => ({ films }),
        ),
      ),
    )
    .handle('list', ({ params }) =>
      answered(Effect.flatMap(named(params.film), (film) => Choices.use((c) => c.list(film)))),
    )
    .handle('pick', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          return yield* answer(film, yield* (yield* Choices).pick(film, payload));
        }),
      ),
    )
    .handle('knob', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          return yield* answer(film, yield* (yield* Choices).knob(film, payload));
        }),
      ),
    )
    .handle('approve', ({ params, payload }) =>
      answered(
        Effect.flatMap(named(params.film), (film) => Choices.use((c) => c.approve(film, payload))),
      ),
    )
    .handle('comment', ({ params, payload }) =>
      answered(
        Effect.flatMap(named(params.film), (film) => Choices.use((c) => c.comment(film, payload))),
      ),
    )
    .handle('alone', ({ params, query, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const file = yield* (yield* Choices).alone(film, query.point, query.variant);
          return yield* serveFile(request, file, IMMUTABLE);
        }),
      ),
    )
    .handle('mix', ({ params, query, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const file = yield* (yield* Choices).inPlace(film, query.point, query.variant);
          return yield* serveFile(request, file, MIXED);
        }),
      ),
    )
    .handle('soundCheck', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          // A check that could not run is one error finding, as the static check's is.
          const found = yield* (yield* StaticCheck).sound(film).pipe(
            Effect.catchTag('StaticCheckFailed', (error) => {
              const line: CheckLine = { level: 'error', tag: error._tag, message: error.message };
              return Effect.succeed([line]);
            }),
          );
          return { findings: found };
        }),
      ),
    ),
);
