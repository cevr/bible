// Every scene of every registered film draws, and every sampled frame is
// pure: `film check --draw`'s leg (`drawFindings`, packages/film
// tools/draw-check.ts), run in the gate on each film as its page builds it
// (its own `film()` from its committed timings). A scene that reads a mark, a
// cue or a knob its film no longer has throws at draw time (4f46add3); a
// frame that depends on the one drawn before it is not pure (ab75a2a1,
// 5da347fd). Both are errors; ink over a face is the leg's warning, for
// `film check` to show.

import { BunServices } from '@effect/platform-bun';
import type { FilmModule } from '@bible/film/player';
import { TimingsJson } from '@bible/film/core';
import { drawFindings, importFilmModule, levelOf } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Path, Predicate, Schema } from 'effect';
import { FILMS } from '../server.ts';
import { films } from '../src/films/index.ts';

/** A film's module: the film, built from its narration (`narratedFilms`). */
const FilmFile = Schema.Struct({
  film: Schema.declare((u): u is FilmModule['film'] => Predicate.isFunction(u)),
});

/** A film as its page builds it: its own `film()`, from its committed timings. */
const builderOf = Effect.fn('test.builderOf')(function* (film: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const module = yield* Effect.promise(() => importFilmModule(path.join(FILMS, film, 'film.ts')));
  const build = (yield* Schema.decodeUnknownEffect(FilmFile)(module)).film;
  const timings = yield* Schema.decodeEffect(TimingsJson)(
    yield* fs.readFileString(path.join(FILMS, film, 'narration', 'timings.json')),
  );
  return () => build({ timings, audio: `/films/${film}/narration/full.wav` });
});

/**
 * One pass over righteousness-by-faith (about 700 draws and 360 purity
 * samples of four draws each) takes about 25 s alone; the gate runs it beside
 * every other package's tests on a shared box, so its budget is wide.
 */
const BUDGET = 120_000;

describe('every scene draws, and every sampled frame is pure', () => {
  for (const name of Object.keys(films))
    it.effect.layer(BunServices.layer)(
      `${name}: film check --draw finds no throw and no impure frame`,
      () =>
        Effect.gen(function* () {
          const found = yield* drawFindings(yield* builderOf(name));
          const errors = found.filter((f) => levelOf(f, { allowStale: false }) === 'error');
          expect(errors.map((f) => f.message)).toEqual([]);
        }).pipe(Effect.scoped),
      BUDGET,
    );
});
