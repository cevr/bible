// A camera over a scene's world: (x, y) is the world point at frame centre.

export interface Camera {
  x: number;
  y: number;
  zoom?: number;
  rot?: number;
}

export const camera = (
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  w: number,
  h: number,
  draw: () => void,
) => {
  ctx.save();
  ctx.translate(w / 2, h / 2);
  if (cam.rot !== undefined) ctx.rotate(cam.rot);
  const z = cam.zoom ?? 1;
  ctx.scale(z, z);
  ctx.translate(-cam.x, -cam.y);
  draw();
  ctx.restore();
};
