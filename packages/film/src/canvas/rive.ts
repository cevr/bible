// A Rive artboard as a prop in our frame (`riveProp`): a rig built in Rive
// (bones, skinned paths, constraints, a view model) posed by the frame and
// drawn under the frame's own transform, the way `glCanvas` lets a look draw
// in 3D. Rive never owns the clock: each frame sets every timeline's time and
// every view-model number from `f`, applies them in a fixed order and
// advances the artboard by 0, so the frame stays a pure function of its time.
//
// Two engines draw it:
//
// - `canvas` (`@rive-app/canvas-advanced`): Rive's Canvas 2D renderer, on our
//   own context, so our camera, alpha and plane haze reach it as they reach
//   any piece; its draws are queued and flushed (`resolveAnimationFrame`)
//   while our transform is still on the context.
// - `webgl2` (`@rive-app/webgl2-advanced`): the Rive Renderer (feathers drawn
//   analytically) on a WebGL 2 canvas off the page (a 512 px tile where the
//   prop fits, else the frame's size), its box on screen composited with
//   `drawImage`. Where WebGL has no pixel local
//   storage (SwiftShader, so every render on Linux) the Rive Renderer falls
//   back to 4× MSAA and draws a feather only on a `clockwise` fill.
//
// Both load asynchronously (a wasm runtime and the .riv): a look awaits
// `loadRive` before its first frame (a top-level await in the browser). Where
// none is loaded (the stand-in context `check --draw` draws into, a Bun
// process) `riveProp` draws nothing and answers false, and the look draws its
// fallback. Probes cannot see inside an artboard: `face` names a node whose
// place `riveProp` reads back and declares (`probeFace`).
//
// A spike (rive-spike, 2026-10-11): not exported from `canvas`, imported as
// `@bible/film/rive`.

import type {
  Artboard,
  File as RiveFile,
  LinearAnimationInstance,
  RiveCanvas,
  StateMachineInstance,
  ViewModelInstance,
  WrappedRenderer,
} from '@rive-app/canvas-advanced';
import canvasWasm from '@rive-app/canvas-advanced/rive.wasm' with { type: 'file' };
import glWasm from '@rive-app/webgl2-advanced/rive.wasm' with { type: 'file' };
import { probeFace, probesFaces } from './probe.ts';

/** Which of Rive's renderers draws a prop. */
export type RiveEngine = 'canvas' | 'webgl2';

/** A rig: its built file's URL, the artboard drawn, the timelines a pose may name, and the machine that applies its view model's binds. */
export interface RiveSource {
  readonly riv: string;
  readonly artboard: string;
  readonly timelines: ReadonlyArray<string>;
  readonly stateMachine?: string;
  /**
   * Bones an IK constraint turns. The runtime solves IK on top of the bone's
   * last world transform when nothing dirtied the bone this frame, so a
   * frame would carry the frame drawn before it; each of these is dirtied
   * every frame (turned and turned back) so its solve starts from its pose.
   */
  readonly refresh?: ReadonlyArray<string>;
}

/**
 * One frame's pose: each timeline at its time in seconds, applied in this
 * order with its mix (1 by default; 0 leaves it out), then the view model's
 * numbers by name.
 */
export interface RivePose {
  readonly timelines: ReadonlyArray<readonly [name: string, seconds: number, mix?: number]>;
  readonly numbers?: Readonly<Record<string, number>>;
}

/** A prop: its rig, the engine, the instance's key, and which artboard point stands at our (0, 0). */
export interface RivePropSpec {
  readonly source: RiveSource;
  readonly engine: RiveEngine;
  /** One instance per key: two props of one rig posed apart need two keys. */
  readonly key: string;
  readonly origin: readonly [number, number];
  /** A node whose place is the face, and the face's height in artboard units, for `check`'s face probe. */
  readonly face?: { readonly node: string; readonly height: number };
}

interface Rig {
  readonly runtime: RiveCanvas;
  readonly file: RiveFile;
  readonly artboard: Artboard;
  readonly timelines: ReadonlyMap<string, LinearAnimationInstance>;
  readonly machine: StateMachineInstance | undefined;
  readonly vm: ViewModelInstance | undefined;
  readonly refresh: ReadonlyArray<{ rotation: number }>;
}

const runtimes = new Map<RiveEngine, Promise<RiveCanvas>>();
const files = new Map<string, Promise<RiveFile>>();
const rigs = new Map<string, Rig>();
const loaded = new Set<string>();

