// A multiplane shot is judged by where each plane lands and how much haze
// lies over it, so the stand-in context tracks the transform and records
// every veil; bun has no canvas.

import { describe, expect, test } from 'bun:test';
import { type Affine, IDENTITY, applyAffine } from '../core/affine.ts';
import {
  type Camera,
  DRIFT,
  type Drift,
  PLANE_LIFT_MAX,
  PLANE_LIFT_MIN,
  type SceneBreath,
  camera,
  driftHeld,
  hearingCameras,
  inset,
  insideCamera,
  knobCamera,
  lerpCamera,
  multiplane,
  planeView,
  pushInto,
  shotPath,
} from './camera.ts';
import { heightOf } from './cutout.ts';
import { FIBRE_SIZE, PLANE_FIBRE } from './fibre.ts';
import { type Recorder, isPattern, recorder, withDom } from './fixtures/stand-in.ts';

/** One plane of a `multiplane` shot. */
type Plane = Parameters<typeof multiplane>[4][number];

describe('knobCamera', () => {
  test('a framing from its knobs: where it looks, how close, and a turn only when given', () => {
    expect(knobCamera([800, 610], 1.22)).toEqual({ x: 800, y: 610, zoom: 1.22 });
    expect(knobCamera([800, 610], 1.22, 0.05)).toEqual({ x: 800, y: 610, zoom: 1.22, rot: 0.05 });
  });
});

describe('shotPath', () => {
  const REST: Camera = { x: 960, y: 540 };
  const FACE: Camera = { x: 700, y: 600, zoom: 2.5 };
  const WIDE: Camera = { x: 1000, y: 500, zoom: 0.8, rot: 0.1 };

  test('is the base, zoom 1 and no turn, while no stop has begun', () => {
    expect(shotPath(REST, [[0, FACE]])).toEqual({ x: 960, y: 540, zoom: 1, rot: 0 });
    expect(shotPath(FACE, [])).toEqual({ x: 700, y: 600, zoom: 2.5, rot: 0 });
  });

  test('a later stop takes over from wherever the earlier ones left the camera', () => {
    // Pushed half way in, then half way back out to WIDE.
    const nested = lerpCamera(
      { x: 0, y: 0 },
      lerpCamera({ x: 0, y: 0 }, REST, FACE, 0.5),
      WIDE,
      0.5,
    );
    expect(
      shotPath(REST, [
        [0.5, FACE],
        [0.5, WIDE],
      ]),
    ).toEqual(nested);
    expect(nested).toEqual({ x: 915, y: 535, zoom: 1.275, rot: 0.05 });
  });

  test('a leg that names pushInto pushes deep with its target in frame all the way', () => {
    // From the page into `roof`'s faith icon: 1 → 14. A straight blend
    // (`lerpCamera`, every leg's default) throws the icon 720 px below the
    // frame half way in.
    const PAGE: Camera = { x: 960, y: 540, zoom: 1 };
    const ICON: Camera = { x: 696, y: 875, zoom: 14 };
    let last = Number.POSITIVE_INFINITY;
    for (let i = 0; i <= 100; i++) {
      const cam = shotPath(PAGE, [[i / 100, ICON, pushInto]]);
      const z = cam.zoom ?? 1;
      const sx = 960 + (ICON.x - cam.x) * z;
      const sy = 540 + (ICON.y - cam.y) * z;
      expect([i, sx >= 0 && sx <= 1920 && sy >= 0 && sy <= 1080]).toEqual([i, true]);
      // Sliding straight to the centre, never back out.
      const off = Math.hypot(sx - 960, sy - 540);
      expect(off).toBeLessThanOrEqual(last + 1e-9);
      last = off;
    }
    // Its zoom grows by a constant ratio: half way is the geometric mean.
    expect(shotPath(PAGE, [[0.5, ICON, pushInto]]).zoom).toBeCloseTo(Math.sqrt(14));
    // The straight blend is still every other leg's.
    const straight = shotPath(PAGE, [[0.45, ICON]]);
    expect(960 + (ICON.x - straight.x) * (straight.zoom ?? 1)).toBeLessThan(0);
  });

  test('pushInto starts and ends on its framings, pulls out as it pushes in, and pans straight', () => {
    const A: Camera = { x: 960, y: 540, zoom: 1 };
    const B: Camera = { x: 300, y: 900, zoom: 6, rot: 0.2 };
    const at = (out: Camera) => [out.x, out.y, out.zoom ?? 1, out.rot ?? 0];
    for (const [got, want] of [
      [pushInto({ x: 0, y: 0 }, A, B, 0), [960, 540, 1, 0]],
      [pushInto({ x: 0, y: 0 }, A, B, 1), [300, 900, 6, 0.2]],
      [pushInto({ x: 0, y: 0 }, B, A, 1), [960, 540, 1, 0]],
    ] as const)
      for (const [i, v] of at(got).entries()) expect(v).toBeCloseTo(want[i] ?? Number.NaN);
    // A pull out is the push in run backward.
    expect(at(pushInto({ x: 0, y: 0 }, B, A, 0.3)).map((v) => v.toFixed(6))).toEqual(
      at(pushInto({ x: 0, y: 0 }, A, B, 0.7)).map((v) => v.toFixed(6)),
    );
    // No change of zoom: a pan, blended straight.
    const PAN: Camera = { x: 100, y: 100, zoom: 1 };
    expect(pushInto({ x: 0, y: 0 }, A, PAN, 0.25)).toEqual(
      lerpCamera({ x: 0, y: 0 }, A, PAN, 0.25),
    );
    // It may write into the camera it starts from.
    const out: Camera = { ...A };
    expect(at(pushInto(out, out, B, 1)).map((v) => v.toFixed(6))).toEqual(
      [300, 900, 6, 0.2].map((v) => v.toFixed(6)),
    );
  });

  test('writes into the camera it is given and leaves the stops alone', () => {
    const out: Camera = { x: 0, y: 0 };
    expect(shotPath(REST, [[1, FACE]], out)).toBe(out);
    expect(out).toEqual({ x: 700, y: 600, zoom: 2.5, rot: 0 });
    expect(FACE).toEqual({ x: 700, y: 600, zoom: 2.5 });
  });
});

