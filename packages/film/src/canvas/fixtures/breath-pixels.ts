// Browser side of breath.pixel.test.ts: one dark square on white paper, drawn
// by scenes that differ only in how they frame it (no camera, an unmoved
// camera, a multiplane shot, no camera in their first half and a camera in
// their second; two held still by their own `drift: 0`), rendered through `createFilm` as the export renders it, and
// reported as where the square lands on the frame.

import { Predicate } from 'effect';
import { camera, multiplane } from '../camera.ts';
import { type Film, type KnobRead, type SceneSpec, createFilm } from '../film.ts';
import { offscreen } from '../paper.ts';

const W = 320;
const H = 180;
/** Every scene's length: long enough that its 60 % point is well inside it. */
const DUR = 10;

/** Where the square lands on the frame: its ink's bounding box, and every pixel for exact comparisons. */
export interface Landed {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly pixels: ReadonlyArray<number>;
  /** The knobs the frame read, and the transform each was read under (`a`, `e`: scale and x offset). */
  readonly knobs: ReadonlyArray<readonly [scale: number, dx: number]>;
}

export interface BreathStats {
  /** A scene with no camera, at its start and at its 60 % point. */
  readonly still0: Landed;
  readonly still60: Landed;
  /** A camera on the frame as it is, and a multiplane shot of one plane, at 60 %. */
  readonly shot60: Landed;
  readonly plane60: Landed;
  /** A scene with no camera until half way and a camera after: each half drawn after the other, and afresh. */
  readonly mixedLate: Landed;
  readonly mixedLateFresh: Landed;
  readonly mixedEarly: Landed;
  readonly mixedEarlyFresh: Landed;
  /** A scene held still by its own `drift: 0`, with no camera and with one, at 60 %. */
  readonly held60: Landed;
  readonly heldShot60: Landed;
}

const square = (f: Parameters<SceneSpec['draw']>[0]) => {
  const at = f.knob('at');
  const [x, y] = Predicate.isNumber(at) ? [at, at] : at;
  f.ctx.fillStyle = '#000';
  f.ctx.fillRect(x - 20, y - 20, 40, 40);
};

const still: SceneSpec['draw'] = (f) => square(f);
const shot: SceneSpec['draw'] = (f) => camera(f.ctx, { x: W / 2, y: H / 2 }, W, H, () => square(f));
const plane: SceneSpec['draw'] = (f) =>
  multiplane(f.ctx, { x: W / 2, y: H / 2 }, W, H, [{ z: 1, draw: () => square(f) }], {
    fibre: 0,
  });
const mixed: SceneSpec['draw'] = (f) => (f.t < f.dur / 2 ? still(f) : shot(f));

const scenes = { still, shot, plane, mixed, held: still, heldShot: shot };
/** The scenes that set their own breath: none, in a film that breathes. */
const HELD = new Set(['held', 'heldShot']);
/** A scene's own breath: none for a held one, the film's for the rest. */
const own = (id: string): Pick<SceneSpec, 'drift'> => (HELD.has(id) ? { drift: 0 } : {});
const ORDER = Object.keys(scenes);

/** The film, made afresh: nothing it drew before carries into it. */
const film = (): Film =>
  createFilm({
    title: 'breath',
    width: W,
    height: H,
    paper: { base: '#ffffff', tone: '#ffffff', seed: 1 },
    shade: '#ffffff',
    finish: { vignette: 0, grain: 0 },
    scenes: Object.entries(scenes).map(([id, draw]) => ({
      id,
      min: DUR,
      knobs: { at: [W / 2, H / 2] },
      draw,
      ...own(id),
    })),
  });

const { ctx } = offscreen(W, H);

/** Draw `scene` `through` its length (0..1) on `into`, and find the square. */
const land = (into: Film, scene: string, through: number): Landed => {
  const knobs: KnobRead[] = [];
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  into.render(ctx, (ORDER.indexOf(scene) + through) * DUR, { knobs });
  const data = ctx.getImageData(0, 0, W, H).data;
  let left = W;
  let right = -1;
  let top = H;
  let bottom = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if ((data[(y * W + x) * 4] ?? 255) >= 128) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  return {
    left,
    right,
    top,
    bottom,
    pixels: Array.from(data),
    knobs: knobs.map((k) => [k.transform?.[0] ?? 0, k.transform?.[4] ?? 0] as const),
  };
};

const breathStats = (): BreathStats => {
  const late = film();
  land(late, 'mixed', 0.2);
  const early = film();
  land(early, 'mixed', 0.8);
  return {
    still0: land(film(), 'still', 0),
    still60: land(film(), 'still', 0.6),
    shot60: land(film(), 'shot', 0.6),
    plane60: land(film(), 'plane', 0.6),
    mixedLate: land(late, 'mixed', 0.8),
    mixedLateFresh: land(film(), 'mixed', 0.8),
    mixedEarly: land(early, 'mixed', 0.2),
    mixedEarlyFresh: land(film(), 'mixed', 0.2),
    held60: land(film(), 'held', 0.6),
    heldShot60: land(film(), 'heldShot', 0.6),
  };
};

Object.assign(globalThis, { breathStats });
