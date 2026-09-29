// Browser side of hands.pixel.test.ts: a film of two scenes, `giver` and
// `taker`, drawn through `createFilm` as the export draws them. `giver`
// reports its own hands; `taker` reports `giver`'s hands as `f.handsOf` gives
// them there, its own, and what `f.handsOf` does with a scene the film lacks.

import { Effect } from 'effect';
import type { Hand } from '../ink.ts';
import { type SceneSpec, createFilm } from '../film.ts';
import { offscreen } from '../paper.ts';

const W = 64;
const H = 36;
const DUR = 10;
const KEYS = ['x', 'robe', 'heart'] as const;

export interface HandsStats {
  /** `giver`'s own `f.hand(key)` for each key, drawn in `giver`. */
  readonly own: ReadonlyArray<Hand>;
  /** `f.handsOf('giver')(key)` for each key, drawn in `taker`. */
  readonly borrowed: ReadonlyArray<Hand>;
  /** `taker`'s own `f.hand(key)`, for its boil and to show its seeds are its own. */
  readonly taker: ReadonlyArray<Hand>;
  /** What `f.handsOf` threw for a scene the film lacks, or `undefined` when it threw nothing. */
  readonly unknown: string | undefined;
}

/** What the two scenes report as they draw, rewritten by each. */
interface Collected {
  own: ReadonlyArray<Hand>;
  borrowed: ReadonlyArray<Hand>;
  taker: ReadonlyArray<Hand>;
  unknown: string | undefined;
}

const stats: Collected = {
  own: [],
  borrowed: [],
  taker: [],
  unknown: undefined,
};

const giver: SceneSpec['draw'] = (f) => {
  stats.own = KEYS.map((k) => f.hand(k));
};

const taker: SceneSpec['draw'] = (f) => {
  const hands = f.handsOf('giver');
  stats.borrowed = KEYS.map((k) => hands(k));
  stats.taker = KEYS.map((k) => f.hand(k));
  stats.unknown = Effect.runSync(
    Effect.try({
      try: () => f.handsOf('giver '),
      catch: (e) => (e instanceof Error ? e.message : String(e)),
    }).pipe(Effect.match({ onFailure: (m): string | undefined => m, onSuccess: () => undefined })),
  );
};

const handsStats = (): HandsStats => {
  const film = createFilm({
    title: 'hands',
    width: W,
    height: H,
    paper: { base: '#ffffff', tone: '#ffffff', seed: 1 },
    shade: '#ffffff',
    finish: { vignette: 0, grain: 0 },
    scenes: [
      { id: 'giver', min: DUR, draw: giver },
      { id: 'taker', min: DUR, draw: taker },
    ],
  });
  const { ctx } = offscreen(W, H);
  film.render(ctx, 0.5 * DUR);
  film.render(ctx, 1.5 * DUR);
  return { ...stats };
};

Object.assign(globalThis, { handsStats });
