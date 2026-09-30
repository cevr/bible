// A callback, or a shot carried over a cut, draws another scene's paper torn
// as that scene tore it: `f.handsOf(scene)` gives that scene's hands exactly
// as its own `f.hand` does there (the same seed rule, one function), boiling
// on this frame's tick, and a scene the film lacks fails naming it rather
// than tearing new paper. Drawn through `createFilm` into a stand-in context;
// bun has no canvas.

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import type { Hand } from './ink.ts';
import { type SceneSpec, createFilm } from './film.ts';
import { recorder, withDom } from './fixtures/stand-in.ts';

const W = 64;
const H = 36;
const DUR = 10;
const KEYS = ['x', 'robe', 'heart'] as const;

describe('f.handsOf', () => {
  test("gives another scene's hands as its own f.hand gives them, on this frame's boil, and refuses a scene the film lacks", () => {
    let own: ReadonlyArray<Hand> = [];
    let borrowed: ReadonlyArray<Hand> = [];
    let taker: ReadonlyArray<Hand> = [];
    let unknown: string | undefined;
    const giver: SceneSpec['draw'] = (f) => {
      own = KEYS.map((k) => f.hand(k));
    };
    const takes: SceneSpec['draw'] = (f) => {
      const hands = f.handsOf('giver');
      borrowed = KEYS.map((k) => hands(k));
      taker = KEYS.map((k) => f.hand(k));
      unknown = Effect.runSync(
        Effect.try({
          try: () => f.handsOf('giver '),
          catch: (e) => (e instanceof Error ? e.message : String(e)),
        }).pipe(
          Effect.match({ onFailure: (m): string | undefined => m, onSuccess: () => undefined }),
        ),
      );
    };
    withDom(() => {
      const film = createFilm({
        title: 'hands',
        width: W,
        height: H,
        paper: { base: '#ffffff', tone: '#ffffff', seed: 1 },
        shade: '#ffffff',
        finish: { vignette: 0, grain: 0 },
        scenes: [
          { id: 'giver', min: DUR, draw: giver },
          { id: 'taker', min: DUR, draw: takes },
        ],
      });
      const { ctx } = recorder(W, H);
      film.render(ctx, 0.5 * DUR);
      film.render(ctx, 1.5 * DUR);
    });
    expect(own).toHaveLength(3);
    // Torn as the owning scene tore it: the same seeds, key for key.
    expect(borrowed.map((h) => h.seed)).toEqual(own.map((h) => h.seed));
    // Boiling on the frame it is drawn in.
    expect(borrowed.map((h) => h.boil)).toEqual(taker.map((h) => h.boil));
    expect(borrowed.map((h) => h.boil)).not.toEqual(own.map((h) => h.boil));
    // Not this scene's own paper.
    expect(borrowed.map((h) => h.seed)).not.toEqual(taker.map((h) => h.seed));
    // A mistyped scene fails, naming it.
    expect(unknown).toContain('"giver "');
  });
});
