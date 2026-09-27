// A multiplane shot is judged by where each plane lands and how much haze
// lies over it, so the stand-in context tracks the transform and records
// every veil; bun has no canvas.

import { describe, expect, test } from 'bun:test';
import { Schema } from 'effect';
import { type Mat2d, mat2d } from 'math';
import { type Affine, IDENTITY, applyAffine } from '../core/affine.ts';
import { type Plane, multiplane } from './camera.ts';

interface Recorder {
  readonly ctx: CanvasRenderingContext2D;
  /** The transform in force now. */
  readonly now: () => Affine;
  /** The alpha of each full-frame veil, in order. */
  readonly veils: number[];
  /** The filter in force at each plane's draw, by plane name. */
  readonly filters: Map<string, string>;
}

/** `m` then `n`, as the canvas composes a transform onto the current one. */
const times = (m: Affine, n: Mat2d): Mat2d => mat2d.multiply(mat2d.create(), [...m], n);

const recorder = (): Recorder => {
  let state = { m: IDENTITY, alpha: 1, filter: 'none' };
  const stack: (typeof state)[] = [];
  const veils: number[] = [];
  const filters = new Map<string, string>();
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
    fillRect: () => veils.push(state.alpha),
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
    fillStyle: '',
  };
  return {
    ctx: Schema.decodeSync(Schema.Any)(fake),
    now: () => state.m,
    veils,
    filters,
  };
};

/** Where each plane maps the world point `p`, by plane name. */
const shoot = (
  r: Recorder,
  cam: { x: number; y: number; zoom?: number },
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
      seen.set(name, applyAffine(r.now(), p));
      r.filters.set(name, r.ctx.filter);
    },
  }));
  multiplane(r.ctx, cam, 1920, 1080, planes, depth);
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

  test('softens planes off the focal plane only', () => {
    const r = recorder();
    shoot(r, { x: 960, y: 540 }, { focal: 1, far: 3 }, [0, 0], { blur: 2 });
    expect(r.filters.get('focal')).toBe('none');
    expect(r.filters.get('far')).toBe('blur(4.00px)');
  });
});
