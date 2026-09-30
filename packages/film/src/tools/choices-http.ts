// A film's options over HTTP: the handlers of the review API's `options`
// group (`core/api.ts`), served by `film review` for every film of the app.
// Each pick is a write: it lands in the film's source through the
// SourceWriter and is answered like the lab's knob writes, with the film's
// check after it (and the choices as they now stand). A film is named as one
// of the films in the app's folder (`FilmScope.repo`) before anything reads
// it: any other name is a 404 that lists the films, never a path.

import { Effect, Option, Path } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { ReviewHttpApi } from '../core/api.ts';
import type { ChoiceWrite } from '../core/schema.ts';
import { answered, named } from './api-server.ts';
import { Choices, type Picked } from './choices.ts';
import { type FilmName, FilmRepo } from './film-repo.ts';
import { serveFile } from './review-file.ts';
import { findings } from './steps-http.ts';

/** A take: named by its sha256, so it never changes under its URL. */
const IMMUTABLE = 'max-age=86400';
/**
 * A mix: its URL names the option or the take, not the source it was mixed
 * from, so a page asks again each time (a revalidation, answered 304 while the
 * film's source stands).
 */
const MIXED = 'no-cache';

/** What a pick answers: the file it changed (relative to the film), the choices now, the check. */
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

/** The options' handlers. */
export const optionsGroup = HttpApiBuilder.group(ReviewHttpApi, 'options', (handlers) =>
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
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          return yield* (yield* Choices).list(film);
        }),
      ),
    )
    .handle('pickScore', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          return yield* answer(film, yield* (yield* Choices).pickScore(film, payload.option));
        }),
      ),
    )
    .handle('scoreMix', ({ params, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const file = yield* (yield* Choices).scoreMix(film, params.option);
          return yield* serveFile(request, file, MIXED);
        }),
      ),
    )
    .handle('takeAudio', ({ params, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const file = yield* (yield* Choices).takeAudio(film, params.sound, params.take);
          return yield* serveFile(request, file, IMMUTABLE);
        }),
      ),
    )
    .handle('takeMix', ({ params, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const file = yield* (yield* Choices).takeMix(film, params.sound, params.take);
          return yield* serveFile(request, file, MIXED);
        }),
      ),
    )
    .handle('curate', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* named(params.film);
          const picked = yield* (yield* Choices).curate(
            film,
            params.sound,
            payload.take,
            payload.act,
          );
          return yield* answer(film, picked);
        }),
      ),
    ),
);
