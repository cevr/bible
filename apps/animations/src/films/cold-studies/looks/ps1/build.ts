// Building blocks for the ps1 world: boxes, slabs and posts whose texture
// repeats by their size (the same texel on screen for a long bench and a
// small box, as a level designer tiled them), and a mesh placed in one call.
// A slab is cut into a grid so its affine texture bends a little, not wildly:
// the console's games tessellated their floors for the same reason.

import {
  BoxGeometry,
  type BufferGeometry,
  CylinderGeometry,
  type Material,
  Mesh,
  type Object3D,
  PlaneGeometry,
} from 'three';

/** The geometry's UVs times its faces' sizes, so the texture repeats `density` times a unit. */
const repeatBy = (
  geo: BufferGeometry,
  sizes: ReadonlyArray<readonly [number, number]>,
  density: number,
) => {
  const uv = geo.getAttribute('uv');
  const perFace = uv.count / sizes.length;
  for (let i = 0; i < uv.count; i++) {
    const [w, h] = sizes[Math.floor(i / perFace)] ?? [1, 1];
    uv.setXY(i, uv.getX(i) * w * density, uv.getY(i) * h * density);
  }
  uv.needsUpdate = true;
  return geo;
};

/** A `w` × `h` × `d` box, its texture repeating `density` times a unit on every face. */
export const box = (w: number, h: number, d: number, density = 1): BufferGeometry =>
  repeatBy(
    new BoxGeometry(w, h, d),
    [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ],
    density,
  );

/** A flat `w` × `h` slab facing +z, cut into cells about `cell` units a side. */
export const slab = (w: number, h: number, density = 1, cell = 1.5): BufferGeometry =>
  repeatBy(
    new PlaneGeometry(w, h, Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(h / cell))),
    [[w, h]],
    density,
  );

/** A `w` × `h` sheet facing +z that wears its texture once, cut into cells about `cell` units a side. */
export const sheet = (w: number, h: number, cell = 0.4): BufferGeometry =>
  new PlaneGeometry(w, h, Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(h / cell)));

/** A post or a drum: `sides` faces round, its texture wrapping `around` times. */
export const post = (rTop: number, rBottom: number, h: number, sides: number, around = 1, up = 1) =>
  repeatBy(new CylinderGeometry(rTop, rBottom, h, sides), [[around, up]], 1);

/** `geo` in `mat`, at (x, y, z), added to `parent`. */
export const put = (
  parent: Object3D,
  geo: BufferGeometry,
  mat: Material,
  x: number,
  y: number,
  z: number,
): Mesh => {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
};
