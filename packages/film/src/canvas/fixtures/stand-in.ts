// A stand-in 2D context, because bun has no canvas. It keeps the drawing
// state a frame's geometry depends on (transform, alpha, composite, filter,
// fill style), saved and restored whole, and records what is filled and
// drawn under it; every other call answers `nothing`. `withDom` puts up a
// document whose canvases draw into stand-ins of their own, for the paper,
// the light sheets and the fibre tile a film makes off the page.

import { Effect, Predicate, Schema } from 'effect';
import { type Mat2d, mat2d } from 'math';
import { type Affine, IDENTITY } from '../../core/affine.ts';

/** What a stand-in's `createPattern` hands back: the tile it repeats. */
export interface StandInPattern {
  readonly _tag: 'Pattern';
  readonly tile: StandInCanvas;
}

/** What a stand-in's `createRadialGradient` hands back: its circles and its stops, as added. */
export interface StandInGradient {
  readonly _tag: 'Radial';
  /** `x0, y0, r0, x1, y1, r1`. */
  readonly circles: readonly [number, number, number, number, number, number];
  readonly stops: Array<readonly [offset: number, color: string]>;
}

/** A canvas off the page, drawn into its own stand-in. */
export interface StandInCanvas {
  width: number;
  height: number;
  readonly getContext: () => CanvasRenderingContext2D;
  readonly drawn: Recorder;
}

export type Style = string | StandInPattern | StandInGradient;

/** One `fillRect`: the style, alpha, composite and transform it was filled under. */
export interface Fill {
  readonly _tag: 'Fill';
  readonly style: Style;
  readonly alpha: number;
  readonly comp: string;
  readonly m: Affine;
  readonly rect: readonly [number, number, number, number];
}

/** One `drawImage`: the image (a canvas off the page) and the state it was drawn under. */
export interface Drawn {
  readonly _tag: 'Image';
  readonly image: StandInCanvas;
  readonly alpha: number;
  readonly comp: string;
  readonly m: Affine;
}

export interface Recorder {
  readonly ctx: CanvasRenderingContext2D;
  /** The transform in force now. */
  readonly now: () => Affine;
  /** Every fill, in order. */
  readonly fills: Fill[];
  /** Every image drawn, in order. */
  readonly images: Drawn[];
  /** Every fill and image, in the order drawn. */
  readonly ops: Array<Fill | Drawn>;
  /** Named things a test's own draws push, in order, beside `fibre` for each pattern fill. */
  readonly events: string[];
  /** The filter in force where a test's draw read it, by the test's own name. */
  readonly filters: Map<string, string>;
}

export const isPattern = (style: Style): style is StandInPattern =>
  Predicate.isTagged(style, 'Pattern');

/** The stand-in's drawing state, saved and restored whole. */
interface Pen {
  m: Affine;
  alpha: number;
  filter: string;
  comp: string;
  style: Style;
}

/** `m` then `n`, as the canvas composes a transform onto the current one. */
const times = (m: Affine, n: Mat2d): Mat2d => mat2d.multiply(mat2d.create(), [...m], n);

/** Anything a context could answer: callable (answering itself), every property itself. */
function none(): void {}
export const nothing: typeof none = new Proxy(none, {
  get: (_target, key) => {
    if (key === Symbol.toPrimitive) return () => 0;
    if (key === Symbol.iterator) return function* () {};
    return nothing;
  },
  apply: () => nothing,
  construct: () => nothing,
  set: () => true,
});

export const recorder = (width = 1920, height = 1080): Recorder => {
  let state: Pen = { m: IDENTITY, alpha: 1, filter: 'none', comp: 'source-over', style: '' };
  const stack: Pen[] = [];
  const fills: Fill[] = [];
  const images: Drawn[] = [];
  const ops: Array<Fill | Drawn> = [];
  const events: string[] = [];
  const fake = {
    canvas: { width, height },
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
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      state.m = times(state.m, [a, b, c, d, e, f]);
    },
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      state.m = [a, b, c, d, e, f];
    },
    resetTransform: () => {
      state.m = IDENTITY;
    },
    getTransform: () => {
      const [a, b, c, d, e, f] = state.m;
      return { a, b, c, d, e, f };
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      if (isPattern(state.style)) events.push('fibre');
      const fill: Fill = {
        _tag: 'Fill',
        style: state.style,
        alpha: state.alpha,
        comp: state.comp,
        m: state.m,
        rect: [x, y, w, h],
      };
      fills.push(fill);
      ops.push(fill);
    },
    drawImage: (image: StandInCanvas) => {
      const drawn: Drawn = {
        _tag: 'Image',
        image,
        alpha: state.alpha,
        comp: state.comp,
        m: state.m,
      };
      images.push(drawn);
      ops.push(drawn);
    },
    createPattern: (tile: StandInCanvas): StandInPattern => ({ _tag: 'Pattern', tile }),
    createRadialGradient: (
      x0: number,
      y0: number,
      r0: number,
      x1: number,
      y1: number,
      r1: number,
    ) => {
      const g: StandInGradient = { _tag: 'Radial', circles: [x0, y0, r0, x1, y1, r1], stops: [] };
      return {
        ...g,
        addColorStop: (offset: number, color: string) => g.stops.push([offset, color]),
      };
    },
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
    }),
    getImageData: (_x: number, _y: number, w = 1, h = 1) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
    }),
    measureText: (text: string) => ({
      width: text.length * 10,
      actualBoundingBoxAscent: 8,
      actualBoundingBoxDescent: 2,
    }),
    get fillStyle() {
      return state.style;
    },
    set fillStyle(v: Style) {
      state.style = v;
    },
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
  };
  /** Any other property holds what is set on it; any other call answers `nothing`. */
  const other = new Map<PropertyKey, unknown>();
  const ctx = new Proxy(fake, {
    get: (target, key) => {
      if (Reflect.has(target, key)) return Reflect.get(target, key);
      return other.has(key) ? other.get(key) : nothing;
    },
    set: (target, key, value) => {
      if (Reflect.has(target, key)) return Reflect.set(target, key, value);
      other.set(key, value);
      return true;
    },
  });
  return {
    ctx: Schema.decodeSync(Schema.Any)(ctx),
    now: () => state.m,
    fills,
    images,
    ops,
    events,
    filters: new Map(),
  };
};

/** A canvas off the page whose context is a stand-in, sized as it is made. */
export const standInCanvas = (): StandInCanvas => {
  let drawn: Recorder | undefined;
  const canvas: StandInCanvas = {
    width: 0,
    height: 0,
    getContext: () => canvas.drawn.ctx,
    get drawn() {
      drawn ??= recorder(canvas.width, canvas.height);
      return drawn;
    },
  };
  return canvas;
};

/**
 * Run `draw` with a document whose canvases are stand-ins (and a `DOMMatrix`
 * that answers `nothing`), for everything a film makes off the page; the DOM
 * is put back after, even when `draw` throws.
 */
export const withDom = <A>(draw: () => A): A =>
  Effect.runSync(
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const before = {
          document: Reflect.get(globalThis, 'document'),
          matrix: Reflect.get(globalThis, 'DOMMatrix'),
        };
        Reflect.set(globalThis, 'document', { createElement: standInCanvas });
        Reflect.set(globalThis, 'DOMMatrix', function DOMMatrix() {
          return nothing;
        });
        return before;
      }),
      () => Effect.sync(draw),
      (before) =>
        Effect.sync(() => {
          Reflect.set(globalThis, 'document', before.document);
          Reflect.set(globalThis, 'DOMMatrix', before.matrix);
        }),
    ),
  );
