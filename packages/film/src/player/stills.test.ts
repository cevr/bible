// The stills are drawn one at a time, the page given a turn between them, in
// the order the page last wanted them: what is on screen first, the rest
// after; a time is drawn once (a time in the same frame is the same still),
// and a sheet waits for every still it asked for.

import { describe, expect, it } from 'effect-bun-test';
import { Effect } from 'effect';
import { standInDom } from '../canvas/fixtures/stand-in.ts';
import { makeStills } from './stills.ts';

/** A film that draws nothing and remembers each time it was asked to draw. */
const recording = () => {
  const times: Array<number> = [];
  return {
    times,
    film: { width: 640, height: 360, fps: 30, render: (_: unknown, T: number) => times.push(T) },
  };
};

/** A page whose turns the test hands out one at a time. */
const turns = () => {
  const waiting: Array<() => void> = [];
  return {
    turn: () => new Promise<void>((resolve) => waiting.push(resolve)),
    /** Give the page its next turn, and let the stills draw on. */
    next: () =>
      Effect.promise(async () => {
        waiting.shift()?.();
        await Promise.resolve();
        await Promise.resolve();
      }),
  };
};

const withDom = <A, E>(self: Effect.Effect<A, E>) =>
  Effect.scoped(Effect.andThen(standInDom(), self));

describe('makeStills', () => {
  it.effect('draws what is wanted one still a turn, in the order wanted, at its size', () =>
    withDom(
      Effect.gen(function* () {
        const { film, times } = recording();
        const page = turns();
        const stills = makeStills(film, {
          width: 160,
          captions: false,
          turn: page.turn,
          now: () => 0,
        });
        expect([stills.width, stills.height]).toEqual([160, 90]);
        stills.want([5, 10, 15]);
        expect(times).toEqual([5]);
        expect(stills.at(5)._tag).toBe('Some');
        expect(stills.at(10)._tag).toBe('None');
        yield* page.next();
        expect(times).toEqual([5, 10]);
        yield* page.next();
        yield* page.next();
        expect(times).toEqual([5, 10, 15]);
        expect(stills.drawn().count).toBe(3);
      }),
    ),
  );

  it.effect('what is wanted last is drawn first; what was wanted before waits behind it', () =>
    withDom(
      Effect.gen(function* () {
        const { film, times } = recording();
        const page = turns();
        const stills = makeStills(film, {
          width: 160,
          captions: false,
          turn: page.turn,
          now: () => 0,
        });
        stills.want([0, 5, 10, 15]);
        // The page scrolled: the stills now on screen go next.
        stills.want([40, 45]);
        for (let k = 0; k < 6; k += 1) yield* page.next();
        expect(times).toEqual([0, 40, 45, 5, 10, 15]);
      }),
    ),
  );

  it.effect('a still is drawn once: a time in a frame drawn already is that still', () =>
    withDom(
      Effect.gen(function* () {
        const { film, times } = recording();
        const page = turns();
        const stills = makeStills(film, {
          width: 160,
          captions: false,
          turn: page.turn,
          now: () => 0,
        });
        stills.want([2]);
        yield* page.next();
        stills.want([2, 2.01, 3]);
        yield* page.next();
        yield* page.next();
        expect(times).toEqual([2, 3]);
        expect(stills.at(2.01)).toEqual(stills.at(2));
      }),
    ),
  );

  it.effect('a sheet waits for every still it asked for, and hears each one land', () =>
    withDom(
      Effect.gen(function* () {
        const { film } = recording();
        const page = turns();
        const stills = makeStills(film, {
          width: 160,
          captions: false,
          turn: page.turn,
          now: () => 0,
        });
        const heard: Array<string> = [];
        const sheet = stills.all([1, 2, 3], (done, of) => heard.push(`${done}/${of}`));
        for (let k = 0; k < 3; k += 1) yield* page.next();
        const drawn = yield* Effect.promise(() => sheet);
        expect(drawn.length).toBe(3);
        expect(heard.at(-1)).toBe('3/3');
      }),
    ),
  );
});
