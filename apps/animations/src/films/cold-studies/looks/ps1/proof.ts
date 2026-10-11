// The WebGL proof the ps1 look starts from: a flat-shaded low-poly cube in
// three.js, rendered at the PlayStation's 320 × 240 into the engine's WebGL 2
// canvas (`glCanvas`) and scaled up into the frame nearest-neighbour with
// `drawImage`. Its renderer, scene and mesh are made once for the canvas and
// kept; every frame sets the cube's turn from the frame's own time before it
// renders, so the frame is a pure function of T. Where no WebGL 2 context
// can be made (the stand-in `check --draw` draws into), it draws nothing and
// says so, and the look draws its fallback.

import { glCanvas } from '@bible/film/canvas';
import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import type { CourtFrame } from '../../scenes/court.ts';

/** The internal resolution: the console's. */
export const LOW = { w: 320, h: 240 } as const;

/** One canvas's three.js renderer and the scene it draws. */
interface Rig {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly cube: Mesh;
}

/** Each WebGL 2 context's rig, made the first time it draws. */
const rigs = new WeakMap<WebGL2RenderingContext, Rig>();

const rig = (canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): Rig => {
  const renderer = new WebGLRenderer({ canvas, context: gl, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setClearColor(new Color('#1c2433'), 1);
  const scene = new Scene();
  scene.add(new AmbientLight('#8a90a8', 1.2));
  const sun = new DirectionalLight('#ffe2b0', 2.2);
  sun.position.set(2, 3, 4);
  scene.add(sun);
  const cube = new Mesh(
    new BoxGeometry(1.4, 1.4, 1.4),
    new MeshLambertMaterial({ color: '#c0503a', flatShading: true }),
  );
  scene.add(cube);
  const camera = new PerspectiveCamera(50, LOW.w / LOW.h, 0.1, 50);
  camera.position.set(0, 0.6, 4);
  camera.lookAt(0, 0, 0);
  return { renderer, scene, camera, cube };
};

/**
 * The cube at `f.t`, scaled up nearest-neighbour into `(x, y, w, h)` on the
 * frame; false where no WebGL 2 canvas can be made.
 */
export const cube = (f: CourtFrame, x: number, y: number, w: number, h: number): boolean => {
  const gl = glCanvas('ps1-proof', LOW.w, LOW.h);
  if (gl === undefined) return false;
  let r = rigs.get(gl.gl);
  if (r === undefined) {
    r = rig(gl.canvas, gl.gl);
    rigs.set(gl.gl, r);
  }
  // Every value the frame shows, from the frame's time.
  r.cube.rotation.set(0.5 * f.t, 0.8 * f.t, 0);
  r.renderer.render(r.scene, r.camera);
  const { ctx } = f;
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(gl.canvas, x, y, w, h);
  ctx.restore();
  return true;
};