const runtimeOf = (engine: RiveEngine): Promise<RiveCanvas> => {
  const have = runtimes.get(engine);
  if (have !== undefined) return have;
  const made = (async () => {
    const mod =
      engine === 'canvas'
        ? await import('@rive-app/canvas-advanced')
        : await import('@rive-app/webgl2-advanced');
    const wasm = engine === 'canvas' ? canvasWasm : glWasm;
    // Each package types its runtime alike; the webgl2 one is the same surface.
    return (await mod.default({ locateFile: () => wasm })) as RiveCanvas;
  })();
  runtimes.set(engine, made);
  return made;
};

const fileKey = (engine: RiveEngine, riv: string) => `${engine}\n${riv}`;

/** Load `source`'s runtime and file for `engine`: what a look awaits before its first frame. */
export const loadRive = async (source: RiveSource, engine: RiveEngine): Promise<void> => {
  const key = fileKey(engine, source.riv);
  if (!files.has(key))
    files.set(
      key,
      (async () => {
        const runtime = await runtimeOf(engine);
        const bytes = new Uint8Array(await (await fetch(source.riv)).arrayBuffer());
        return runtime.load(bytes);
      })(),
    );
  await files.get(key);
  loaded.add(key);
};

/** The rig for `spec`, made on first use from its loaded file; none where it is not loaded. */
const rigOf = async (spec: RivePropSpec) => {
  const runtime = await runtimeOf(spec.engine);
  const file = await files.get(fileKey(spec.engine, spec.source.riv));
  if (file === undefined) return undefined;
  const artboard = file.artboardByName(spec.source.artboard);
  const timelines = new Map(
    spec.source.timelines.map((name) => [
      name,
      new runtime.LinearAnimationInstance(artboard.animationByName(name), artboard),
    ]),
  );
  const machine =
    spec.source.stateMachine === undefined
      ? undefined
      : new runtime.StateMachineInstance(artboard.stateMachineByName(spec.source.stateMachine), artboard);
  const model = file.defaultArtboardViewModel(artboard);
  const vm = model === null || model === undefined ? undefined : model.defaultInstance();
  if (vm !== undefined) {
    machine?.bindViewModelInstance(vm);
    artboard.bindViewModelInstance(vm);
  }
  const refresh = (spec.source.refresh ?? []).map((name) => artboard.bone(name));
  return { runtime, file, artboard, timelines, machine, vm, refresh } satisfies Rig;
};

/** Make every rig `specs` name now, so the first frame finds it: what a look awaits after `loadRive`. */
export const prepareRive = async (specs: ReadonlyArray<RivePropSpec>): Promise<void> => {
  for (const spec of specs) {
    await loadRive(spec.source, spec.engine);
    const k = rigKey(spec);
    if (rigs.has(k)) continue;
    const rig = await rigOf(spec);
    if (rig !== undefined) rigs.set(k, rig);
  }
};

const rigKey = (spec: RivePropSpec) => `${spec.engine}\n${spec.source.riv}\n${spec.key}`;

/** Set the rig to `pose`: every timeline in order, the view model's numbers, then the machine and the artboard by no time at all. */
const posed = (rig: Rig, pose: RivePose) => {
  if (rig.vm !== undefined)
    for (const [name, value] of Object.entries(pose.numbers ?? {})) {
      const n = rig.vm.number(name);
      if (n !== null && n !== undefined) n.value = value;
    }
  for (const [name, seconds, mix = 1] of pose.timelines) {
    const t = rig.timelines.get(name);
    if (t === undefined) throw new Error(`rig has no timeline "${name}"`);
    t.time = seconds;
    if (mix > 0) t.apply(mix);
  }
  for (const bone of rig.refresh) {
    const r = bone.rotation;
    bone.rotation = r + 1;
    bone.rotation = r;
  }
  rig.machine?.advance(0);
  rig.artboard.advance(0);
};

const canvasRenderers = new WeakMap<object, WrappedRenderer>();

/**
 * WebGL 2 canvases off the page, by key and size. Which size a frame draws
 * in is the frame's own choice (`TILE` when the prop's box fits it, else the
 * frame's size), never grown from the frames drawn before: a target grown
 * as boxes grew drew a frame a pixel apart by the frames before it.
 */
const glTargets = new Map<string, { canvas: HTMLCanvasElement; renderer: WrappedRenderer }>();
/** A prop's box on screen fits this square at any camera the court uses: a small target to clear and read back. */
const TILE = 512;

/**
 * The target for `key` at `w` × `h`, made on first use and first drawn once
 * with `rest` (a fresh artboard, unposed, untransformed): the Rive Renderer
 * sizes its buffers from the first frame it draws and keeps them, and a
 * page's first frame should not decide them.
 */