/** The alpha of each full-frame veil, in order: every fill but the fibre's. */
const veilsOf = (r: Recorder) => r.fills.filter((f) => !isPattern(f.style)).map((f) => f.alpha);

/** Each pattern fill (the paper's fibre): its alpha, the transform it was laid under, its rect and its tile. */
const fibresOf = (r: Recorder) => r.fills.filter((f) => isPattern(f.style));

/** Where each plane maps the world point `p`, by plane name. */
const shoot = (
  r: Recorder,
  cam: { x: number; y: number; zoom?: number; rot?: number },
  zs: Record<string, number>,
  p: readonly [number, number],
  depth = {},
) => {
  const seen = new Map<string, readonly [number, number]>();
  const order: string[] = [];
  const planes: Plane[] = Object.entries(zs).map(([name, z]) => ({
    z,
    draw: () => {
      order.push(name);
      r.events.push(name);
      seen.set(name, applyAffine(r.now(), p));
      r.filters.set(name, r.ctx.filter);
    },
  }));
  withDom(() => multiplane(r.ctx, cam, 1920, 1080, planes, depth));
  return { seen, order };
};

describe('planeView', () => {
  const REST = [960, 540] as const;
  const SHOT: Camera = { x: 1160, y: 440, zoom: 1.44, rot: 0.02 };

  test('the focal plane moves with the shot', () => {
    expect(planeView({ x: 0, y: 0 }, SHOT, 1, REST)).toEqual({ ...SHOT });
  });

  test('a plane pans by 1 / z of the shot and zooms by its z-th root', () => {
    const far = planeView({ x: 0, y: 0 }, SHOT, 2, REST);
    expect(far.x).toBeCloseTo(1060);
    expect(far.y).toBeCloseTo(490);
    expect(far.zoom).toBeCloseTo(1.2);
    expect(far.rot).toBe(0.02);
    const near = planeView({ x: 0, y: 0 }, SHOT, 0.5, REST);
    expect(near.x).toBeCloseTo(1360);
    expect(near.zoom).toBeCloseTo(1.44 ** 2);
    // The sky at the horizon all but holds still.
    const sky = planeView({ x: 0, y: 0 }, SHOT, 1e6, REST);
    expect(sky.x).toBeCloseTo(960);
    expect(sky.zoom).toBeCloseTo(1);
  });

  test('is pure: the same shot and depth give the same view, and the shot is left alone', () => {
    const before = { ...SHOT };
    const a = planeView({ x: 0, y: 0 }, SHOT, 3, REST);
    const b = planeView({ x: 9, y: 9, zoom: 9 }, SHOT, 3, REST);
    expect(a).toEqual(b);
    expect(SHOT).toEqual(before);
    // It may write into the shot it reads.
    const same: Camera = { ...SHOT };
    expect(planeView(same, same, 3, REST)).toEqual(a);
  });
});

