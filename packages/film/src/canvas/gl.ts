// A WebGL 2 canvas for a look drawn in 3D: a film's kit drives it (three.js,
// in apps/animations; the engine names no 3D library) and composites it into
// the 2D frame with `drawImage`. It is made once for each key and kept, as the
// paper's sheets are; every frame sets the whole of its 3D scene from the
// frame's own time before it renders, so the frame stays a pure function of T.
//
// Where no WebGL 2 context can be made (the stand-in context `check --draw`
// and the framework's tests draw into, a browser without it) there is none,
// and the look draws its fallback instead of throwing. A failure is not kept:
// the next frame asks again. A context the browser has lost is dropped and
// made anew, so a look keys whatever it builds on a context (a three.js
// renderer, its scene) by the context `glCanvas` gives, never by the key.
//
// Keys are one namespace for the whole page, which the lab and a render share
// across films: a look names its key for its film and look (`cold-studies/ps1`),
// so two films never draw into one canvas. A key holds one canvas, at the size
// last asked for; a few keys are kept live at once, the longest unused one let
// go past that, so a long lab session stays under the browser's cap on live
// contexts.

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

/** How many canvases are kept live at once: well under a browser's cap on live WebGL contexts (Chrome's is 16). */
const KEPT = 8;

/** Each live canvas, by key, the most recently used last. */
const made = new Map<string, Gl>();

/** Whether `v` is a WebGL 2 context: a stand-in answers another kind with none. */
const isGl2 = (v: unknown): v is WebGL2RenderingContext =>
  v !== null && v !== undefined && Reflect.has(Object(v), 'createVertexArray');

/** Let `one` go: its context released now, not when the collector gets to it. */
const release = (one: Gl) => {
  one.gl.getExtension('WEBGL_lose_context')?.loseContext();
};

/**
 * The WebGL 2 canvas `key` at `width` × `height`: the one kept for it while
 * its context lives at that size, else made now (the old one let go); none
 * where no WebGL 2 context can be made.
 */
export const glCanvas = (key: string, width: number, height: number): Gl | undefined => {
  const have = made.get(key);
  if (have !== undefined) {
    made.delete(key);
    const fits = have.canvas.width === width && have.canvas.height === height;
    if (fits && !have.gl.isContextLost()) {
      made.set(key, have);
      return have;
    }
    release(have);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', ATTRIBUTES);
  if (!isGl2(gl)) return undefined;
  const one = { canvas, gl };
  made.set(key, one);
  for (const [old, kept] of made) {
    if (made.size <= KEPT) break;
    made.delete(old);
    release(kept);
  }
  return one;
};