const glTarget = (runtime: RiveCanvas, key: string, w: number, h: number, rest: () => Artboard) => {
  const at = `${key}\n${w}x${h}`;
  const have = glTargets.get(at);
  if (have !== undefined) return have;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const made = { canvas, renderer: runtime.makeRenderer(canvas, false) };
  // Drawn as large as the target holds, so the buffers it sizes hold any frame that fits it.
  const first = rest();
  first.advance(0);
  const b = first.bounds;
  const fill = Math.min(w / (b.maxX - b.minX), h / (b.maxY - b.minY));
  made.renderer.clear();
  made.renderer.save();
  const mat = new runtime.Mat2D();
  mat.xx = fill;
  mat.yy = fill;
  mat.tx = -b.minX * fill;
  mat.ty = -b.minY * fill;
  made.renderer.transform(mat);
  mat.delete();
  first.draw(made.renderer);
  made.renderer.restore();
  made.renderer.flush();
  runtime.resolveAnimationFrame();
  first.delete();
  glTargets.set(at, made);
  return made;
};

/**
 * Pose the prop and draw it at our origin under the context's transform:
 * true once drawn, false where its rig is not loaded (draw the fallback).
 */
export const riveProp = (
  ctx: CanvasRenderingContext2D,
  spec: RivePropSpec,
  pose: RivePose,
): boolean => {
  const rig = rigs.get(rigKey(spec));
  if (rig === undefined) return false;
  posed(rig, pose);
  const [ox, oy] = spec.origin;
  const { runtime, artboard } = rig;

  if (spec.engine === 'canvas') {
    // Made on the frame's own canvas: its 2D context is `ctx`, the one Rive draws into.
    let renderer = canvasRenderers.get(ctx.canvas);
    if (renderer === undefined) {
      renderer = runtime.makeRenderer(ctx.canvas);
      canvasRenderers.set(ctx.canvas, renderer);
    }
    ctx.save();
    ctx.translate(-ox, -oy);
    renderer.beginFrame(false);
    renderer.save();
    artboard.draw(renderer);
    renderer.restore();
    // The canvas renderer queues its draws; flush them under our transform.
    runtime.resolveAnimationFrame();
    ctx.restore();
  } else {
    const m = ctx.getTransform().translate(-ox, -oy);
    const b = artboard.bounds;
    const corners = [
      [b.minX, b.minY],
      [b.maxX, b.minY],
      [b.maxX, b.maxY],
      [b.minX, b.maxY],
    ].map(([x = 0, y = 0]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] as const);
    const xs = corners.map(([x]) => x);
    const ys = corners.map(([, y]) => y);
    const x0 = Math.max(0, Math.floor(Math.min(...xs)));
    const y0 = Math.max(0, Math.floor(Math.min(...ys)));
    const x1 = Math.min(ctx.canvas.width, Math.ceil(Math.max(...xs)));
    const y1 = Math.min(ctx.canvas.height, Math.ceil(Math.max(...ys)));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w > 0 && h > 0) {
      // The box drawn at the tile's corner (whole pixels, so its pixels are the frame's), or the frame at its own.
      const tiled = w <= TILE && h <= TILE;
      const [sx, sy] = tiled ? [x0, y0] : [0, 0];
      const [tw, th] = tiled ? [TILE, TILE] : [ctx.canvas.width, ctx.canvas.height];
      const target = glTarget(runtime, spec.key, tw, th, () =>
        rig.file.artboardByName(spec.source.artboard),
      );
      const { renderer } = target;
      // The WebGL 2 runtime (2.43.1) has no `beginFrame`, though the types it shares say so: its
      // `clear` is the frame's start (resize to the canvas, clear, register for the flush).
      renderer.clear();
      renderer.save();
      const mat = new runtime.Mat2D();
      mat.xx = m.a;
      mat.xy = m.b;
      mat.yx = m.c;
      mat.yy = m.d;
      mat.tx = m.e - sx;
      mat.ty = m.f - sy;
      renderer.transform(mat);
      mat.delete();
      artboard.draw(renderer);
      renderer.restore();
      renderer.flush();
      runtime.resolveAnimationFrame();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(target.canvas, x0 - sx, y0 - sy, w, h, x0, y0, w, h);
      ctx.restore();
    }
  }

  if (spec.face !== undefined && probesFaces(ctx)) {
    const at = artboard.node(spec.face.node).worldTransform();
    probeFace(ctx, at.tx - ox, at.ty - oy, spec.face.height);
  }
  return true;
};
