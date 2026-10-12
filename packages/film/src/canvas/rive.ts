// A Rive rig drawn in our frame: a figure built in Rive (bones, skinned
// paths, constraints, a view model) that a drawing declares (`drawing({ rigs
// })`) and poses by name each frame (`f.rive(name, pose)`), drawn under the
// frame's own transform, as `glCanvas` lets a look draw in 3D. This is the
// draw path: plain synchronous code, no Effect, no Promise and no allocation
// a frame. The film loads its rigs before its first frame (`src/rive`,
// `loadRigs`), and a rig's every wasm object belongs to that load's scope.
//
// Rive never owns the clock, and a frame is a function of its pose alone,
// whatever was drawn before it (`posed`): every path made afresh (the rig's
// `fresh` timeline played at its start and its end), every other timeline of
// the artboard applied at its start, then every view-model number the rig has
// set (the pose's, else its rest), then the pose's timelines in order, each
// bone an IK constraint turns (`refresh`) dirtied, and the machine and the
// artboard advanced by no time.
//
// Why every path is made afresh: Rive keeps a shape's paths in the shape's
// own space, mapped by the inverse of the shape's world transform times each
// path's, and remakes them only when a path's geometry changes or that
// product moves by more than 16 float epsilons (`PathComposer`). A rigid move
// leaves the product equal but for rounding, so a shape drawn on a later
// frame keeps the paths an earlier frame made, with that frame's rounding:
// the fixture arm, posed through shuffled times, drew 22 of 60 frames off a
// new artboard's by up to a millionth of a unit, and the court's accused drew
// a pixel apart. The `fresh` timeline moves one point of every path (or an
// ellipse's or a rectangle's width) a unit off at its start and back as cut
// at its end, so each path's geometry changes on every frame and every shape
// is remade from that frame's own transforms.
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
  Bone,
  LinearAnimationInstance,
  Mat2D,
  Node,
  RiveCanvas,
  StateMachineInstance,
  ViewModelInstanceNumber,
  WrappedRenderer,
} from '@rive-app/webgl2-advanced';
import { probeFace, probesFaces } from './probe.ts';

/** Which of Rive's renderers draws a rig. */
export type RiveEngine = 'canvas' | 'webgl2';

/**
 * A rig's built file (its URL in a page, its path in Bun: the module's own
 * `import riv from './x.riv' with { type: 'file' }`), the artboard drawn, the
 * timelines a pose may name, the timeline that makes every path afresh, the
 * view model's numbers it may set, and the machine that applies the view
 * model's binds.
 */
