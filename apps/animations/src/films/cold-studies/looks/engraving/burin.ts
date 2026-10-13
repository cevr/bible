// The burin as a material: the shader (`shader.ts`) with the hall's light
// shared by every surface and each surface's own cut: how pale its stuff
// is, how its lines are laid on it, its masonry joints, a hand-tinted wash.

import {
  DoubleSide,
  FrontSide,
  Matrix4,
  ShaderMaterial,
  type Texture,
  Vector3,
  Vector4,
} from 'three';
import { FRAGMENT, VERTEX } from './shader.ts';

/** The shadow map, set once the rig has made it. */
const unmade = (): Texture | null => null;

/** The hall's light, one set of uniforms every surface reads (rewritten each frame). */
export const hallLight = () => ({
  uL: { value: new Vector3(0.88, -0.33, -0.36).normalize() },
  uWin: { value: new Vector4(-7, -3, 5.6, 1.1) },
  uWinH: { value: 1.3 },
  uL2: { value: new Vector3(0, -1, 1).normalize() },
  uRose: { value: new Vector4(-9.45, 2.5, 7.4, 1.15) },
  uRoseOn: { value: 0 },
  uRoseTurn: { value: 0 },
  uShadow: { value: unmade() },
  uLightMat: { value: new Matrix4() },
  uShadowTexel: { value: 1 / 2048 },
  uPool: { value: new Vector3(-0.9, 0.5, -2.6) },
  uPeriod: { value: 6 },
  uAir: { value: 0.15 },
  uKey: { value: 1.5 },
  uFill: { value: 0.55 },
});

export type HallLight = ReturnType<typeof hallLight>;

/** How a surface is cut. */
export interface Cut {
  /** How pale its stuff is, 0 black to 1 white, before the light. */
  readonly albedo: number;
  /** 0 a block's faces, 2 a body turned about its y, 5 the mesh's own lines. */
  readonly mode?: 0 | 2 | 5;
  /** The first family's turn in the surface's (u, s), radians. */
  readonly rot?: number;
  /** The second family's turn from the first. */
  readonly cross?: number;
  /** A turned body's radius, for its lines along it. */
  readonly radius?: number;
  /** The coarsest spacing of its lines, metres. */
  readonly spacing?: number;
  /** Masonry: course height, block length, strength. */
  readonly joints?: readonly [number, number, number];
  /** A hand-tinted wash: colour (0..1), strength, where on the body and how wide. */
  readonly tint?: {
    readonly rgb: readonly [number, number, number];
    readonly amount: number;
    readonly at: readonly [number, number, number];
    readonly r: number;
  };
  readonly dark?: number;
  readonly rim?: number;
  /** The windows' wall: its lights drawn as light. */
  readonly glow?: boolean;
  readonly seed?: number;
  readonly both?: boolean;
}

/** A surface's material: the shared light and its own cut. */
export const burin = (light: HallLight, cut: Cut): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: cut.both === true ? DoubleSide : FrontSide,
    uniforms: {
      ...light,
      uAlbedo: { value: cut.albedo },
      uMode: { value: cut.mode ?? 0 },
      uRot: { value: cut.rot ?? 0 },
      uCross: { value: cut.cross ?? 1.2 },
      uRadius: { value: cut.radius ?? 0.3 },
      uSpacing: { value: cut.spacing ?? 0.08 },
      uJoints: { value: new Vector3(...(cut.joints ?? [1, 1, 0])) },
      uTint: {
        value: new Vector4(...(cut.tint?.rgb ?? [0, 0, 0]), cut.tint?.amount ?? 0),
      },
      uTintAt: { value: new Vector4(...(cut.tint?.at ?? [0, 0, 0]), cut.tint?.r ?? 1) },
      uDark: { value: cut.dark ?? 0 },
      uRim: { value: cut.rim ?? 0 },
      uGlow: { value: cut.glow === true ? 1 : 0 },
      uSeed: { value: cut.seed ?? 0 },
    },
  });