describe('multiplane', () => {
  test('a shot nested in a plane leaves the planes after it framed by the outer shot', () => {
    const p: readonly [number, number] = [1000, 500];
    const alone = shoot(recorder(), { x: 1160, y: 540, zoom: 1.5 }, { far: 2, focal: 1 }, p).seen;
    const r = recorder();
    const seen = new Map<string, readonly [number, number]>();
    const inner: Plane = { z: 1, draw: () => undefined };
    withDom(() =>
      multiplane(r.ctx, { x: 1160, y: 540, zoom: 1.5 }, 1920, 1080, [
        {
          z: 2,
          draw: () => {
            multiplane(r.ctx, { x: 200, y: 900, zoom: 3 }, 1920, 1080, [inner]);
            seen.set('far', applyAffine(r.now(), p));
          },
        },
        { z: 1, draw: () => seen.set('focal', applyAffine(r.now(), p)) },
      ]),
    );
    expect(seen.get('far')).toEqual(alone.get('far'));
    expect(seen.get('focal')).toEqual(alone.get('focal'));
  });

  test('draws the farthest plane first', () => {
    const { order } = shoot(
      recorder(),
      { x: 960, y: 540 },
      { near: 0.5, far: 3, focal: 1 },
      [0, 0],
    );
    expect(order).toEqual(['far', 'focal', 'near']);
  });

  test('lines every plane up while the camera rests, and pans each by 1 / z', () => {
    const rest = shoot(recorder(), { x: 960, y: 540 }, { focal: 1, far: 2 }, [1000, 500]).seen;
    expect(rest.get('far')).toEqual(rest.get('focal'));
    const panned = shoot(
      recorder(),
      { x: 1160, y: 540 },
      { focal: 1, far: 2, near: 0.5 },
      [1000, 500],
    ).seen;
    const dx = (name: string) => (panned.get(name)?.[0] ?? 0) - (rest.get('focal')?.[0] ?? 0);
    expect(dx('focal')).toBeCloseTo(-200);
    expect(dx('far')).toBeCloseTo(-100);
    expect(dx('near')).toBeCloseTo(-400);
  });

  test('pushes in less on far planes', () => {
    const { seen } = shoot(
      recorder(),
      { x: 960, y: 540, zoom: 4 },
      { focal: 1, far: 2 },
      [1060, 540],
    );
    expect((seen.get('focal')?.[0] ?? 0) - 960).toBeCloseTo(400);
    expect((seen.get('far')?.[0] ?? 0) - 960).toBeCloseTo(200);
  });

  test('hazes each plane by the air in front of it, and none over the nearest', () => {
    const r = recorder();
    shoot(r, { x: 960, y: 540 }, { a: 3, b: 2, c: 1, d: 0.5 }, [0, 0], {
      haze: '#fff',
      thickness: 0.5,
    });
    // Behind a, the veils over it compose to e^-(0.5 * 2): the air from z 3 to 1.
    const through = veilsOf(r).reduce((t, v) => t * (1 - v), 1);
    expect(through).toBeCloseTo(Math.exp(-1));
    expect(veilsOf(r)).toHaveLength(2);
  });

  test('hazes the nearest plane too when it stands beyond the focal plane', () => {
    const r = recorder();
    shoot(r, { x: 960, y: 540 }, { a: 3, b: 2 }, [0, 0], { haze: '#fff', thickness: 0.5 });
    // Nothing stands at z 1, yet the air from z 3 to 1 still lies over a,
    // and the air from z 2 to 1 over b: one unit past the focal plane shows 1 - e^-0.5.
    const through = veilsOf(r).reduce((t, v) => t * (1 - v), 1);
    expect(through).toBeCloseTo(Math.exp(-1));
    expect(veilsOf(r).at(-1)).toBeCloseTo(1 - Math.exp(-0.5));
  });

  test('hazes with a sky of stops as with a colour, as thick', () => {
    const flat = recorder();
    shoot(flat, { x: 960, y: 540 }, { a: 3, b: 2 }, [0, 0], { haze: '#fff', thickness: 0.5 });
    const graded = recorder();
    shoot(graded, { x: 960, y: 540 }, { a: 3, b: 2 }, [0, 0], {
      haze: [
        [0, '#ffffff'],
        [1, '#ff8800'],
      ],
      thickness: 0.5,
    });
    expect(veilsOf(graded)).toEqual(veilsOf(flat));
  });

  test('raises each plane by its nearness, 1 / z, unless it names its lift', () => {
    const r = recorder();
    const heights = new Map<string, number>();
    const at = (name: string, z: number): Plane => ({
      z,
      draw: () => heights.set(name, heightOf(r.ctx)),
    });
    withDom(() =>
      multiplane(r.ctx, { x: 960, y: 540 }, 1920, 1080, [
        at('far', 2),
        at('focal', 1),
        at('near', 0.8),
        { ...at('named', 2), lift: 1.5 },
        at('horizon', 40),
        at('lens', 0.05),
      ]),
    );
    expect(heights.get('focal')).toBeCloseTo(1);
    expect(heights.get('far')).toBeCloseTo(0.5);
    expect(heights.get('near')).toBeCloseTo(1.25);
    expect(heights.get('named')).toBeCloseTo(1.5);
    // A shadow never shrinks to a crisp hairline nor floods the frame.
    expect(heights.get('horizon')).toBeCloseTo(PLANE_LIFT_MIN);
    expect(heights.get('lens')).toBeCloseTo(PLANE_LIFT_MAX);
    expect(heightOf(r.ctx)).toBe(1);
  });

  test('lays the paper fibre on the backdrop plane alone, under its own camera', () => {
    const r = recorder();
    const { seen } = shoot(r, { x: 1160, y: 540 }, { far: 3, focal: 1, near: 0.5 }, [1000, 500]);
    expect(r.events).toEqual(['far', 'fibre', 'focal', 'near']);
    expect(fibresOf(r)).toHaveLength(1);
    const fibre = fibresOf(r)[0];
    expect(fibre?.alpha).toBeCloseTo(PLANE_FIBRE);
    // One blit at a whole-pixel offset over the whole frame.
    const [, , , , ox = 0, oy = 0] = fibre?.m ?? IDENTITY;
    expect(fibre?.m).toEqual([1, 0, 0, 1, Math.round(ox), Math.round(oy)]);
    expect(fibre?.rect).toEqual([0 - ox, 0 - oy, 1920, 1080]);
    // Laid in the backdrop's world: where the backdrop drew the point, the
    // tile holds that point's own place in it, to the rounded pixel.
    const [sx, sy] = seen.get('far') ?? [0, 0];
    const wrap = (n: number) => ((n % FIBRE_SIZE) + FIBRE_SIZE) % FIBRE_SIZE;
    expect(Math.abs(wrap(sx - ox) - wrap(1000))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(wrap(sy - oy) - wrap(500))).toBeLessThanOrEqual(0.5);
  });

  test('scales the fibre with the backdrop plane when the camera pushes in', () => {
    const planes = { far: 3, focal: 1 };
    const cam = { x: 1160, y: 540, zoom: 1.5 };
    const r = recorder();
    const at = shoot(r, cam, planes, [1000, 500]).seen.get('far') ?? [0, 0];
    const past = shoot(recorder(), cam, planes, [1100, 500]).seen.get('far') ?? [0, 0];
    // How many frame px one world px of the backdrop spans, pushed in.
    const k = (past[0] - at[0]) / 100;
    expect(k).toBeGreaterThan(1);
    // The tile spans the backdrop's own FIBRE_SIZE world px, to the rounded pixel.
    const fibre = fibresOf(r)[0];
    const period = fibre !== undefined && isPattern(fibre.style) ? fibre.style.tile.width : 0;
    expect(Math.abs(period - FIBRE_SIZE * k)).toBeLessThanOrEqual(0.5);
    // And shows the point's own place in the tile under it, scaled with it,
    // within the rounded period's drift (`fibre.test.ts` bounds it frame-wide).
    const [, , , , ox = 0, oy = 0] = fibre?.m ?? IDENTITY;
    const wrap = (n: number, p: number) => ((n % p) + p) % p;
    const own = (n: number) => (wrap(n, FIBRE_SIZE) / FIBRE_SIZE) * period;
    const off = (laid: number, n: number) => {
      const d = Math.abs(wrap(laid, period) - own(n));
      return Math.min(d, period - d);
    };
    expect(off(at[0] - ox, 1000)).toBeLessThanOrEqual(2);
    expect(off(at[1] - oy, 500)).toBeLessThanOrEqual(2);
  });

  test('lays the fibre through the backdrop plane itself when the camera turns', () => {
    const r = recorder();
    const { seen } = shoot(r, { x: 1160, y: 540, rot: 0.1 }, { far: 3, focal: 1 }, [1000, 500]);
    const m = fibresOf(r)[0]?.m ?? IDENTITY;
    const [x, y] = applyAffine(m, [1000, 500]);
    const [fx, fy] = seen.get('far') ?? [0, 0];
    expect(x).toBeCloseTo(fx);
    expect(y).toBeCloseTo(fy);
  });

  test('lays no fibre when the shot asks for none', () => {
    const r = recorder();
    shoot(r, { x: 960, y: 540 }, { far: 3, focal: 1 }, [0, 0], { fibre: 0 });
    expect(fibresOf(r)).toHaveLength(0);
  });

  test('softens planes off the focal plane only', () => {
    const r = recorder();
    shoot(r, { x: 960, y: 540 }, { focal: 1, far: 3 }, [0, 0], { blur: 2 });
    expect(r.filters.get('focal')).toBe('none');
    expect(r.filters.get('far')).toBe('blur(4.00px)');
  });
});

