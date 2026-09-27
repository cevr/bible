// A film's beats against its Rive project: the artboard that draws each beat,
// how the beat's marks pin to that artboard's Events, and where each Event
// plays on the voice's clock. `film sync` writes the Film from it, `film check`
// reads its gaps, and the mix places sounds on its Events. Pure.

import { Option } from 'effect';
import type { FilmScene } from './film-board.ts';
import type { Placed } from './layout.ts';
import type { RiveDocument, SceneBoard } from './rive.ts';
import type { EventTimes } from './sound.ts';
import { type Knot, type ScenePins, realAt, scenePins } from './warp.ts';

export interface FilmScenes {
  /** Each beat that has an artboard of its name, in film order, with its warp. */
  readonly scenes: ReadonlyArray<FilmScene>;
  /** How each of those beats' marks meet its artboard's Events. */
  readonly pins: ReadonlyArray<ScenePins>;
  /** Beats with no artboard of their name: `film sync` seeds each a storyboard. */
  readonly missing: ReadonlyArray<string>;
}

/** Pair each placed beat with the artboard of its name, and pin its marks to that artboard's Events. */
export const filmScenes = (placed: ReadonlyArray<Placed>, doc: RiveDocument): FilmScenes => {
  const drawn = placed.flatMap((p) =>
    Option.toArray(
      Option.map(Option.fromNullishOr(doc.boards.get(p.spec.id)), (board) => {
        const pins = scenePins(p, board);
        return { scene: { placed: p, board, knots: pins.knots }, pins };
      }),
    ),
  );
  return {
    scenes: drawn.map((d) => d.scene),
    pins: drawn.map((d) => d.pins),
    missing: placed.filter((p) => !doc.boards.has(p.spec.id)).map((p) => p.spec.id),
  };
};

/** Where each of a board's Events first fires, in scene seconds, through the warp. */
const firstKeys = (board: SceneBoard, knots: ReadonlyArray<Knot>): ReadonlyMap<string, number> => {
  const times = new Map<string, number>();
  for (const event of board.events)
    if (!times.has(event.name)) times.set(event.name, realAt(knots, event.at));
  return times;
};

/** Where each scene's Events play, in scene seconds: the first key of each, through its warp. */
export const eventTimes = (scenes: ReadonlyArray<FilmScene>): EventTimes =>
  new Map(
    scenes.map((s): readonly [string, ReadonlyMap<string, number>] => [
      s.placed.spec.id,
      firstKeys(s.board, s.knots),
    ]),
  );
