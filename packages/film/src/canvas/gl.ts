// A WebGL 2 canvas for a look drawn in 3D: a film's kit drives it (three.js,
// in apps/animations; the engine names no 3D library) and composites it into
// the 2D frame with `drawImage`. It is made once for each key and size and
// kept, as the paper's sheets are; every frame sets the whole of its 3D scene
// from the frame's own time before it renders, so the frame stays a pure
// function of T. Where no WebGL 2 context can be made (the stand-in context
// `check --draw` and the framework's tests draw into, a browser without it)
// there is none, and the look draws its fallback instead of throwing.

/** A canvas off the page and its WebGL 2 context. */
interface Gl {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
}

/**
 * The context's attributes: no multisampling (a look sets its own edges), and
 * the drawing buffer kept until it is drawn again, so the 2D frame can take it
 * at any point of the draw.
 */
const ATTRIBUTES: WebGLContextAttributes = {
  alpha: true,
  antialias: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: true,
};

/** Each canvas made, by key and size; `null` where none could be. */
const made = new Map<string, Gl | null>();

/** Whether `v` is a WebGL 2 context: a stand-in answers another kind with none. */
const isGl2 = (v: unknown): v is WebGL2RenderingContext =>
  v !== null && v !== undefined && Reflect.has(Object(v), 'createVertexArray');

/**
 * The WebGL 2 canvas `key` at `width` × `height`, made the first time it is
 * asked for and kept; none where no WebGL 2 context can be made.
 */
export const glCanvas = (key: string, width: number, height: number): Gl | undefined => {
  const id = `${key} ${width}x${height}`;
  const have = made.get(id);
  if (have !== undefined) return have ?? undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', ATTRIBUTES);
  const one = isGl2(gl) ? { canvas, gl } : null;
  made.set(id, one);
  return one ?? undefined;
};
