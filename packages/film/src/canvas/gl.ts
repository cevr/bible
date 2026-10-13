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
// last asked for; a few contexts are kept live at once (`KEPT`, 8), the
// longest unused one let go past that, so a long lab session stays under the
// browser's cap on live contexts. The budget is the page's, not the keys':
// the canvases a Rive rig draws on (`canvas/rive.ts`) are held in it too
// (`holdGl`), and let go when their rig is (`dropGl`).
//
// So a frame asks for at most 8 contexts, its look's keys and its webgl2
// rigs' targets together, and a look composites a canvas into the frame
// (`drawImage`) before it asks for another key, or for the same key at
// another size: the ninth context lets the first go, and a new size clears
// the canvas, so a canvas held across either may be blank when it is drawn.

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

/** Each key's canvas: live, or let go by the budget (its context lost) and made anew when asked. */
const made = new Map<string, Gl>();

/** Every live context the page keeps (each key's, each rig's), by its canvas, the most recently used last. */
const live = new Map<HTMLCanvasElement, WebGL2RenderingContext>();

/** Whether `v` is a WebGL 2 context: a stand-in answers another kind with none. */
const isGl2 = (v: unknown): v is WebGL2RenderingContext =>
  v !== null && v !== undefined && Reflect.has(Object(v), 'createVertexArray');

/** Let `gl` go: its context released now, not when the collector gets to it. */
const release = (gl: WebGL2RenderingContext) => {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
};

/**
 * Hold `canvas`'s context `gl` live, as the most recently used: past `KEPT`
 * the longest unused context (a key's or a rig's) is let go, and its holder
 * finds it lost (`isContextLost`) and makes it anew when next it draws.
 */
export const holdGl = (canvas: HTMLCanvasElement, gl: WebGL2RenderingContext): void => {
  live.delete(canvas);
  live.set(canvas, gl);
  for (const [old, kept] of live) {
    if (live.size <= KEPT) break;
    live.delete(old);
    release(kept);
  }
};

/** Let `canvas`'s context go now (its holder is done with it). */
export const dropGl = (canvas: HTMLCanvasElement): void => {
  const gl = live.get(canvas);
  live.delete(canvas);
  if (gl !== undefined) release(gl);
};

/**
 * The WebGL 2 canvas `key` at `width` × `height`: the one kept for it while
 * its context lives at that size, else made now (the old one let go); none
 * where no WebGL 2 context can be made.
 */
export const glCanvas = (key: string, width: number, height: number): Gl | undefined => {
  const have = made.get(key);
  if (have !== undefined) {
    const fits = have.canvas.width === width && have.canvas.height === height;
    if (fits && !have.gl.isContextLost()) {
      holdGl(have.canvas, have.gl);
      return have;
    }
    made.delete(key);
    dropGl(have.canvas);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const gl = canvas.getContext('webgl2', ATTRIBUTES);
  if (!isGl2(gl)) return undefined;
  const one = { canvas, gl };
  made.set(key, one);
  holdGl(canvas, gl);
  return one;
};
