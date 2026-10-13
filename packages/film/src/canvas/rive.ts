// A Rive rig drawn in our frame: a figure built in Rive (bones, skinned
// paths, constraints, a view model) that a drawing declares (`drawing({ rigs
// })`) and poses by name each frame (`f.rive(name, pose)`), drawn under the
// frame's own transform, as `glCanvas` lets a look draw in 3D. This is the
// draw path: plain synchronous code, no Effect and no Promise. The film loads
// its rigs before its first frame (`src/rive`, `loadRigs`): each rig's file,
// parsed once, belongs to that load's scope.
//
// Rive never owns the clock, and a frame is a function of its pose alone,
// whatever was drawn before it, by construction: every frame poses an
// artboard instance of its own, made from the loaded file and deleted when
// the frame is drawn, bound to a view-model instance of its own (the model's
// defaults, then the pose's numbers), with the pose's timelines applied in
// order and the artboard advanced by no time. Nothing a frame does to an
// instance outlives it: no path a shape keeps from an earlier frame's
// rounding (`PathComposer` remakes a shape's paths only when their geometry
// or their transform moves past a tolerance), no constraint solved from the
// last frame's bones, no value a bind wrote back. The file's timelines are
// the file's own (every instance shares them), so a frame makes only the
// instances it poses: the artboard, the view model's instance, one instance
// of each timeline it names.
//
// Two engines draw it:
//
// - `canvas` (`@rive-app/canvas-advanced`): Rive's Canvas 2D renderer, on our
//   own context, so our camera, alpha and plane haze reach it as they reach
//   any piece; its draws are queued and flushed (`resolveAnimationFrame`)
//   while our transform is still on the context.
// - `webgl2` (`@rive-app/webgl2-advanced`): the Rive Renderer (feathers drawn
//   analytically) on a WebGL 2 canvas off the page, its box on screen
//   composited with `drawImage`. Its canvas is a 512 px tile where the rig's
//   box fits, else the frame's size: a size the frame chooses, never one grown
//   from the frames before, and each is first drawn once with the rig at rest
//   before any real frame (the Rive Renderer sizes its buffers from the first
//   frame it draws). Where WebGL has no pixel local storage (SwiftShader, so
//   every render on Linux) it falls back to 4× MSAA and draws a feather only
//   on a `clockwise` fill.
//
// Where nothing is drawn (Bun, which has no canvas: `check --draw`) the rig is
// still posed and its face still declared. Probes cannot see inside an
// artboard: `face` names a node whose place is declared (`probeFace`).

import type {
  Artboard,
  File,
  LinearAnimation,
  Mat2D,
  RiveCanvas,
  ViewModel,
  ViewModelInstance,
  WrappedRenderer,
} from '@rive-app/webgl2-advanced';
import { dropGl, holdGl } from './gl.ts';
import { probeFace, probesFaces } from './probe.ts';

/** Which of Rive's renderers draws a rig. */
export type RiveEngine = 'canvas' | 'webgl2';

/**
 * A rig's built file (its URL in a page, its path in Bun: the module's own
 * `import riv from './x.riv' with { type: 'file' }`), the artboard drawn, the
 * timelines a pose may name and the view model's numbers it may set.
 */
interface RiveSource<Tl extends string = string, N extends string = string> {
  readonly riv: string;
  readonly artboard: string;
  readonly timelines: ReadonlyArray<Tl>;
  /** The numbers a pose may set, checked against the file at load; any of its numbers when it names none. */
  readonly numbers?: ReadonlyArray<N>;
}

/**
 * A rig as a drawing declares it (`drawing({ rigs: { accused: … } })`): its
 * source, the engine that draws it, its name in errors (`key`), which
 * artboard point stands at our (0, 0), and the node whose place is its face.
 */
export interface RivePropSpec<Tl extends string = string, N extends string = string> {
  readonly source: RiveSource<Tl, N>;
  readonly engine: RiveEngine;
  readonly key: string;
  readonly origin: readonly [number, number];
  /** A node whose place is the face, and the face's height in artboard units, for `check`'s face probe. */
  readonly face?: { readonly node: string; readonly height: number };
}

