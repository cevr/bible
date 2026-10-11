// The engraved courtroom at the frame's time: the hall (`world.ts`) posed
// from the cues, seen through the shot the cues have reached, rendered with
// the burin into the engine's WebGL canvas and pulled onto the paper inside
// the plate's border. Four shots, cut on the cues as a film is cut: the hall
// from behind the accused while the evidence piles up; his face as he bows
// ("You did it"); the judge from below as he leans in and the gavel falls;
// and the accused as the rose window's light breaks over him and he lifts
// his head ("righteous"). The camera breathes as a dolly in the hall, never
// as a zoom on the print, so the lines stay on the forms.

import { glCanvas, camera as shot, UNMOVED } from '@bible/film/canvas';
import { type Key, clamp, lerp } from '@bible/film/core';
import {
  DepthTexture,
  MeshBasicMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import type { CourtFrame } from '../../scenes/court.ts';
import { type HallLight, hallLight } from './burin.ts';
import { PICTURE, layPaper, plate } from './print.ts';
import { ACCUSED_AT, type World, world } from './world.ts';

/** The shadow map's side. */
const SHADOW = 2048;

/** One WebGL context's renderer, hall, cameras and shadow. */
interface Rig {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly world: World;
  readonly light: HallLight;
  readonly eye: PerspectiveCamera;
  readonly sun: OrthographicCamera;
  readonly shadow: WebGLRenderTarget;
  readonly depth: MeshBasicMaterial;
}

const rigs = new WeakMap<WebGL2RenderingContext, Rig>();

const rig = (canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): Rig => {
  const renderer = new WebGLRenderer({
    canvas,
    context: gl,
    antialias: false,
    alpha: true,
    premultipliedAlpha: true,
  });
  renderer.setPixelRatio(1);
  renderer.autoClear = false;
  const light = hallLight();
  const w = world(light);
  const scene = new Scene();
  scene.add(w.scene);
  const eye = new PerspectiveCamera(40, PICTURE.w / PICTURE.h, 0.05, 80);
  // The window's light as a camera: an orthographic view down the shaft.
  const sun = new OrthographicCamera(-14, 14, 14, -14, 0.1, 70);
  const centre = new Vector3(0, 3, -2);
  sun.position.copy(centre).addScaledVector(light.uL.value, -30);
  sun.lookAt(centre);
  sun.updateMatrixWorld();
  sun.updateProjectionMatrix();
  light.uLightMat.value.multiplyMatrices(sun.projectionMatrix, sun.matrixWorldInverse);
  const shadow = new WebGLRenderTarget(SHADOW, SHADOW, {
    depthTexture: new DepthTexture(SHADOW, SHADOW),
  });
  light.uShadow.value = shadow.depthTexture;
  light.uShadowTexel.value = 1 / SHADOW;
  // The rose window's light falls on the accused.
  const rose = new Vector3(light.uRose.value.y, light.uRose.value.z, light.uRose.value.x);
  const onHim = new Vector3(ACCUSED_AT[0], 1.3, ACCUSED_AT[2]);
  light.uL2.value.subVectors(onHim, rose).normalize();
  return {
    renderer,
    scene,
    world: w,
    light,
    eye,
    sun,
    shadow,
    depth: new MeshBasicMaterial({ colorWrite: false }),
  };
};

/** The gavel arm's turn across its cue: raised, down hard, a bounce, at rest on the block. */
const SWING: ReadonlyArray<Key> = [
  [0, 0.05],
  [0.373, -1.25],
  [0.627, 0.42, 'inCubic'],
  [0.797, 0.26, 'outQuad'],
  [1, 0.4],
];

/** A camera's place, where it looks, and its lens (vertical degrees). */
interface View {
  readonly at: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly fov: number;
}

/** Each shot: where it starts and where it has drifted to by its cut. */
const SHOTS: ReadonlyArray<readonly [View, View]> = [
  // The hall, from behind the accused: "Imagine standing in a courtroom."
  [
    { at: [-4.6, 1.3, 4.0], to: [1.0, 2.3, -6.2], fov: 46 },
    { at: [-4.2, 1.32, 3.3], to: [1.0, 2.3, -6.2], fov: 46 },
  ],
  // His face, bowing: "You did it."
  [
    { at: [-1.45, 1.3, -1.45], to: [-2.35, 1.6, -0.6], fov: 32 },
    { at: [-1.55, 1.3, -1.4], to: [-2.35, 1.58, -0.6], fov: 32 },
  ],
  // The judge from below, leaning in, the gavel falling.
  [
    { at: [1.5, 2.0, -4.0], to: [2.6, 2.75, -7.0], fov: 36 },
    { at: [1.6, 2.0, -4.3], to: [2.6, 2.75, -7.0], fov: 36 },
  ],
  // The verdict: the rose window's light breaks over him.
  [
    { at: [-0.75, 1.15, -2.15], to: [-2.4, 1.45, -0.5], fov: 36 },
    { at: [-0.95, 1.17, -2.0], to: [-2.4, 1.45, -0.5], fov: 36 },
  ],
];

/** Which shot the cues have reached, and how far through it the frame is. */
const shotAt = (f: CourtFrame): readonly [number, number] => {
  const bow = f.cue('bow').start;
  const lean = f.cue('lean').start;
  const lift = f.cue('lift').start;
  const through = (a: number, b: number) => clamp((f.t - a) / Math.max(1e-6, b - a));
  if (f.at('lift') > 0) return [3, through(lift, f.dur)];
  if (f.at('lean') > 0) return [2, through(lean, lift)];
  if (f.at('bow') > 0) return [1, through(bow, lean)];
  return [0, through(0, bow)];
};

const aim = (eye: PerspectiveCamera, a: View, b: View, k: number) => {
  eye.position.set(lerp(a.at[0], b.at[0], k), lerp(a.at[1], b.at[1], k), lerp(a.at[2], b.at[2], k));
  eye.fov = lerp(a.fov, b.fov, k);
  eye.updateProjectionMatrix();
  eye.lookAt(lerp(a.to[0], b.to[0], k), lerp(a.to[1], b.to[1], k), lerp(a.to[2], b.to[2], k));
  eye.updateMatrixWorld();
};

/** Everything that moves, set from the frame's time. */
const pose = (r: Rig, f: CourtFrame) => {
  const { accused, judge, evidence } = r.world;
  const lift = f.at('lift');
  const bow = f.at('bow') * (1 - lift);
  const breath = Math.sin(f.t * 1.7);
  accused.root.rotation.y = 2.49;
  accused.torso.rotation.x = 0.14 * bow - 0.03 * lift + 0.008 * breath;
  accused.head.rotation.set(0.55 * bow - 0.3 * lift, 0.1 * bow, 0.06 * bow);

  const lean = f.at('lean');
  judge.root.rotation.y = -0.32;
  judge.torso.rotation.set(0.2 * lean + 0.006 * breath, -0.18 * lean, 0);
  judge.head.rotation.set(0.16 * lean, -0.3 * lean, 0);
  judge.arm.rotation.set(f.keys('gavel', SWING), 0, 0);

  evidence.forEach((e, i) => {
    const k = f.stagger('drop', i, evidence.length);
    e.mesh.visible = k > 0;
    e.mesh.position.set(e.rest[0], lerp(e.rest[1] + 3.4, e.rest[1], k), e.rest[2]);
    e.mesh.rotation.set(0, e.yaw + (1 - k) * 1.4, e.roll + (1 - k) * 0.6);
  });

  r.light.uRoseOn.value = Math.max(0, f.at('stamp'));
  r.light.uRoseTurn.value = 0;
};

/** The hall rendered at the frame's time into `gl`; the canvas it drew. */
const render = (r: Rig, f: CourtFrame, s: number) => {
  pose(r, f);
  const [i, k] = shotAt(f);
  const views = SHOTS[i] ?? SHOTS[0];
  if (views !== undefined) aim(r.eye, views[0], views[1], k);
  r.light.uPeriod.value = Math.max(3.6, 7 * s);
  r.scene.updateMatrixWorld(true);

  const { renderer, scene } = r;
  // The window's shadow: what stands in the hall, seen down the shaft.
  for (const o of r.world.blind) o.visible = false;
  scene.overrideMaterial = r.depth;
  renderer.setRenderTarget(r.shadow);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, true);
  renderer.render(scene, r.sun);
  scene.overrideMaterial = null;
  for (const o of r.world.blind) o.visible = true;

  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 0);
  renderer.clear(true, true, true);
  renderer.render(scene, r.eye);
};

export const court = (f: CourtFrame) => {
  const { ctx, w, h } = f;
  // The print holds still on the page; the hall inside it breathes (a dolly), so no zoom on the paper.
  shot(
    ctx,
    UNMOVED,
    w,
    h,
    () => {
      layPaper(ctx, w, h);
      const m = ctx.getTransform();
      const s = Math.hypot(m.a, m.b) || 1;
      const gl = glCanvas(
        'cold-studies/engraving',
        Math.round(PICTURE.w * s),
        Math.round(PICTURE.h * s),
      );
      if (gl !== undefined) {
        let r = rigs.get(gl.gl);
        if (r === undefined) {
          r = rig(gl.canvas, gl.gl);
          rigs.set(gl.gl, r);
        }
        r.renderer.setSize(gl.canvas.width, gl.canvas.height, false);
        render(r, f, s);
        ctx.drawImage(gl.canvas, PICTURE.x, PICTURE.y, PICTURE.w, PICTURE.h);
      }
      plate(ctx, PICTURE);
    },
    0,
  );
};