/** A scene's breath `through` it, in a film that drifts `drift`, drawn whole (`outer`) or through its shots. */
const breathOf = (through: number, drift: Drift | 0 = DRIFT, outer = false): SceneBreath => ({
  through,
  drift,
  outer,
  width: 1920,
  height: 1080,
});

// Always breathing (DIRECTION, pillar 3): the outermost camera of a scene
// drifts over it, pure in the scene's time: from the shot as framed at its
// start, pushed in and slid at its middle, back to the shot as framed at its
// end, so every cut and callback lands where it was drawn.
describe('drift', () => {
  /**
   * The transform inside `camera(cam)` drawn `through` a scene (0..1) of a
   * film that drifts `film`, the shot taking `share` of it when named.
   */
  const inside = (through: number, cam: Camera, share?: number, film: Drift | 0 = DRIFT) => {
    const r = recorder();
    let m: Affine = IDENTITY;
    hearingCameras(r.ctx, undefined, breathOf(through, film), () =>
      camera(
        r.ctx,
        cam,
        1920,
        1080,
        () => {
          m = r.now();
        },
        share,
      ),
    );
    return m;
  };
  const CAM = { x: 1000, y: 500 };

  test('starts and ends on the shot as framed', () => {
    const plain = inside(0, CAM, 0);
    for (const [i, v] of inside(0, CAM).entries()) expect(v).toBeCloseTo(plain[i] ?? 0);
    for (const [i, v] of inside(1, CAM).entries()) expect(v).toBeCloseTo(plain[i] ?? 0);
  });

  test('at the middle of its scene it has pushed in and slid', () => {
    const m = inside(0.5, CAM);
    expect(m[0]).toBeCloseTo(1 + DRIFT.zoom);
    // The frame's centre now looks at a point slid right by DRIFT.x frame px.
    const [x, y] = applyAffine(m, [CAM.x + DRIFT.x / (1 + DRIFT.zoom), CAM.y]);
    expect(x).toBeCloseTo(960);
    expect(y).toBeCloseTo(540);
  });

  test('is pure in the scene time: the same moment frames the same', () => {
    expect(inside(0.3, CAM)).toEqual(inside(0.3, CAM));
  });

  test('drift: 0 holds the shot as framed, the stillness a scene designs', () => {
    const m = inside(0.5, CAM, 0);
    expect(m[0]).toBeCloseTo(1);
    expect(applyAffine(m, [CAM.x, CAM.y])).toEqual([960, 540]);
  });

  test('a shot takes a share of the film breath: half of it pushes half as far', () => {
    expect(inside(0.5, CAM, 0.5)[0]).toBeCloseTo(1 + DRIFT.zoom / 2);
  });

  test("the breath is the film's: one the film sets moves every shot, and none holds them all", () => {
    expect(inside(0.5, CAM, undefined, { zoom: 0.1, x: 0 })[0]).toBeCloseTo(1.1);
    const held = inside(0.5, CAM, undefined, 0);
    expect(held[0]).toBe(1);
    expect(applyAffine(held, [CAM.x, CAM.y])).toEqual([960, 540]);
  });

  test('a camera inside another drifts no further', () => {
    const r = recorder();
    const seen: Affine[] = [];
    hearingCameras(r.ctx, undefined, breathOf(0.5), () =>
      camera(r.ctx, CAM, 1920, 1080, () => {
        seen.push(r.now());
        camera(r.ctx, { x: 960, y: 540 }, 1920, 1080, () => seen.push(r.now()));
      }),
    );
    for (const [i, v] of (seen[1] ?? IDENTITY).entries()) expect(v).toBeCloseTo(seen[0]?.[i] ?? 0);
  });

  test('a multiplane shot drifts one camera, so its planes part as it moves', () => {
    const r = recorder();
    const zooms = new Map<string, number>();
    const at = (name: string, z: number): Plane => ({
      z,
      draw: () => zooms.set(name, r.now()[0]),
    });
    hearingCameras(r.ctx, undefined, breathOf(0.5), () =>
      withDom(() => multiplane(r.ctx, CAM, 1920, 1080, [at('far', 3), at('focal', 1)])),
    );
    expect(zooms.get('focal')).toBeCloseTo(1 + DRIFT.zoom);
    expect(zooms.get('far')).toBeCloseTo((1 + DRIFT.zoom) ** (1 / 3));
  });

  test('a scene with no shot breathes whole, about the frame centre, one breath', () => {
    const r = recorder();
    let m: Affine = IDENTITY;
    const shot = hearingCameras(r.ctx, undefined, breathOf(0.5, DRIFT, true), () => {
      m = r.now();
    });
    expect(shot).toBe(false);
    expect(m[0]).toBeCloseTo(1 + DRIFT.zoom);
    // The frame's centre lands slid left by DRIFT.x, as a camera on it would put it.
    const [x, y] = applyAffine(m, [960, 540]);
    expect(x).toBeCloseTo(960 - DRIFT.x);
    expect(y).toBeCloseTo(540);
  });

  test("a camera's transform carries one drift, not two: in a frame breathed whole it drifts no further", () => {
    const r = recorder();
    const seen: Affine[] = [];
    const shot = hearingCameras(r.ctx, undefined, breathOf(0.5, DRIFT, true), () =>
      camera(r.ctx, { x: 960, y: 540 }, 1920, 1080, () => seen.push(r.now())),
    );
    // The camera tells the frame it framed a shot, so the frame is drawn through it instead.
    expect(shot).toBe(true);
    expect(seen[0]?.[0]).toBeCloseTo(1 + DRIFT.zoom);
    const through = inside(0.5, { x: 960, y: 540 });
    for (const [i, v] of through.entries()) expect(v).toBeCloseTo(seen[0]?.[i] ?? 0);
  });

  test('a frame tells whether its scene framed a shot, held still or not', () => {
    const r = recorder();
    expect(hearingCameras(r.ctx, undefined, breathOf(0.5), () => undefined)).toBe(false);
    expect(
      hearingCameras(r.ctx, undefined, breathOf(0.5), () =>
        camera(r.ctx, CAM, 1920, 1080, () => undefined, 0),
      ),
    ).toBe(true);
  });

  test("a picture in an inset frames no shot of the scene's: the scene breathes whole, the inset's cameras drift no further", () => {
    const r = recorder();
    const seen: Affine[] = [];
    let outer: Affine = IDENTITY;
    const shot = hearingCameras(r.ctx, undefined, breathOf(0.5, DRIFT, true), () => {
      outer = r.now();
      inset(r.ctx, () => camera(r.ctx, { x: 960, y: 540 }, 1920, 1080, () => seen.push(r.now())));
    });
    // Not the scene's shot: the frame stays breathed whole, and is not drawn again through it.
    expect(shot).toBe(false);
    // The inset's own camera, on the frame as it is, adds no second breath.
    for (const [i, v] of (seen[0] ?? []).entries()) expect(v).toBeCloseTo(outer[i] ?? Number.NaN);
    // And a camera after the inset is the scene's shot again.
    expect(
      hearingCameras(r.ctx, undefined, breathOf(0.5), () => {
        inset(r.ctx, () => undefined);
        camera(r.ctx, CAM, 1920, 1080, () => undefined);
      }),
    ).toBe(true);
  });

  test('a drift let go holds still: driftHeld(1) is none, driftHeld(0) the whole breath', () => {
    expect(driftHeld(0)).toBe(1);
    expect(driftHeld(1)).toBe(0);
    expect(driftHeld(0.25)).toBe(0.75);
  });
});

