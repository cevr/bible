// A note's still shows its panel or is refused: a panel with no try yet, a
// try whose image will not load, and a card the engine cannot set each answer
// StillUnmade, so no note names a try its still lacks.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Option, Schema } from 'effect';
import type { PickedPanel } from './context.tsx';
import { StillUnmade, stillOf } from './still.ts';
import type { Film } from '../../canvas/film.ts';
import { standInDom } from '../../canvas/fixtures/stand-in.ts';
import type { BoardTry } from '../../core/board.ts';

/** A film with only what a still reads of it: its size, its title, no card style. */
const film: Film = Schema.decodeSync(Schema.Any)({
  width: 64,
  height: 36,
  title: 'probe',
  look: {},
});

const tried: BoardTry = Schema.decodeSync(Schema.Any)({
  n: 1,
  file: 'one.start.1.png',
  sha256: 'x',
  made: 'generate',
  refs: [],
  at: '2026-10-14T00:00:00.000Z',
});

/** Beat `one`'s panel `start`, `over` what it holds. */
const picked = (over: {
  readonly panel?: object;
  readonly tried?: Option.Option<BoardTry>;
}): PickedPanel =>
  Schema.decodeSync(Schema.Any)({
    beat: {
      id: 'one',
      start: 0,
      end: 4,
      placed: { voice: { words: [], marks: new Map() } },
      line: [],
    },
    panel: { id: 'one.start', beat: 'one', at: 'start', tries: [], ...over.panel },
    at: 0,
    tried: over.tried ?? Option.none(),
  });

/** Why the still of `p` was not made, its image loaded by `load`. */
const unmade = (
  p: PickedPanel,
  load: Parameters<typeof stillOf>[3] = () => Effect.die('loads nothing'),
) => Effect.flip(stillOf(film, p, [], load, 0)).pipe(Effect.map((e) => e.reason));

describe('a note still', () => {
  it.effect('is refused for a panel with no try yet', () =>
    Effect.gen(function* () {
      yield* standInDom();
      expect(yield* unmade(picked({}))).toContain('has no try yet');
    }).pipe(Effect.scoped),
  );
  it.effect("is refused when the try's image will not load", () =>
    Effect.gen(function* () {
      yield* standInDom();
      const p = picked({ panel: { tries: [tried] }, tried: Option.some(tried) });
      const reason = yield* unmade(p, (file) =>
        Effect.fail(StillUnmade.make({ reason: `${file} did not load` })),
      );
      expect(reason).toBe('one.start.1.png did not load');
    }).pipe(Effect.scoped),
  );
  it.effect('is refused when the card will not set', () =>
    Effect.gen(function* () {
      yield* standInDom();
      const p = picked({ panel: { text: { _tag: 'Card', payoff: 'just' } } });
      expect(yield* unmade(p)).toContain('sets no card style');
    }).pipe(Effect.scoped),
  );
});