/**
 * One frame's pose: each timeline at its time in seconds, applied in this
 * order with its mix (1 by default; 0 leaves it out), then the view model's
 * numbers by name (one left out at the model's default).
 */
interface RivePose<Tl extends string = string, N extends string = string> {
  readonly timelines: ReadonlyArray<readonly [name: Tl, seconds: number, mix?: number]>;
  readonly numbers?: Readonly<Partial<Record<N, number>>>;
}

/** The pose a declared rig takes: its own timelines and numbers. */
export type PoseOf<S> = S extends RivePropSpec<infer Tl, infer N> ? RivePose<Tl, N> : never;

/** A WebGL 2 canvas off the page, its context, and the Rive Renderer on it. */
interface GlTarget {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly renderer: WrappedRenderer;
}

/**
 * What a rig draws on: a renderer on each frame canvas (`canvas`) and a target
 * at each size (`webgl2`, none where no WebGL 2 context can be made), made on
 * first use and freed with the rig (`free`).
 */
interface RigSurfaces {
  readonly renderer: (canvas: HTMLCanvasElement) => WrappedRenderer;
  readonly target: (w: number, h: number) => GlTarget | undefined;
  readonly free: () => void;
}

/**
 * A rig loaded for drawing (`loadRigs`, src/rive): its parsed file, which
 * every frame's own instance is made from, and what its load's scope owns.
 */
export interface LoadedRig {
  readonly runtime: RiveCanvas;
  /** False where the rig is posed and probed but never drawn (Bun, which has no canvas). */
  readonly paints: boolean;
  readonly file: File;
  /** The declared timelines, by name: the file's own, shared by every instance of the artboard. */
  readonly timelines: ReadonlyMap<string, LinearAnimation>;
  /** The view model each frame's own instance is made from; none where the artboard has none. */
  readonly model: ViewModel | undefined;
  /** The numbers a pose may set. */
  readonly numbers: ReadonlySet<string>;
  /** Scratch for a frame's transform: nothing is kept in it between calls. */
  readonly scratch: Mat2D;
  readonly surfaces: RigSurfaces;
}

/** A prop's box on screen fits this square at any camera the court uses: a small target to clear and read back. */
const TILE = 512;

/** Whether `v` is a WebGL 2 context: a canvas whose context could not be made has none. */
const isGl2 = (v: unknown): v is WebGL2RenderingContext =>
  v !== null && v !== undefined && Reflect.has(Object(v), 'isContextLost');

/**
 * The surfaces of a rig drawn by `runtime`. A target is first drawn once with
 * `rest()` (a new artboard, unposed, drawn as large as the target holds, then
 * deleted), so the buffers it sizes hold any frame that fits it. Its context
 * is held in the page's budget of live WebGL contexts (`holdGl`, with
 * `glCanvas`'s), each use as the most recent; one the budget or the browser
 * has let go is found lost and made anew, primed again, before it draws, so
 * a target never draws blank; and each is let go with the rig (`dropGl`).
 */
