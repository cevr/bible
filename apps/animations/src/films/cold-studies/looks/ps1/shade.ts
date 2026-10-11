// The console's rasteriser, as one three.js material. Every surface in the
// ps1 world draws through it, so the whole frame has the same faults the
// hardware had:
//
// - each vertex snapped to the low-res pixel grid after projection (the
//   wobble as the camera drifts);
// - textures mapped affinely: the UVs are interpolated in screen space, not
//   corrected for depth, so a near polygon's texture swims and bends;
// - light computed at the vertices only (Gouraud): an ambient, one sun and
//   one gold point light, the verdict's;
// - fog per vertex, to the background's colour;
// - every pixel dithered with a 4 × 4 ordered (Bayer) matrix and cut to
//   15-bit colour (5 bits a channel).
//
// Colours stay in the console's own space: sRGB numbers in, sRGB numbers out,
// no linear light and no tone mapping (a `Vec3` from `rgb`, never a three.js
// `Color`, which would convert them).

import { DoubleSide, FrontSide, ShaderMaterial, type Texture, Vector2, Vector3 } from 'three';

/** `#rrggbb` as the shader's 0–1 channels, unconverted. */
export const rgb = (hex: string): Vector3 => {
  const n = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** One value a shader reads, shared by every material that holds the same object. */
interface Uniform<T> {
  value: T;
}

/** The light and fog every material in one world reads: set once a frame, before it renders. */
export interface World {
  readonly res: Uniform<Vector2>;
  readonly ambient: Uniform<Vector3>;
  readonly sunDir: Uniform<Vector3>;
  readonly sunColor: Uniform<Vector3>;
  readonly glowPos: Uniform<Vector3>;
  readonly glowColor: Uniform<Vector3>;
  readonly glowRange: Uniform<number>;
  readonly fogColor: Uniform<Vector3>;
  readonly fogNear: Uniform<number>;
  readonly fogFar: Uniform<number>;
}

export const world = (w: number, h: number): World => ({
  res: { value: new Vector2(w, h) },
  ambient: { value: new Vector3(0.5, 0.5, 0.5) },
  sunDir: { value: new Vector3(0.3, 0.8, 0.5).normalize() },
  sunColor: { value: new Vector3(0.5, 0.5, 0.5) },
  glowPos: { value: new Vector3() },
  glowColor: { value: new Vector3() },
  glowRange: { value: 1 },
  fogColor: { value: new Vector3(0.7, 0.7, 0.7) },
  fogNear: { value: 10 },
  fogFar: { value: 40 },
});

const VERTEX = /* glsl */ `
uniform vec2 res;
uniform vec3 ambient;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform vec3 glowPos;
uniform vec3 glowColor;
uniform float glowRange;
uniform float fogNear;
uniform float fogFar;
uniform float emissive;
uniform float snap;
out vec3 vUvw;
out vec3 vLight;
out float vFog;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vec4 view = viewMatrix * world;
  vec4 clip = projectionMatrix * view;
  if (clip.w > 0.0) {
    vec2 grid = res * 0.5 / snap;
    clip.xy = floor(clip.xy / clip.w * grid + 0.5) / grid * clip.w;
  }
  gl_Position = clip;
  vec3 n = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  float sun = max(dot(n, sunDir), 0.0);
  vec3 toGlow = glowPos - world.xyz;
  float far = length(toGlow);
  float glow = max(dot(n, toGlow / max(far, 1e-4)), 0.0) * clamp(1.0 - far / glowRange, 0.0, 1.0);
  vec3 lit = ambient + sunColor * sun + glowColor * glow;
  vLight = mix(lit, vec3(1.0), emissive);
  vFog = clamp((-view.z - fogNear) / (fogFar - fogNear), 0.0, 1.0) * (1.0 - emissive * 0.5);
  // Affine: the UVs times w, divided back per pixel, so the hardware's
  // perspective correction cancels out.
  vUvw = vec3(uv * clip.w, clip.w);
}
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float hasMap;
uniform vec3 tint;
uniform vec3 fogColor;
in vec3 vUvw;
in vec3 vLight;
in float vFog;
const float BAYER[16] = float[16](
  0.0, 8.0, 2.0, 10.0,
  12.0, 4.0, 14.0, 6.0,
  3.0, 11.0, 1.0, 9.0,
  15.0, 7.0, 13.0, 5.0
);
void main() {
  vec2 uv = vUvw.xy / vUvw.z;
  vec4 tex = hasMap > 0.5 ? texture(map, uv) : vec4(1.0);
  if (tex.a < 0.5) discard;
  vec3 c = tex.rgb * tint * vLight;
  c = mix(c, fogColor, vFog);
  ivec2 p = ivec2(gl_FragCoord.xy) % 4;
  float threshold = (BAYER[p.y * 4 + p.x] + 0.5) / 16.0;
  c = floor(clamp(c, 0.0, 1.0) * 31.0 + threshold) / 31.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

/** How one surface draws: its texture (none: flat), its colour over it, and whether it gives light. */
export interface Paint {
  readonly map?: Texture;
  readonly tint?: string;
  /** 0 lit by the room to 1 its own light (a window, gold). */
  readonly emissive?: number;
  /** Both faces drawn (a page, a card). */
  readonly double?: boolean;
  /** The snapping grid's coarseness in low-res pixels: 1 the console's, 2 coarser still. */
  readonly snap?: number;
}

/** A material that reads `w`'s light and fog, painted `p`. */
export const ps1 = (w: World, p: Paint): ShaderMaterial =>
  new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: p.double === true ? DoubleSide : FrontSide,
    uniforms: {
      ...w,
      map: { value: p.map ?? null },
      hasMap: { value: p.map === undefined ? 0 : 1 },
      tint: { value: rgb(p.tint ?? '#ffffff') },
      emissive: { value: p.emissive ?? 0 },
      snap: { value: p.snap ?? 1 },
    },
  });
