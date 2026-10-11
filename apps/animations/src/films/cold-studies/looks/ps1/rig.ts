// The ps1 look's one WebGL 2 canvas and what draws into it: a three.js
// renderer at the console's resolution, the world's shared light and fog
// (`World`), and its textures, made once per context and kept. A scene's
// set (the courtroom, the desk) hangs off the rig in its own module's
// WeakMap; every frame sets everything it shows from `f` before it renders.
// The picture reaches the film's frame scaled up nearest-neighbour, each
// low-res pixel a hard block (`present`).

import { glCanvas } from '@bible/film/canvas';
import { WebGLRenderer } from 'three';
import { type World, world } from './shade.ts';
import { type Textures, textures } from './textures.ts';

/**
 * The internal resolution: the console's 320-pixel width at 16:9, so a
 * 1080p frame is exactly 6 × and the half-scale review render 3 × (no
 * uneven pixel columns).
 */
export const LOW = { w: 320, h: 180 } as const;

export interface Rig {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WebGLRenderer;
  readonly world: World;
  readonly tex: Textures;
}

const rigs = new WeakMap<WebGL2RenderingContext, Rig>();

/** The rig, made the first time; none where no WebGL 2 context can be made (`check --draw`'s stand-in). */
export const rigOf = (): Rig | undefined => {
  const gl = glCanvas('ps1', LOW.w, LOW.h);
  if (gl === undefined) return undefined;
  const have = rigs.get(gl.gl);
  if (have !== undefined) return have;
  const renderer = new WebGLRenderer({ canvas: gl.canvas, context: gl.gl, antialias: false });
  renderer.setPixelRatio(1);
  renderer.autoClear = true;
  const made: Rig = { canvas: gl.canvas, renderer, world: world(LOW.w, LOW.h), tex: textures() };
  rigs.set(gl.gl, made);
  return made;
};

/** One set built for a rig and kept with it: `build` runs once per rig. */
export const keptFor = <S>(build: (r: Rig) => S) => {
  const sets = new WeakMap<Rig, S>();
  return (r: Rig): S => {
    const have = sets.get(r);
    if (have !== undefined) return have;
    const made = build(r);
    sets.set(r, made);
    return made;
  };
};

/** The rendered canvas over the whole frame, scaled up nearest-neighbour. */
export const present = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
) => {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, w, h);
  ctx.restore();
};
