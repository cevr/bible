// Browser side of light.pixel.test.ts: white paper and nothing drawn on it,
// lit by scenes that differ only in their `light` (none, an even grey, a pool
// from white to black, a grey coming up across the scene), rendered through
// `createFilm` as the export renders it, with no vignette, grain or breath,
// and reported as the red of the frame's middle and corner pixels.

import { type Frame, type Light, type SceneSpec, createFilm } from '../film.ts';
import { offscreen } from '../paper.ts';

const W = 320;
const H = 180;
const DUR = 10;

/** One frame's middle and corner, as red 0–255. */
export interface Lit {
  readonly middle: number;
  readonly corner: number;
}

export interface LightStats {
  readonly unlit: Lit;
  readonly even: Lit;
  readonly pool: Lit;
  /** The grey coming up, a quarter and three quarters through the scene. */
  readonly rising25: Lit;
  readonly rising75: Lit;
}

/** The rising light: one object, its amount rewritten each frame. */
const RISING = { color: '#808080', amount: 0 };
const rising = (f: Frame): Light => {
  RISING.amount = f.t / f.dur;
  return RISING;
};

const lights: ReadonlyArray<readonly [string, SceneSpec['light']]> = [
  ['unlit', undefined],
  ['even', { color: '#808080' }],
  ['pool', { color: '#ffffff', edge: '#000000' }],
  ['rising', rising],
];

const film = createFilm({
  title: 'light',
  width: W,
  height: H,
  paper: { base: '#ffffff', tone: '#ffffff', seed: 1 },
  shade: '#ffffff',
  finish: { vignette: 0, grain: 0 },
  scenes: lights.map(([id, light]) => ({
    id,
    min: DUR,
    drift: 0,
    draw: () => {},
    light,
  })),
});

const { ctx } = offscreen(W, H);

/** Render `scene` `through` its length (0..1) and read its middle and corner. */
const read = (scene: string, through: number): Lit => {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const index = lights.findIndex(([id]) => id === scene);
  film.render(ctx, (index + through) * DUR);
  return {
    middle: ctx.getImageData(W / 2, H / 2, 1, 1).data[0] ?? -1,
    corner: ctx.getImageData(0, 0, 1, 1).data[0] ?? -1,
  };
};

const lightStats = (): LightStats => ({
  unlit: read('unlit', 0.5),
  even: read('even', 0.5),
  pool: read('pool', 0.5),
  rising25: read('rising', 0.25),
  rising75: read('rising', 0.75),
});

Reflect.set(globalThis, 'lightStats', lightStats);