export const rigSurfaces = (
  runtime: RiveCanvas,
  rest: () => Artboard,
  scratch: Mat2D,
): RigSurfaces => {
  const renderers = new Map<HTMLCanvasElement, WrappedRenderer>();
  const targets = new Map<number, GlTarget>();
  const renderer = (canvas: HTMLCanvasElement) => {
    const have = renderers.get(canvas);
    if (have !== undefined) return have;
    const made = runtime.makeRenderer(canvas);
    renderers.set(canvas, made);
    return made;
  };
  const target = (w: number, h: number) => {
    const at = w * 65536 + h;
    const have = targets.get(at);
    if (have !== undefined) {
      if (!have.gl.isContextLost()) {
        holdGl(have.canvas, have.gl);
        return have;
      }
      targets.delete(at);
      have.renderer.delete();
      dropGl(have.canvas);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    // The Rive Renderer makes the canvas's context (its own attributes); this is that context.
    const renderer = runtime.makeRenderer(canvas, false);
    const gl: unknown = canvas.getContext('webgl2');
    if (!isGl2(gl)) return undefined;
    const made = { canvas, gl, renderer };
    holdGl(canvas, gl);
    const first = rest();
    first.advance(0);
    const b = first.bounds;
    const fill = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
    made.renderer.clear();
    made.renderer.save();
    scratch.xx = fill;
    scratch.xy = 0;
    scratch.yx = 0;
    scratch.yy = fill;
    scratch.tx = -b.minX * fill;
    scratch.ty = -b.minY * fill;
    made.renderer.transform(scratch);
    first.draw(made.renderer);
    made.renderer.restore();
    made.renderer.flush();
    runtime.resolveAnimationFrame();
    first.delete();
    targets.set(at, made);
    return made;
  };
  const free = () => {
    for (const made of renderers.values()) made.delete();
    for (const made of targets.values()) {
      made.renderer.delete();
      dropGl(made.canvas);
    }
    renderers.clear();
    targets.clear();
  };
  return { renderer, target, free };
};

/** The names a rig has of a kind, for an error. */
const listed = (names: Iterable<string>) => [...names].join(', ');

/** No numbers: a pose that sets none. */
const NO_NUMBERS: Readonly<Record<string, number>> = {};

/** Why `pose` cannot be posed on `rig`: a timeline or a number it names that the rig lacks. */
const unposable = (spec: RivePropSpec, rig: LoadedRig, pose: RivePose): string | undefined => {
  for (const name in pose.numbers ?? NO_NUMBERS)
    if (!rig.numbers.has(name))
      return `rig ${spec.key} has no view-model number "${name}"; it has ${listed(rig.numbers)}`;
  for (let i = 0; i < pose.timelines.length; i++) {
    const name = pose.timelines[i]?.[0];
    if (name !== undefined && !rig.timelines.has(name))
      return `rig ${spec.key} has no timeline "${name}"; it has ${listed(rig.timelines.keys())}`;
  }
  return undefined;
};

/**
 * `artboard`, a frame's own, set to `pose`: its view-model instance (`vm`,
 * the frame's own too) bound and given the pose's numbers, the pose's
 * timelines applied in order, each on an instance made for it and deleted,
 * then the artboard advanced by no time, which applies the binds.
 */
const posed = (
  rig: LoadedRig,
  artboard: Artboard,
  vm: ViewModelInstance | undefined,
  pose: RivePose,
) => {
  if (vm !== undefined) {
    artboard.bindViewModelInstance(vm);
    const numbers = pose.numbers ?? NO_NUMBERS;
    for (const name in numbers) {
      const value = numbers[name];
      if (value !== undefined) vm.number(name).value = value;
    }
  }
  for (let i = 0; i < pose.timelines.length; i++) {
    const step = pose.timelines[i];
    const animation = step === undefined ? undefined : rig.timelines.get(step[0]);
    if (step === undefined || animation === undefined) continue;
    const mix = step[2] ?? 1;
    if (mix <= 0) continue;
    const t = new rig.runtime.LinearAnimationInstance(animation, artboard);
    t.time = step[1];
    t.apply(mix);
    t.delete();
  }
  artboard.advance(0);
};

/** Draw the posed `artboard` with Rive's Canvas 2D renderer on `ctx`, under its transform. */
const paintCanvas = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  rig: LoadedRig,
  artboard: Artboard,
) => {
  const [ox, oy] = spec.origin;
  // Made on the frame's own canvas: its 2D context is `ctx`, the one Rive draws into.
  const renderer = rig.surfaces.renderer(ctx.canvas);
  ctx.save();
  ctx.translate(-ox, -oy);
  renderer.beginFrame(false);
  renderer.save();
  artboard.draw(renderer);
  renderer.restore();
  // The canvas renderer queues its draws; flush them under our transform (and before the
  // frame's artboard is deleted, which a queued draw would skip).
  rig.runtime.resolveAnimationFrame();
  ctx.restore();
};

/**
 * Draw the posed `artboard` with the Rive Renderer on its target, and its box
 * on screen onto `ctx`: the box drawn at the tile's corner (whole pixels, so
 * its pixels are the frame's), or the frame at its own size. Reads the
 * context's transform once (`getTransform`) and allocates nothing else. Why
 * not, where no WebGL 2 context can be made for its target.
 */