interface RiveSource<Tl extends string = string, N extends string = string> {
  readonly riv: string;
  readonly artboard: string;
  readonly timelines: ReadonlyArray<Tl>;
  /**
   * A one-shot timeline keying one point of every path the artboard draws
   * (or an ellipse's or a rectangle's width) a unit off at its start and
   * back as cut at its end. Every frame plays it at both ends before
   * anything else, so every shape is remade from that frame's own
   * transforms and no frame carries the rounding of one drawn before it; a
   * path it leaves out may. Not a timeline a pose names, nor part of the
   * rest.
   */
  readonly fresh: string;
  /** The numbers a pose may set, checked against the file at load; any of its numbers when it names none. */
  readonly numbers?: ReadonlyArray<N>;
  readonly stateMachine?: string;
  /**
   * Bones an IK constraint turns, dirtied every frame (turned and turned
   * back) so the solve starts from the frame's own pose, never from the
   * last frame's world transform.
   */
  readonly refresh?: ReadonlyArray<string>;
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
 * order with its mix (1 by default; 0 leaves it at rest), then the view
 * model's numbers by name (one left out at its rest).
 */
interface RivePose<Tl extends string = string, N extends string = string> {
  readonly timelines: ReadonlyArray<readonly [name: Tl, seconds: number, mix?: number]>;
  readonly numbers?: Readonly<Partial<Record<N, number>>>;
}

/** The pose a declared rig takes: its own timelines and numbers. */
export type PoseOf<S> = S extends RivePropSpec<infer Tl, infer N> ? RivePose<Tl, N> : never;

/** A view-model number a rig has, and the value it rests at. */
interface RigNumber {
  readonly name: string;
  readonly input: ViewModelInstanceNumber;
  readonly rest: number;
}

/** A WebGL 2 canvas off the page, and the Rive Renderer on it. */
interface GlTarget {
  readonly canvas: HTMLCanvasElement;
  readonly renderer: WrappedRenderer;
}

/**
 * What a rig draws on: a renderer on each frame canvas (`canvas`) and a target
 * at each size (`webgl2`), made on first use and freed with the rig (`free`).
 */
interface RigSurfaces {
  readonly renderer: (canvas: HTMLCanvasElement) => WrappedRenderer;
  readonly target: (w: number, h: number) => GlTarget;
  readonly free: () => void;
}

/** A rig loaded for drawing (`loadRigs`, src/rive): every object its load's scope owns. */
export interface LoadedRig {
  readonly runtime: RiveCanvas;
  /** False where the rig is posed and probed but never drawn (Bun, which has no canvas). */
  readonly paints: boolean;
  readonly artboard: Artboard;
  /** The timeline that makes every path afresh (`RiveSource.fresh`), played at both ends each frame. */
  readonly fresh: LinearAnimationInstance;
  /** Every other timeline of the artboard, each applied at its start: the rest a frame is posed from. */
  readonly rest: ReadonlyArray<LinearAnimationInstance>;
  /** The declared timelines, by name. */
  readonly timelines: ReadonlyMap<string, LinearAnimationInstance>;
  /** The numbers a pose may set: every one written each frame. */
  readonly numbers: ReadonlyArray<RigNumber>;
  readonly machine: StateMachineInstance | undefined;
  readonly refresh: ReadonlyArray<Bone>;
  readonly face: Node | undefined;
  /** Scratch for a frame's transform: nothing is kept in it between calls. */
  readonly scratch: Mat2D;
  readonly surfaces: RigSurfaces;
}

/** A prop's box on screen fits this square at any camera the court uses: a small target to clear and read back. */
const TILE = 512;

/**
 * The surfaces of a rig drawn by `runtime`. A target is first drawn once with
 * `rest()` (a fresh artboard, unposed, drawn as large as the target holds, then
 * deleted), so the buffers it sizes hold any frame that fits it.
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
    if (have !== undefined) return have;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const made = { canvas, renderer: runtime.makeRenderer(canvas, false) };
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
    for (const made of targets.values()) made.renderer.delete();
    renderers.clear();
    targets.clear();
  };
  return { renderer, target, free };
};

/** Whether `rig` has a view-model number `name` a pose may set. */
const hasNumber = (rig: LoadedRig, name: string) => {
  for (let i = 0; i < rig.numbers.length; i++) if (rig.numbers[i]?.name === name) return true;
  return false;
};

/** The names a rig has of a kind, for an error. */
const listed = (names: Iterable<string>) => [...names].join(', ');

/**
 * A time past the end of any `fresh` timeline: a one-shot timeline holds its
 * last keys past its end, and the runtime does not tell a timeline's length.
 */
const PAST_ITS_END = 3600;

/** Every path a unit off and back as cut: each shape's paths remade on this frame. */
const freshened = (rig: LoadedRig) => {
  rig.fresh.time = 0;
  rig.fresh.apply(1);
  rig.fresh.time = PAST_ITS_END;
  rig.fresh.apply(1);
};

/** Every other timeline of the artboard applied at its start, in full: the rest a frame is posed from. */
const atRest = (rig: LoadedRig) => {
  for (let i = 0; i < rig.rest.length; i++) {
    const t = rig.rest[i];
    if (t === undefined) continue;
    t.time = 0;
    t.apply(1);
  }
};

/** Every number the rig has written: the pose's, else its rest. Why not, for a number it lacks. */
const numbered = (spec: RivePropSpec, rig: LoadedRig, pose: RivePose): string | undefined => {
  const numbers = pose.numbers ?? {};
  for (const name in numbers)
    if (!hasNumber(rig, name))
      return `rig ${spec.key} has no view-model number "${name}"; it has ${listed(rig.numbers.map((n) => n.name))}`;
  for (let i = 0; i < rig.numbers.length; i++) {
    const n = rig.numbers[i];
    if (n === undefined) continue;
    n.input.value = numbers[n.name] ?? n.rest;
  }
  return undefined;
};

/** The pose's timelines applied in order, each at its time and mix. Why not, for one the rig lacks. */
const timed = (spec: RivePropSpec, rig: LoadedRig, pose: RivePose): string | undefined => {
  for (let i = 0; i < pose.timelines.length; i++) {
    const step = pose.timelines[i];
    if (step === undefined) continue;
    const t = rig.timelines.get(step[0]);
    if (t === undefined)
      return `rig ${spec.key} has no timeline "${step[0]}"; it has ${listed(rig.timelines.keys())}`;
    const mix = step[2] ?? 1;
    t.time = step[1];
    if (mix > 0) t.apply(mix);
  }
  return undefined;
};

/**
 * Set `rig` to `pose` from rest: every path made afresh, every other
 * timeline at its start, every number, the pose's timelines, the refreshed
 * bones, then the machine and the artboard by no time at all. The fresh
 * timeline goes first, so a timeline that keys the same point (a boil) has
 * the last word. Why it cannot, when the pose names a timeline or a number
 * the rig does not have.
 */
const posed = (spec: RivePropSpec, rig: LoadedRig, pose: RivePose): string | undefined => {
  freshened(rig);
  atRest(rig);
  const why = numbered(spec, rig, pose) ?? timed(spec, rig, pose);
  if (why !== undefined) return why;
  for (let i = 0; i < rig.refresh.length; i++) {
    const bone = rig.refresh[i];
    if (bone === undefined) continue;
    const r = bone.rotation;
    bone.rotation = r + 1;
    bone.rotation = r;
  }
  rig.machine?.advance(0);
  rig.artboard.advance(0);
  return undefined;
};

/** Draw the posed rig with Rive's Canvas 2D renderer on `ctx`, under its transform. */
const paintCanvas = (ctx: CanvasRenderingContext2D, spec: RivePropSpec, rig: LoadedRig) => {
  const [ox, oy] = spec.origin;
  // Made on the frame's own canvas: its 2D context is `ctx`, the one Rive draws into.
  const renderer = rig.surfaces.renderer(ctx.canvas);
  ctx.save();
  ctx.translate(-ox, -oy);
  renderer.beginFrame(false);
  renderer.save();
  rig.artboard.draw(renderer);
  renderer.restore();
  // The canvas renderer queues its draws; flush them under our transform.
  rig.runtime.resolveAnimationFrame();
  ctx.restore();
};

/**
 * Draw the posed rig with the Rive Renderer on its target, and its box on
 * screen onto `ctx`: the box drawn at the tile's corner (whole pixels, so its
 * pixels are the frame's), or the frame at its own size.
 */
const paintGl = (ctx: CanvasRenderingContext2D, spec: RivePropSpec, rig: LoadedRig) => {
  const [ox, oy] = spec.origin;
  const m = ctx.getTransform().translate(-ox, -oy);
  const b = rig.artboard.bounds;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let k = 0; k < 4; k++) {
    const x = k === 1 || k === 2 ? b.maxX : b.minX;
    const y = k >= 2 ? b.maxY : b.minY;
    const px = m.a * x + m.c * y + m.e;
    const py = m.b * x + m.d * y + m.f;
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
  if (w <= 0 || h <= 0) return;
  const tiled = w <= TILE && h <= TILE;
  const sx = tiled ? x0 : 0;
  const sy = tiled ? y0 : 0;
  const target = tiled
    ? rig.surfaces.target(TILE, TILE)
    : rig.surfaces.target(ctx.canvas.width, ctx.canvas.height);
  const { renderer } = target;
  // The WebGL 2 runtime (2.43.1) has no `beginFrame`, though the types it shares say so: its
  // `clear` is the frame's start (resize to the canvas, clear, register for the flush).
  renderer.clear();
  renderer.save();
  rig.scratch.xx = m.a;
  rig.scratch.xy = m.b;
  rig.scratch.yx = m.c;
  rig.scratch.yy = m.d;
  rig.scratch.tx = m.e - sx;
  rig.scratch.ty = m.f - sy;
  renderer.transform(rig.scratch);
  rig.artboard.draw(renderer);
  renderer.restore();
  renderer.flush();
  rig.runtime.resolveAnimationFrame();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(target.canvas, x0 - sx, y0 - sy, w, h, x0, y0, w, h);
  ctx.restore();
};

/** Declare the rig's face where its face node stands, for the probe. */
const declareFace = (ctx: CanvasRenderingContext2D, spec: RivePropSpec, rig: LoadedRig) => {
  if (spec.face === undefined || rig.face === undefined || !probesFaces(ctx)) return;
  const [ox, oy] = spec.origin;
  // The node's place: its own offset through its parent's world transform, with no allocation.
  rig.face.parentWorldTransform(rig.scratch);
  const p = rig.scratch;
  const { x, y } = rig.face;
  probeFace(
    ctx,
    p.xx * x + p.yx * y + p.tx - ox,
    p.xy * x + p.yy * y + p.ty - oy,
    spec.face.height,
  );
};

/**
 * Pose `rig` (as `spec` declares it) to `pose` from rest and draw it at our
 * origin under the context's transform, declaring its face: nothing once
 * drawn, else why it cannot be (the pose names what the rig lacks), which the
 * film throws (`f.rive`).
 */
export const drawRig = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  rig: LoadedRig,
  pose: RivePose,
): string | undefined => {
  const why = posed(spec, rig, pose);
  if (why !== undefined) return why;
  if (rig.paints) {
    if (spec.engine === 'canvas') paintCanvas(ctx, spec, rig);
    else paintGl(ctx, spec, rig);
  }
  declareFace(ctx, spec, rig);
  return undefined;
};
