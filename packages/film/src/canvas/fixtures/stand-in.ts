// The one stand-in 2D context, because bun has no canvas (`@bible/film/stand-in`,
// for the framework's tests and a film's). It holds the drawing state a canvas
// holds, starting from a canvas's defaults and saved and restored whole: the
// transform (`setTransform` takes six numbers, a matrix or nothing), an alpha
// it keeps only within 0..1, and every property a draw sets (shadow, font,
// line width among them). It records what is filled and drawn under that
// state, and a pixel read answers the colour of the last hex fill over it, so
// a draw that reads its canvas back (a face's opacity) takes the branch it
// takes on a canvas. Every other call answers `nothing`. It refuses what a real canvas
// refuses (a negative arc, ellipse or gradient radius, a colour stop off
// 0..1, a stop colour made of NaN or undefined, a non-finite gradient
// coordinate), raising the defect the real one's IndexSizeError, SyntaxError
// or TypeError would be. `withDom`
// and `standInDom` put up a document whose canvases draw into stand-ins of
// their own, for the paper, the light sheets and the fibre tile a film makes
// off the page.

import { Effect, Predicate, Schema, type Scope } from 'effect';
import { type Affine, IDENTITY } from '../../core/affine.ts';

/** What a stand-in's `createPattern` hands back: the tile it repeats. */
interface StandInPattern {
  readonly _tag: 'Pattern';
  readonly tile: StandInCanvas;
  /** Where the tile starts: taken and dropped. */
  readonly setTransform: (m?: DOMMatrix2DInit) => void;
}

/** What a stand-in's `createRadialGradient` hands back: its circles and its stops, as added. */
export interface StandInGradient {
  readonly _tag: 'Radial';
  /** `x0, y0, r0, x1, y1, r1`. */
  readonly circles: readonly [number, number, number, number, number, number];
  readonly stops: Array<readonly [offset: number, color: string]>;
}

/** What a stand-in's `createLinearGradient` hands back: its line and its stops, as added. */
interface StandInLinear {
  readonly _tag: 'Linear';
  /** `x0, y0, x1, y1`. */
  readonly line: readonly [number, number, number, number];
  readonly stops: Array<readonly [offset: number, color: string]>;
}

/** A canvas off the page, drawn into its own stand-in. */
interface StandInCanvas {
  width: number;
  height: number;
  readonly getContext: () => CanvasRenderingContext2D;
  readonly drawn: Recorder;
  /** Its number, in the order stand-in canvases are made: a log of calls tells canvases apart by it. */
  readonly made: number;
}

export type Style = string | StandInPattern | StandInGradient | StandInLinear;