// The lab places a knob read before a camera where the camera draws it: a
// frame hearing its cameras is told the transform inside each outermost one.
describe('the cameras a frame applies', () => {
  const inside = (m: { a: number; b: number; c: number; d: number; e: number; f: number }) =>
    applyAffine([m.a, m.b, m.c, m.d, m.e, m.f], [1000, 500]);

  test('hears the outermost camera, not one nested in it', () => {
    const r = recorder();
    const heard: Array<readonly [number, number]> = [];
    hearingCameras(
      r.ctx,
      (m) => heard.push(inside(m)),
      breathOf(0),
      () =>
        camera(r.ctx, { x: 1000, y: 500, zoom: 2 }, 1920, 1080, () =>
          camera(r.ctx, { x: 0, y: 0 }, 1920, 1080, () => undefined),
        ),
    );
    expect(heard).toEqual([[960, 540]]);
  });

  test('knows when it draws inside a camera', () => {
    const r = recorder();
    const seen: boolean[] = [insideCamera(r.ctx)];
    camera(r.ctx, { x: 0, y: 0 }, 1920, 1080, () => seen.push(insideCamera(r.ctx)));
    seen.push(insideCamera(r.ctx));
    expect(seen).toEqual([false, true, false]);
  });

  test('hears a multiplane shot once, as its focal plane', () => {
    const r = recorder();
    const heard: Array<readonly [number, number]> = [];
    hearingCameras(
      r.ctx,
      (m) => heard.push(inside(m)),
      breathOf(0),
      () => shoot(r, { x: 1000, y: 500, zoom: 2 }, { far: 3, focal: 1, near: 0.5 }, [0, 0]),
    );
    expect(heard).toHaveLength(1);
    expect(heard[0]?.[0]).toBeCloseTo(960);
    expect(heard[0]?.[1]).toBeCloseTo(540);
  });

  test('hears nothing once the draw is done', () => {
    const r = recorder();
    const heard: number[] = [];
    hearingCameras(
      r.ctx,
      () => heard.push(1),
      breathOf(0),
      () => undefined,
    );
    camera(r.ctx, { x: 0, y: 0 }, 1920, 1080, () => undefined);
    expect(heard).toEqual([]);
  });
});
