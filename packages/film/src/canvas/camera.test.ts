// A multiplane shot is judged by where each plane lands and how much haze
// lies over it, so the stand-in context tracks the transform and records
// every veil; bun has no canvas.

import { describe, expect, test } from 'bun:test';
import { Effect, Schema } from 'effect';
import { type Mat2d, mat2d } from 'math';
import { type Affine, IDENTITY, applyAffine } from '../core/affine.ts';
import {
  type Camera,
  PLANE_LIFT_MAX,
  PLANE_LIFT_MIN,
  type Plane,
  camera,
  hearingCameras,
  insideCamera,
  knobCamera,
  lerpCamera,
  multiplane,
  shotPath,
} from './camera.ts';
import { heightOf } from './cutout.ts';
import { FIBRE_SIZE, PLANE_FIBRE } from './fibre.ts';

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

  test('writes into the camera it is given and leaves the stops alone', () => {
    const out: Camera = { x: 0, y: 0 };
    expect(shotPath(REST, [[1, FACE]], out)).toBe(out);
    expect(out).toEqual({ x: 700, y: 600, zoom: 2.5, rot: 0 });
    expect(FACE).toEqual({ x: 700, y: 600, zoom: 2.5 });
  });
});

interface Recorder {
  readonly ctx: CanvasRenderingContext2D;
  /** The transform in force now. */
  readonly now: () => Affine;
  /** The alpha of each full-frame veil, in order. */
  readonly veils: number[];
  /** The filter in force at each plane's draw, by plane name. */
  readonly filters: Map<string, string>;
  /** Each pattern fill (the paper's fibre): its alpha, the transform it was laid under and its rect. */
  readonly fibres: {
    readonly alpha: number;
    readonly m: Affine;
    readonly rect: readonly [number, number, number, number];
  }[];
  /** What was drawn, in order: plane names as they draw, `fibre` for each pattern fill. */
  readonly events: string[];
}

/** What the stand-in's `createPattern` hands back, so a fill with it is told from a veil. */
const PATTERN = { pattern: true };

/** The stand-in context's drawing state, saved and restored whole. */
interface Pen {
  m: Affine;
  alpha: number;
  filter: string;
  comp: string;
  /** A colour, or `PATTERN`. */
  style: string | typeof PATTERN;
}

/** `m` then `n`, as the canvas composes a transform onto the current one. */
const times = (m: Affine, n: Mat2d): Mat2d => mat2d.multiply(mat2d.create(), [...m], n);

const recorder = (): Recorder => {
  let state: Pen = {
    m: IDENTITY,
    alpha: 1,
    filter: 'none',
    comp: 'source-over',
    style: '',
  };
  const stack: (typeof state)[] = [];
  const veils: number[] = [];
  const filters = new Map<string, string>();
  const fibres: Recorder['fibres'] = [];
  const events: string[] = [];
  const fake = {
    canvas: { width: 1920, height: 1080 },
    save: () => stack.push({ ...state }),
    restore: () => {
      state = stack.pop() ?? state;
    },
    translate: (x: number, y: number) => {
      state.m = times(state.m, [1, 0, 0, 1, x, y]);
    },
    scale: (x: number, y: number) => {
      state.m = times(state.m, [x, 0, 0, y, 0, 0]);
    },
    rotate: (a: number) => {
      state.m = times(state.m, [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]);
    },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      state.m = [a, b, c, d, e, f];
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      if (state.style !== PATTERN) return veils.push(state.alpha);
      events.push('fibre');
      return fibres.push({ alpha: state.alpha, m: state.m, rect: [x, y, w, h] });
    },
    createPattern: () => PATTERN,
    get fillStyle() {
      return state.style;
    },
    set fillStyle(v: Pen['style']) {
      state.style = v;
    },
    imageSmoothingEnabled: true,
    get globalCompositeOperation() {
      return state.comp;
    },
    set globalCompositeOperation(v: string) {
      state.comp = v;
    },
    get globalAlpha() {
      return state.alpha;
    },
    set globalAlpha(v: number) {
      state.alpha = v;
    },
    get filter() {
      return state.filter;
    },
    set filter(v: string) {
      state.filter = v;
    },
    getTransform: () => {
      const [a, b, c, d, e, f] = state.m;
      return { a, b, c, d, e, f };
    },
  };
  return {
    ctx: Schema.decodeSync(Schema.Any)(fake),
    now: () => state.m,
    veils,
    filters,
    fibres,
    events,
  };
};

/** Anything a context could answer: callable (answering itself), every property itself. */
function none(): void {}
const nothing: typeof none = new Proxy(none, {
  get: () => nothing,
  apply: () => nothing,
  construct: () => nothing,
  set: () => true,
});

/**
 * Run `draw` with a DOM whose canvases draw nothing, for the fibre tile a
 * backdrop plane is laid with (bun has no canvas); the DOM is put back after.
 */
const withDom = <A>(draw: () => A): A =>
  Effect.runSync(
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const before = Reflect.get(globalThis, 'document');
        Reflect.set(globalThis, 'document', {
          createElement: () => ({ width: 0, height: 0, getContext: () => nothing }),
        });
        return before;
      }),
      () => Effect.sync(draw),
      (before) => Effect.sync(() => Reflect.set(globalThis, 'document', before)),
    ),
  );

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

describe('multiplane', () => {
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
    const through = r.veils.reduce((t, v) => t * (1 - v), 1);
    expect(through).toBeCloseTo(Math.exp(-1));
    expect(r.veils).toHaveLength(2);
  });

  test('hazes the nearest plane too when it stands beyond the focal plane', () => {
    const r = recorder();
    shoot(r, { x: 960, y: 540 }, { a: 3, b: 2 }, [0, 0], { haze: '#fff', thickness: 0.5 });
    // Nothing stands at z 1, yet the air from z 3 to 1 still lies over a,
    // and the air from z 2 to 1 over b: one unit past the focal plane shows 1 - e^-0.5.
    const through = r.veils.reduce((t, v) => t * (1 - v), 1);
    expect(through).toBeCloseTo(Math.exp(-1));
    expect(r.veils.at(-1)).toBeCloseTo(1 - Math.exp(-0.5));
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
    expect(r.fibres).toHaveLength(1);
    const fibre = r.fibres[0];
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

  test('lays the fibre through the backdrop plane itself when the camera turns', () => {
    const r = recorder();
    const { seen } = shoot(r, { x: 1160, y: 540, rot: 0.1 }, { far: 3, focal: 1 }, [1000, 500]);
    const m = r.fibres[0]?.m ?? IDENTITY;
    const [x, y] = applyAffine(m, [1000, 500]);
    const [fx, fy] = seen.get('far') ?? [0, 0];
    expect(x).toBeCloseTo(fx);
    expect(y).toBeCloseTo(fy);
  });

  test('lays no fibre when the shot asks for none', () => {
    const r = recorder();
    shoot(r, { x: 960, y: 540 }, { far: 3, focal: 1 }, [0, 0], { fibre: 0 });
    expect(r.fibres).toHaveLength(0);
  });

  test('softens planes off the focal plane only', () => {
    const r = recorder();
    shoot(r, { x: 960, y: 540 }, { focal: 1, far: 3 }, [0, 0], { blur: 2 });
    expect(r.filters.get('focal')).toBe('none');
    expect(r.filters.get('far')).toBe('blur(4.00px)');
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
      () => undefined,
    );
    camera(r.ctx, { x: 0, y: 0 }, 1920, 1080, () => undefined);
    expect(heard).toEqual([]);
  });
});
