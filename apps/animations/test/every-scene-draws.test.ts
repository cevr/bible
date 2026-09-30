// Every scene of every registered film draws, and every sampled frame is
// pure: `film check --draw`'s leg (`drawLeg`), run in the gate on each film
// as `film check` loads it and its page builds it. A scene that reads a mark,
// a cue or a knob its film no longer has throws at draw time, and a frame
// that depends on the one drawn before it is not pure. Both are errors; ink
// over a face is the leg's warning, for `film check` to show.

import { BunServices } from '@effect/platform-bun';
import { ContentStore, FilmRepo, drawLeg, laidOut, levelOf } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer } from 'effect';
import { FILMS } from '../server.ts';
import { films } from '../src/films/index.ts';

const Repo = FilmRepo.layer(FILMS).pipe(
  Layer.provide(ContentStore.layer),
  Layer.provideMerge(BunServices.layer),
);

/**
 * One pass over righteousness-by-faith (about 700 draws and 360 purity
 * samples of four draws each) takes about 25 s alone; the gate runs it beside
 * every other package's tests on a shared box, so its budget is wide.
 */
const BUDGET = 120_000;

describe('every scene draws, and every sampled frame is pure', () => {
  for (const name of Object.keys(films))
    it.effect.layer(Repo)(
      `${name}: film check --draw finds no throw and no impure frame`,
      () =>
        Effect.gen(function* () {
          const film = yield* (yield* FilmRepo).load(name);
          const { scope } = yield* Effect.fromResult(laidOut(film, { _tag: 'Film' }));
          const found = yield* drawLeg(film, scope);
          const errors = found.filter((f) => levelOf(f, { allowStale: false }) === 'error');
          expect(errors.map((f) => f.message)).toEqual([]);
        }),
      BUDGET,
    );
});