const paintGl = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  rig: LoadedRig,
  artboard: Artboard,
): string | undefined => {
  const [ox, oy] = spec.origin;
  const m = ctx.getTransform();
  // The context's transform with the origin moved to (ox, oy), folded in by hand.
  const e = m.e - (m.a * ox + m.c * oy);
  const f = m.f - (m.b * ox + m.d * oy);
  const b = artboard.bounds;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < 4; k++) {
    const x = k === 1 || k === 2 ? b.maxX : b.minX;
    const y = k >= 2 ? b.maxY : b.minY;
    const px = m.a * x + m.c * y + e;
    const py = m.b * x + m.d * y + f;
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  }
  const x0 = Math.max(0, Math.floor(minX));
  const y0 = Math.max(0, Math.floor(minY));
  const x1 = Math.min(ctx.canvas.width, Math.ceil(maxX));
  const y1 = Math.min(ctx.canvas.height, Math.ceil(maxY));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w <= 0 || h <= 0) return undefined;
  const tiled = w <= TILE && h <= TILE;
  const sx = tiled ? x0 : 0;
  const sy = tiled ? y0 : 0;
  const target = tiled
    ? rig.surfaces.target(TILE, TILE)
    : rig.surfaces.target(ctx.canvas.width, ctx.canvas.height);
  if (target === undefined)
    return `rig ${spec.key}: no WebGL 2 context could be made to draw it on`;
  const { renderer } = target;
  // The WebGL 2 runtime (2.43.1) has no `beginFrame`, though the types it shares say so: its
  // `clear` is the frame's start (resize to the canvas, clear, register for the flush).
  renderer.clear();
  renderer.save();
  rig.scratch.xx = m.a;
  rig.scratch.xy = m.b;
  rig.scratch.yx = m.c;
  rig.scratch.yy = m.d;
  rig.scratch.tx = e - sx;
  rig.scratch.ty = f - sy;
  renderer.transform(rig.scratch);
  artboard.draw(renderer);
  renderer.restore();
  renderer.flush();
  rig.runtime.resolveAnimationFrame();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(target.canvas, x0 - sx, y0 - sy, w, h, x0, y0, w, h);
  ctx.restore();
  return undefined;
};

/** Declare the rig's face where the posed `artboard`'s face node stands, for the probe. */
const declareFace = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  rig: LoadedRig,
  artboard: Artboard,
) => {
  if (spec.face === undefined || !probesFaces(ctx)) return;
  const [ox, oy] = spec.origin;
  // Its place: the node's own offset through its parent's world transform (checked at load).
  const face = artboard.node(spec.face.node);
  face.parentWorldTransform(rig.scratch);
  const p = rig.scratch;
  const { x, y } = face;
  probeFace(
    ctx,
    p.xx * x + p.yx * y + p.tx - ox,
    p.xy * x + p.yy * y + p.ty - oy,
    spec.face.height,
  );
};

/**
 * Pose a new instance of `rig` (as `spec` declares it) to `pose` and draw it
 * at our origin under the context's transform, declaring its face, then
 * delete it: nothing once drawn, else why it cannot be (the pose names what
 * the rig lacks, or no WebGL 2 context can be made for a `webgl2` rig's
 * target), which the film throws (`f.rive`). The pose's names are
 * checked before an instance is made; a throw from the runtime itself fails
 * the frame and leaves that frame's instance to its file.
 */
export const drawRig = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  rig: LoadedRig,
  pose: RivePose,
): string | undefined => {
  const why = unposable(spec, rig, pose);
  if (why !== undefined) return why;
  const artboard = rig.file.artboardByName(spec.source.artboard);
  const vm = rig.model?.defaultInstance();
  posed(rig, artboard, vm, pose);
  if (rig.paints && spec.engine === 'canvas') paintCanvas(ctx, spec, rig, artboard);
  const painted =
    rig.paints && spec.engine === 'webgl2' ? paintGl(ctx, spec, rig, artboard) : undefined;
  declareFace(ctx, spec, rig, artboard);
  vm?.delete();
  artboard.delete();
  return painted;
};