/** One `fillRect`: the style, alpha, composite and transform it was filled under. */
interface Fill {
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

/** How a stand-in keeps what is drawn into it, and measures. */
interface StandInOptions {
  /**
   * How wide `text` sets in `font` (the context's font when measured): a
   * test of layout gives its own advances, kerning included. Without it,
   * every character is 10 wide in any font.
   */
  readonly measure?: (font: string, text: string) => number;
  /**
   * Whether it records its fills and images (the default). A test that only
   * asks whether a draw runs (every scene of a film, frame after frame) keeps
   * nothing, so its canvases do not grow.
   */
  readonly record?: boolean;
  /**
   * Told of every call on the context (a factory and a query too) and every
   * property set (as a call with the one value), before it runs: a test's log
   * of what a frame asks the canvas to do.
   */
  readonly onCall?: (key: PropertyKey, args: ReadonlyArray<unknown>) => void;
}

export const isPattern = (style: Style): style is StandInPattern =>
  Predicate.isTagged(style, 'Pattern');

export const isRadial = (style: Style): style is StandInGradient =>
  Predicate.isTagged(style, 'Radial');

/** The stand-in's drawing state, saved and restored whole. */
interface Pen {
  m: Affine;
  alpha: number;
  filter: string;
  comp: string;
  style: Style;
  /** Every other property, as set or as a canvas starts it; shared with the saved pen until first set. */
  props: Map<PropertyKey, unknown>;
  /** Whether `props` is this pen's own to write, or still the saved pen's. */
  owns: boolean;
}

/** What a canvas answers for a property no draw has set. */
const DEFAULTS: ReadonlyArray<readonly [PropertyKey, unknown]> = [
  ['shadowBlur', 0],
  ['shadowOffsetX', 0],
  ['shadowOffsetY', 0],
  ['shadowColor', 'rgba(0, 0, 0, 0)'],
  ['font', '10px sans-serif'],
  ['lineWidth', 1],
  ['lineCap', 'butt'],
  ['lineJoin', 'miter'],
  ['miterLimit', 10],
  ['lineDashOffset', 0],
  ['strokeStyle', '#000000'],
  ['textAlign', 'start'],
  ['textBaseline', 'alphabetic'],
  ['imageSmoothingEnabled', true],
  ['imageSmoothingQuality', 'low'],
];

/** The last fill, in device px, and the colour it laid (`undefined` where the stand-in cannot read its style). */
interface Painted {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly rgba: readonly [number, number, number, number] | undefined;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** A `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` style laid at `alpha`, as its four bytes; `undefined` for any other style. */
const rgbaOf = (style: Style, alpha: number): Painted['rgba'] => {
  if (!Predicate.isString(style) || !HEX.test(style)) return undefined;
  const short = style.length <= 5;
  const byte = (i: number) =>
    Number.parseInt(short ? style.charAt(1 + i).repeat(2) : style.slice(1 + i * 2, 3 + i * 2), 16);
  const has = style.length === 5 || style.length === 9;
  return [byte(0), byte(1), byte(2), Math.round((has ? byte(3) : 255) * alpha)];
};

/** The device-px box a rect covers under `m`. */
const boxOf = (m: Affine, x: number, y: number, w: number, h: number): Omit<Painted, 'rgba'> => {
  const [a, b, c, d, e, f] = m;
  const xs = [a * x + c * y, a * (x + w) + c * y, a * x + c * (y + h), a * (x + w) + c * (y + h)];
  const ys = [b * x + d * y, b * (x + w) + d * y, b * x + d * (y + h), b * (x + w) + d * (y + h)];
  return {
    x0: Math.min(...xs) + e,
    y0: Math.min(...ys) + f,
    x1: Math.max(...xs) + e,
    y1: Math.max(...ys) + f,
  };
};

/** `m` then `n`, as the canvas composes a transform onto the current one. */
const times = (
  m: Affine,
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
): Affine => [
  m[0] * a + m[2] * b,
  m[1] * a + m[3] * b,
  m[0] * c + m[2] * d,
  m[1] * c + m[3] * d,
  m[0] * e + m[2] * f + m[4],
  m[1] * e + m[3] * f + m[5],
];

/** Anything a context could answer: callable (answering itself), every property itself, 0 in arithmetic, an empty list spread. */
function none(): void {}
const nothing: typeof none = new Proxy(none, {
  get: (_target, key) => {
    if (key === Symbol.toPrimitive) return () => 0;
    if (key === Symbol.iterator) return function* () {};
    if (key === 'length') return 0;
    return nothing;
  },
  apply: () => nothing,
  construct: () => nothing,
  set: () => true,
});

/** A call that does nothing and answers nothing, as a path call on a real canvas answers. */
const quiet = (): void => {};

/**
 * What a real canvas does with an argument it refuses: throws an
 * IndexSizeError out of the draw. Here the same defect, raised synchronously.
 */
const refuseWhen = (bad: boolean, what: string, error = 'IndexSizeError') => {
  if (bad) Effect.runSync(Effect.die(new RangeError(`${error}: ${what}`)));
};

/** Gradient coordinates, refused when one is not finite, as a canvas's restricted doubles are. */
const refuseUnfinite = (what: string, ...at: ReadonlyArray<number>) =>
  refuseWhen(!at.every(Number.isFinite), `${what} ${at.join(', ')}`, 'TypeError');

/** A colour no canvas parses: what a NaN or a missing channel writes into one. */
const UNPARSED = /NaN|undefined/;

/**
 * A colour stop, refused off 0..1 and for a colour made of NaN or undefined,
 * as a real gradient refuses them (IndexSizeError, SyntaxError).
 */
const stopOf = (stops: Array<readonly [number, string]>) => (offset: number, color: string) => {
  refuseWhen(!(offset >= 0 && offset <= 1), `addColorStop offset ${offset}`);
  refuseWhen(UNPARSED.test(color), `addColorStop colour "${color}"`, 'SyntaxError');
  stops.push([offset, color]);
};

export const recorder = (width = 1920, height = 1080, options: StandInOptions = {}): Recorder => {
  const keeps = options.record !== false;
  const measure = options.measure ?? ((_font: string, text: string) => text.length * 10);
  /** The font set on the context, else a canvas's own default. */
  const fontOf = () => {
    const font = state.props.get('font');
    return Predicate.isString(font) ? font : '10px sans-serif';
  };
  let state: Pen = {
    m: IDENTITY,
    alpha: 1,
    filter: 'none',
    comp: 'source-over',
    style: '',
    props: new Map(DEFAULTS),
    owns: true,
  };
  const stack: Pen[] = [];
  /** The last fill, which a pixel read answers from (not a composite of every fill under it). */
  let painted: Painted | undefined;
  const fills: Fill[] = [];
  const images: Drawn[] = [];
  const ops: Array<Fill | Drawn> = [];
  const events: string[] = [];
  const fake = {
    canvas: { width, height },
    save: () => {
      stack.push(state);
      state = { ...state, owns: false };
    },
    restore: () => {
      state = stack.pop() ?? state;
    },
    translate: (x: number, y: number) => {
      state.m = times(state.m, 1, 0, 0, 1, x, y);
    },
    scale: (x: number, y: number) => {
      state.m = times(state.m, x, 0, 0, y, 0, 0);
    },
    rotate: (a: number) => {
      state.m = times(state.m, Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0);
    },
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => {
      state.m = times(state.m, a, b, c, d, e, f);
    },
    setTransform: (a?: number | DOMMatrix2DInit, b = 0, c = 0, d = 1, e = 0, f = 0) => {
      state.m = Predicate.isNumber(a)
        ? [a, b, c, d, e, f]
        : [a?.a ?? 1, a?.b ?? 0, a?.c ?? 0, a?.d ?? 1, a?.e ?? 0, a?.f ?? 0];
    },
    resetTransform: () => {
      state.m = IDENTITY;
    },
    getTransform: () => {
      const [a, b, c, d, e, f] = state.m;
      return { a, b, c, d, e, f };
    },
    fillRect: (x: number, y: number, w: number, h: number) => {
      painted = { ...boxOf(state.m, x, y, w, h), rgba: rgbaOf(state.style, state.alpha) };
      if (!keeps) return;
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
      if (!keeps) return;
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
    // The calls a frame makes most, which answer nothing on a real canvas
    // too: plain functions, so each is one call rather than a trip through
    // `nothing`.
    beginPath: quiet,
    closePath: quiet,
    moveTo: quiet,
    lineTo: quiet,
    bezierCurveTo: quiet,
    quadraticCurveTo: quiet,
    rect: quiet,
    roundRect: quiet,
    fill: quiet,
    stroke: quiet,
    clip: quiet,
    fillText: quiet,
    strokeText: quiet,
    strokeRect: quiet,
    clearRect: quiet,
    setLineDash: quiet,
    arc: (_x = 0, _y = 0, r = 0) => refuseWhen(r < 0, `arc radius ${r}`),
    ellipse: (_x = 0, _y = 0, rx = 0, ry = 0) =>
      refuseWhen(rx < 0 || ry < 0, `ellipse radii ${rx}, ${ry}`),
    arcTo: (_x1 = 0, _y1 = 0, _x2 = 0, _y2 = 0, r = 0) => refuseWhen(r < 0, `arcTo radius ${r}`),
    createPattern: (tile: StandInCanvas): StandInPattern => ({
      _tag: 'Pattern',
      tile,
      setTransform: () => {},
    }),
    createRadialGradient: (
      x0: number,
      y0: number,
      r0: number,
      x1: number,
      y1: number,
      r1: number,
    ) => {
      refuseUnfinite('radial gradient', x0, y0, r0, x1, y1, r1);
      refuseWhen(r0 < 0 || r1 < 0, `radial gradient radii ${r0}, ${r1}`);
      const g: StandInGradient = { _tag: 'Radial', circles: [x0, y0, r0, x1, y1, r1], stops: [] };
      return { ...g, addColorStop: stopOf(g.stops) };
    },
    createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
      refuseUnfinite('linear gradient', x0, y0, x1, y1);
      const g: StandInLinear = { _tag: 'Linear', line: [x0, y0, x1, y1], stops: [] };
      return { ...g, addColorStop: stopOf(g.stops) };
    },
    createConicGradient: () => ({ addColorStop: stopOf([]) }),
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
    }),
    getImageData: (x: number, y: number, w = 1, h = 1) => {
      const data = new Uint8ClampedArray(Math.max(1, w * h) * 4);
      for (let row = 0; row < h; row++)
        for (let col = 0; col < w; col++) {
          const px = x + col + 0.5;
          const py = y + row + 0.5;
          const over =
            painted !== undefined &&
            px >= painted.x0 &&
            px < painted.x1 &&
            py >= painted.y0 &&
            py < painted.y1;
          if (over && painted?.rgba !== undefined) data.set(painted.rgba, (row * w + col) * 4);
        }
      return { width: w, height: h, data };
    },
    measureText: (text: string) => ({
      width: measure(fontOf(), text),
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
      if (v >= 0 && v <= 1) state.alpha = v;
    },
    get filter() {
      return state.filter;
    },
    set filter(v: string) {
      state.filter = v;
    },
  };
  /** Any other property holds what is set on it (in the pen); any other call answers `nothing`. */
  const valueOf = (key: PropertyKey): unknown => {
    if (Reflect.has(fake, key)) return Reflect.get(fake, key);
    return state.props.has(key) ? state.props.get(key) : nothing;
  };
  /** The pen's properties to write into: its own copy of the saved pen's, taken the first time. */
  const ownProps = () => {
    if (!state.owns) {
      state.props = new Map(state.props);
      state.owns = true;
    }
    return state.props;
  };
  const onCall = options.onCall;
  // With `onCall`, each call name's function is wrapped once, the first time
  // it is asked for: a frame asks for `save` or `lineTo` thousands of times.
  const told = new Map<PropertyKey, (...args: ReadonlyArray<unknown>) => unknown>();
  const tellingOf = (key: PropertyKey, tell: NonNullable<StandInOptions['onCall']>) => {
    let wrapper = told.get(key);
    if (wrapper === undefined) {
      wrapper = (...args) => {
        tell(key, args);
        const fn = valueOf(key);
        if (Predicate.isFunction(fn)) return Reflect.apply(fn, fake, args);
        return nothing;
      };
      told.set(key, wrapper);
    }
    return wrapper;
  };
  const ctx = new Proxy(fake, {
    get: (_target, key) => {
      const value = valueOf(key);
      if (onCall === undefined || !Predicate.isFunction(value)) return value;
      return tellingOf(key, onCall);
    },
    set: (target, key, value) => {
      onCall?.(key, [value]);
      if (Reflect.has(target, key)) return Reflect.set(target, key, value);
      ownProps().set(key, value);
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

/** How many stand-in canvases have been made: the last one's `made`. */
let canvasesMade = 0;

/** Whether `v` is a stand-in canvas (a pattern's tile, an image drawn). */
export const isStandInCanvas = (v: unknown): v is StandInCanvas =>
  Predicate.hasProperty(v, 'made') && Predicate.hasProperty(v, 'getContext');

/** A canvas off the page whose context is a stand-in, sized as it is made. */
const standInCanvas = (options: StandInOptions = {}): StandInCanvas => {
  let drawn: Recorder | undefined;
  canvasesMade += 1;
  const canvas: StandInCanvas = {
    width: 0,
    height: 0,
    made: canvasesMade,
    getContext: () => canvas.drawn.ctx,
    get drawn() {
      drawn ??= recorder(canvas.width, canvas.height, options);
      return drawn;
    },
  };
  return canvas;
};

/** The global the stand-in DOM replaces, as it was. */
interface Globals {
  readonly document: unknown;
}

const putUp = (options: StandInOptions) =>
  Effect.sync((): Globals => {
    const before = { document: Reflect.get(globalThis, 'document') };
    // Its fonts hold none a film asked for: what draws waits for nothing (`pictureFacesWait`).
    Reflect.set(globalThis, 'document', {
      createElement: () => standInCanvas(options),
      fonts: [],
    });
    return before;
  });

const takeDown = (before: Globals) =>
  Effect.sync(() => {
    Reflect.set(globalThis, 'document', before.document);
  });

/**
 * A document whose canvases are stand-ins, for everything a film makes off
 * the page, put back when the scope closes.
 */
export const standInDom = (options: StandInOptions = {}): Effect.Effect<void, never, Scope.Scope> =>
  Effect.asVoid(Effect.acquireRelease(putUp(options), takeDown));

/** Run `draw` under `standInDom`; the DOM is put back after, even when `draw` throws. */
export const withDom = <A>(draw: () => A, options: StandInOptions = {}): A =>
  Effect.runSync(Effect.acquireUseRelease(putUp(options), () => Effect.sync(draw), takeDown));
