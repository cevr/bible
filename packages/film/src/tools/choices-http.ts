// A film's choices over HTTP: the handlers of the lab API's `choices` group
// (`LabHttpApi` in `core/api.ts`), served by `film lab` for every film of the app.
// A pick or a knob is a write: it lands in the film's source through the
// SourceWriter and is answered like the lab's knob writes, with the film's
// static check after it and the choices as they now stand, both from one
// fresh run (`Choices.checked`). The page runs the sound check
// (`soundCheck`, dead air and balance in the mix the film now makes) after a
// pick. A say (an approval, its withdrawal, a comment) lands in the film's
// catalogue, and answers the choices it leaves.
// A film is named as one of the films in the app's folder (`filmNamed`)
// before anything reads it: any other name is a 404 that lists the films,
// never a path.

import { Effect, Option, Path } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { LabHttpApi } from '../core/api.ts';
import type { ChoiceWrite } from '../core/choice.ts';
import { answered } from './api-server.ts';
import { Choices, type Picked } from './choices.ts';
import { FilmFolder, type FilmName, filmNamed } from './film-repo.ts';
import { FreshFilm } from './fresh-film.ts';
import { mixedAnswer } from './lab-page.ts';
import { IMMUTABLE, serveFile } from './review-file.ts';

/**
 * A mix: its URL names the point and variant, not the source it was mixed
 * from, so a page asks again each time (a revalidation, answered 304 while the
 * film's source stands).
 */
const MIXED = 'no-cache';

/**
 * What a write answers: the file it changed (relative to the film), the
 * choices now, the check, and the mix it made as a page hears it.
 */
const answer = Effect.fn('choices.answer')(function* (film: FilmName, picked: Picked) {
  const path = yield* Path.Path;
  const dir = (yield* FilmFolder).paths(film).dir;
  // Named before the check runs: the mix by when this write landed it, never one landed since.
  const mixed = yield* mixedAnswer(film, picked.mixed);
  const { choices, findings } = yield* (yield* Choices).checked(film);
  const wrote: ChoiceWrite = {
    file: path.relative(dir, picked.file),
    target: Option.match(picked.change, {
      onNone: () => `${picked.target} (already so)`,
      onSome: (c) => c.target,
    }),
    // The change it made, by its id: what its receipt's Undo asks for; none when already so.
    ...Option.match(picked.change, { onNone: () => ({}), onSome: (c) => ({ change: c.id }) }),
    choices,
    findings,
    ...mixed,
  };
  return wrote;
});

/** The choices' handlers. */
export const choicesGroup = HttpApiBuilder.group(LabHttpApi, 'choices', (handlers) =>
  handlers
    .handle('films', () =>
      answered(
        Effect.map(
          FilmFolder.use((folder) => folder.names),
          (films) => ({ films }),
        ),
      ),
    )
    .handle('list', ({ params }) =>
      answered(Effect.flatMap(filmNamed(params.film), (film) => Choices.use((c) => c.list(film)))),
    )
    .handle('pick', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return yield* answer(film, yield* (yield* Choices).pick(film, payload));
        }),
      ),
    )
    .handle('knob', ({ params, payload }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return yield* answer(film, yield* (yield* Choices).knob(film, payload));
        }),
      ),
    )
    .handle('say', ({ params, payload }) =>
      answered(
        Effect.flatMap(filmNamed(params.film), (film) => Choices.use((c) => c.say(film, payload))),
      ),
    )
    .handle('alone', ({ params, query, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const file = yield* (yield* Choices).alone(film, query.point, query.variant);
          return yield* serveFile(request, file, IMMUTABLE);
        }),
      ),
    )
    .handle('mix', ({ params, query, request }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          const file = yield* (yield* Choices).inPlace(film, query.point, query.variant);
          return yield* serveFile(request, file, MIXED);
        }),
      ),
    )
    .handle('soundCheck', ({ params }) =>
      answered(
        Effect.gen(function* () {
          const film = yield* filmNamed(params.film);
          return { findings: yield* (yield* FreshFilm).check(film, 'sound') };
        }),
      ),
    ),
);
