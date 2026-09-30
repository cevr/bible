// A film's options over HTTP, under its lab base (`labBase(film)`), served by
// `film review` for every film of the app. Each pick is a write: it lands in
// the film's source through the SourceWriter and is answered like the lab's
// knob writes, with the film's check after it (and the choices as they now
// stand). Undo, redo and the check are the lab's own, for the film named.
//
//   GET  /review/films                                        the app's films (ReviewFilms)
//   GET  /lab/<film>/options                                  FilmChoices
//   POST /lab/<film>/options/score/pick                       ScorePick: `play` in sound.ts
//   GET  /lab/<film>/options/score/<option>/mix               the film's mix with that option (m4a)
//   GET  /lab/<film>/options/effect/<sound>/takes/<take>/audio  the take alone
//   GET  /lab/<film>/options/effect/<sound>/takes/<take>/mix    the film's mix with that take in place (m4a)
//   POST /lab/<film>/options/effect/<sound>/takes             TakeCuration: keep, unkeep or reject
//   POST /lab/<film>/undo, /lab/<film>/redo, GET /lab/<film>/check
//
// Every write passes `admit` first (`review-http.ts`): one of the hosts the
// review answers, same-origin, JSON.

import { Effect, Option, Path, Schema } from 'effect';
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/unstable/http';
import { ChoiceWrite, FilmChoices, ReviewFilms, ScorePick, TakeCuration } from '../core/schema.ts';
import { Choices, type Picked } from './choices.ts';
import { FilmRepo } from './film-repo.ts';
import { checked, findings, redone, undone } from './lab.ts';

const FilmParams = Schema.Struct({ film: Schema.String });
const OptionParams = Schema.Struct({ film: Schema.String, option: Schema.String });
const SoundParams = Schema.Struct({ film: Schema.String, sound: Schema.String });
const TakeParams = Schema.Struct({
  film: Schema.String,
  sound: Schema.String,
  take: Schema.String,
});

const choicesJson = HttpServerResponse.schemaJson(FilmChoices);
const filmsJson = HttpServerResponse.schemaJson(ReviewFilms);
const writeJson = HttpServerResponse.schemaJson(ChoiceWrite);

/** A take: named by its sha256, so it never changes under its URL. */
const IMMUTABLE = 'max-age=86400';
/**
 * A mix: its URL names the option or the take, not the source it was mixed
 * from, so a page asks again each time (a revalidation, answered 304 while the
 * film's source stands).
 */
const MIXED = 'no-cache';

/** What a pick answers: the file it changed (relative to the film), the choices now, the check. */
const answer = Effect.fn('choices.answer')(function* (film: string, picked: Picked) {
  const path = yield* Path.Path;
  const dir = (yield* FilmRepo).paths(film).dir;
  return yield* writeJson({
    file: path.relative(dir, picked.file),
    target: Option.match(picked.change, {
      onNone: () => `${picked.target} (already so)`,
      onSome: (c) => c.target,
    }),
    choices: yield* (yield* Choices).list(film),
    findings: yield* findings(film),
  });
});

/**
 * The film routes, `answered` by the caller's error mapping (the review's),
 * and `serve` for a file the request asks for (its byte ranges answered).
 */
export const choiceRoutes = <E extends { readonly _tag: string; readonly message: string }, R>(
  answered: <E2 extends { readonly _tag: string; readonly message: string }, R2>(
    route: Effect.Effect<HttpServerResponse.HttpServerResponse, E2, R2>,
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, never, R2>,
  serve: (
    file: string,
    cacheControl: string,
  ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) =>
  HttpRouter.addAll([
    HttpRouter.route(
      'GET',
      '/review/films',
      answered(
        Effect.flatMap(
          FilmRepo.use((repo) => repo.names),
          (films) => filmsJson({ films }),
        ),
      ),
    ),
    HttpRouter.route(
      'GET',
      '/lab/:film/options',
      answered(
        Effect.gen(function* () {
          const { film } = yield* HttpRouter.schemaPathParams(FilmParams);
          return yield* choicesJson(yield* (yield* Choices).list(film));
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      '/lab/:film/options/score/pick',
      answered(
        Effect.gen(function* () {
          const { film } = yield* HttpRouter.schemaPathParams(FilmParams);
          const { option } = yield* HttpServerRequest.schemaBodyJson(ScorePick);
          return yield* answer(film, yield* (yield* Choices).pickScore(film, option));
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      '/lab/:film/options/score/:option/mix',
      answered(
        Effect.gen(function* () {
          const { film, option } = yield* HttpRouter.schemaPathParams(OptionParams);
          return yield* serve(yield* (yield* Choices).scoreMix(film, option), MIXED);
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      '/lab/:film/options/effect/:sound/takes/:take/audio',
      answered(
        Effect.gen(function* () {
          const { film, sound, take } = yield* HttpRouter.schemaPathParams(TakeParams);
          return yield* serve(yield* (yield* Choices).takeAudio(film, sound, take), IMMUTABLE);
        }),
      ),
    ),
    HttpRouter.route(
      'GET',
      '/lab/:film/options/effect/:sound/takes/:take/mix',
      answered(
        Effect.gen(function* () {
          const { film, sound, take } = yield* HttpRouter.schemaPathParams(TakeParams);
          return yield* serve(yield* (yield* Choices).takeMix(film, sound, take), MIXED);
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      '/lab/:film/options/effect/:sound/takes',
      answered(
        Effect.gen(function* () {
          const { film, sound } = yield* HttpRouter.schemaPathParams(SoundParams);
          const { take, act } = yield* HttpServerRequest.schemaBodyJson(TakeCuration);
          return yield* answer(film, yield* (yield* Choices).curate(film, sound, take, act));
        }),
      ),
    ),
    HttpRouter.route(
      'POST',
      '/lab/:film/undo',
      answered(Effect.flatMap(HttpRouter.schemaPathParams(FilmParams), (p) => undone(p.film))),
    ),
    HttpRouter.route(
      'POST',
      '/lab/:film/redo',
      answered(Effect.flatMap(HttpRouter.schemaPathParams(FilmParams), (p) => redone(p.film))),
    ),
    HttpRouter.route(
      'GET',
      '/lab/:film/check',
      answered(Effect.flatMap(HttpRouter.schemaPathParams(FilmParams), (p) => checked(p.film))),
    ),
  ]);
