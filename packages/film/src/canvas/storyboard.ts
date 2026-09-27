// A placeholder for a beat that has words but no drawing yet: the beat's id
// and its picture brief, pinned to the page like a storyboard card.

import type { SceneSpec } from './film.ts';
import { rectShape } from './ink.ts';
import { cutout } from './cutout.ts';
import { type TextStyle, block, wrap, write } from './type.ts';
import { progress } from '../core/time.ts';

const BRIEF_WIDTH = 1080;
/** From the first baseline to the card's lower margin. */
const BRIEF_HEIGHT = 340;

/**
 * The brief's type, a size small enough that the whole brief fits on the
 * card: a long brief never runs off it into the captions.
 */
const briefStyle = (ctx: CanvasRenderingContext2D, picture: string): TextStyle => {
  const at = (size: number): TextStyle => ({
    family: 'Fraunces',
    size,
    color: '#2a3440',
    leading: 1.35,
  });
  let size = 38;
  while (size > 20 && wrap(ctx, picture, BRIEF_WIDTH, at(size)).length * size * 1.35 > BRIEF_HEIGHT)
    size -= 2;
  return at(size);
};

export const storyboard = (id: string, picture: string): Omit<SceneSpec, 'id' | 'say'> => ({
  enter: { kind: 'fade', dur: 0.4 },
  draw: (f) => {
    const { ctx } = f;
    const lift = progress(f.t, 0, 0.6);
    ctx.globalAlpha = lift;
    cutout(
      ctx,
      rectShape(360, 250, 1200, 520),
      { color: '#fbf6ea', torn: 3, rim: 0, shadow: 0.6, grain: 0.3 },
      f.hand('card'),
    );
    write(
      ctx,
      `storyboard · ${id}`,
      420,
      330,
      { family: 'Inter', size: 28, weight: 600, color: '#b5533c', tracking: 0.08 },
      f.hand('id'),
    );
    block(ctx, picture, 420, 400, BRIEF_WIDTH, briefStyle(ctx, picture), f.hand('brief'), {
      boil: 0.3,
    });
  },
});
