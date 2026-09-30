// Every drawn scene breathes, exactly once (DIRECTION, "Always breathing,
// never busy"): a scene with no camera breathes as a whole, a scene with a
// camera or a multiplane shot breathes through it, and none breathes twice.
// Where one frame lands never depends on what the film drew before it. Drawn
// through `createFilm` into a stand-in context that keeps the transform, so
// where the scene's square lands is read from the transform it was filled
// under; bun has no canvas.

import { describe, expect, test } from 'bun:test';
import { Predicate } from 'effect';
import { type Affine, applyAffine } from '../core/affine.ts';
import { DRIFT, camera, multiplane } from './camera.ts';
import { type Film, type KnobRead, type SceneSpec, createFilm } from './film.ts';
import { type Recorder, recorder, withDom } from './fixtures/stand-in.ts';

const W = 320;
const H = 180;
/** Every scene's length: long enough that its 60 % point is well inside it. */
const DUR = 10;
const INK = '#000';

const square = (f: Parameters<SceneSpec['draw']>[0]) => {
  const at = f.knob('at');
  const [x, y] = Predicate.isNumber(at) ? [at, at] : at;
  f.ctx.fillStyle = INK;
  f.ctx.fillRect(x - 20, y - 20, 40, 40);
};

const still: SceneSpec['draw'] = (f) => square(f);
const shot: SceneSpec['draw'] = (f) => camera(f.ctx, { x: W / 2, y: H / 2 }, W, H, () => square(f));
const plane: SceneSpec['draw'] = (f) =>
  multiplane(f.ctx, { x: W / 2, y: H / 2 }, W, H, [{ z: 1, draw: () => square(f) }], {
    fibre: 0,
  });
/** No camera in its first half, a camera in its second. */
const mixed: SceneSpec['draw'] = (f) => (f.t < f.dur / 2 ? still(f) : shot(f));

const scenes = { still, shot, plane, mixed, held: still, heldShot: shot };
/** The scenes that set their own breath: none, in a film that breathes. */
const HELD = new Set(['held', 'heldShot']);
const ORDER = Object.keys(scenes);

/** The film, made afresh: nothing it drew before carries into it. */
const film = (): Film =>
  withDom(() =>
    createFilm({
      title: 'breath',
      width: W,
      height: H,
      paper: { base: '#ffffff', tone: '#ffffff', seed: 1 },
      shade: '#ffffff',
      finish: { vignette: 0, grain: 0 },
      scenes: Object.entries(scenes).map(([id, draw]): SceneSpec => {
        const scene = { id, min: DUR, knobs: { at: [W / 2, H / 2] as const }, draw };
        return HELD.has(id) ? { ...scene, drift: 0 } : scene;
      }),
    }),
  );

/** One frame of `scene`, `through` its length (0..1): what it drew and the knobs it read. */
const frame = (into: Film, scene: string, through: number) => {
  const r: Recorder = recorder(W, H);
  const knobs: KnobRead[] = [];
  withDom(() => into.render(r.ctx, (ORDER.indexOf(scene) + through) * DUR, { knobs }));
  return { r, knobs };
};

/**
 * What is left on the frame: everything drawn since the last paper, which is
 * opaque and covers the frame, so what a frame drew before it is gone.
 */
const shown = (r: Recorder) => {
  const paper = r.ops.findLastIndex(
    (op) => op._tag === 'Image' && op.alpha === 1 && op.comp === 'source-over',
  );
  return r.ops
    .slice(paper)
    .map((op) =>
      op._tag === 'Fill'
        ? { ...op, style: Predicate.isString(op.style) ? op.style : op.style._tag }
        : { ...op, image: [op.image.width, op.image.height] },
    );
};

/** Where the square landed: its centre and width on the frame. */
const landed = (r: Recorder) => {
  const fills = shown(r).filter((op) => op._tag === 'Fill' && op.style === INK);
  expect(fills).toHaveLength(1);
  const m: Affine = fills[0]?.m ?? [0, 0, 0, 0, 0, 0];
  const [x, y] = applyAffine(m, [W / 2, H / 2]);
  return { x, y, w: 40 * Math.hypot(m[0], m[1]) };
};

/** One breath at 60 % of a scene: the square pushed in and slid left, from the frame's centre. */
const BREATH = Math.sin(Math.PI * 0.6);
const ONCE = { x: W / 2 - DRIFT.x * BREATH, y: H / 2, w: 40 * (1 + DRIFT.zoom * BREATH) };
const FRAMED = { x: W / 2, y: H / 2, w: 40 };

const near = (got: { x: number; y: number; w: number }, want: typeof got) => {
  expect(got.x).toBeCloseTo(want.x, 6);
  expect(got.y).toBeCloseTo(want.y, 6);
  expect(got.w).toBeCloseTo(want.w, 6);
};

describe('every scene breathes, once', () => {
  test('a scene with no camera, a camera or a multiplane shot all breathe one breath', () => {
    // At its start a scene is as framed; at 60 % a scene with no camera has moved.
    near(landed(frame(film(), 'still', 0).r), FRAMED);
    near(landed(frame(film(), 'still', 0.6).r), ONCE);
    // A camera or a multiplane shot breathes once, as far as the scene with none: never twice.
    near(landed(frame(film(), 'shot', 0.6).r), ONCE);
    near(landed(frame(film(), 'plane', 0.6).r), ONCE);
  });

  test('a knob is read once, where it breathes, not once per attempt at the frame', () => {
    for (const scene of ['still', 'shot', 'mixed']) {
      const { knobs } = frame(film(), scene, 0.6);
      expect(knobs.map((k) => k.name)).toEqual(['at']);
    }
    // First drawn whole, then again through its camera: the read kept is the second draw's.
    expect(frame(film(), 'still', 0.6).knobs[0]?.transform?.[0]).toBeCloseTo(
      1 + DRIFT.zoom * BREATH,
    );
  });

  test('a frame never depends on the one the film drew before it', () => {
    // A scene that frames with a camera in one half and without in the other
    // draws each frame the same whether the film drew the other half first or
    // nothing at all.
    const late = film();
    frame(late, 'mixed', 0.2);
    expect(shown(frame(late, 'mixed', 0.8).r)).toEqual(shown(frame(film(), 'mixed', 0.8).r));
    const early = film();
    frame(early, 'mixed', 0.8);
    expect(shown(frame(early, 'mixed', 0.2).r)).toEqual(shown(frame(film(), 'mixed', 0.2).r));
    near(landed(frame(early, 'mixed', 0.2).r), landed(frame(film(), 'still', 0.2).r));
  });

  test('a scene that sets its own drift: 0 holds still in a breathing film, with a camera or without', () => {
    near(landed(frame(film(), 'held', 0.6).r), FRAMED);
    near(landed(frame(film(), 'heldShot', 0.6).r), FRAMED);
  });
});
