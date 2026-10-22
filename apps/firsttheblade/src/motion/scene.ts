/**
 * The stills set moving: the field's wind and light, and the night's stars
 * (`./shaders.ts`), each a WebGL2 canvas laid over its picture. Loaded only
 * when the reader has not asked for less motion (`../client.tsx`).
 *
 * The canvas shows once its first frame is drawn, and its first frame is the
 * still itself, so the picture never jumps. It draws only while it is on the
 * screen and the tab is shown; its time stands still between. When the
 * reader asks for less motion, every canvas is taken away and the stills
 * stay. A browser with no WebGL2, or a shader it cannot build, keeps the
 * still.
 */
import { Data, Effect } from 'effect';

import fieldWind from '../art/field-wind.png';
import { coverMap, positionOf } from './cover.ts';
import { FIELD_FRAGMENT, NIGHT_FRAGMENT, VERTEX } from './shaders.ts';

/** How long the motion takes to grow in from the still, in seconds. */
const RAMP = 2.5;
/** The most pixels a canvas draws per CSS pixel. */
const MOST_DENSITY = 2;
/** The longest step one frame advances the time by, in seconds, so a stalled frame does not jump. */
const LONGEST_STEP = 0.05;

class Unmoved extends Data.TaggedError('Unmoved')<{ readonly reason: string }> {}

/** A still and how it moves: its shader, the maps the shader reads beside the still (`u_wind`), and whether the still is read at smaller sizes too. */
interface Kind {
  readonly selector: string;
  readonly fragment: string;
  readonly maps: ReadonlyArray<string>;
  readonly mipmaps: boolean;
}

const KINDS: ReadonlyArray<Kind> = [
  { selector: 'img.field-art', fragment: FIELD_FRAGMENT, maps: [fieldWind], mipmaps: false },
  { selector: 'img.night-art', fragment: NIGHT_FRAGMENT, maps: [], mipmaps: true },
];

const decoded = (picture: HTMLImageElement) =>
  Effect.tryPromise({
    try: () => picture.decode(),
    catch: () => new Unmoved({ reason: 'the picture did not decode' }),
  });

const loaded = (src: string) =>
  Effect.suspend(() => {
    const picture = new Image();
    picture.src = src;
    return decoded(picture).pipe(Effect.as(picture));
  });

const shader = (gl: WebGL2RenderingContext, type: number, source: string) =>
  Effect.suspend(() => {
    const made = gl.createShader(type);
    if (!made) return Effect.fail(new Unmoved({ reason: 'no shader' }));
    gl.shaderSource(made, source);
    gl.compileShader(made);
    if (gl.getShaderParameter(made, gl.COMPILE_STATUS) !== true)
      return Effect.fail(new Unmoved({ reason: `shader: ${gl.getShaderInfoLog(made)}` }));
    return Effect.succeed(made);
  });

const program = Effect.fn('Motion.program')(function* (
  gl: WebGL2RenderingContext,
  fragment: string,
) {
  const made = yield* Effect.fromNullishOr(gl.createProgram()).pipe(
    Effect.mapError(() => new Unmoved({ reason: 'no program' })),
  );
  gl.attachShader(made, yield* shader(gl, gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(made, yield* shader(gl, gl.FRAGMENT_SHADER, fragment));
  gl.linkProgram(made);
  if (gl.getProgramParameter(made, gl.LINK_STATUS) !== true)
    return yield* new Unmoved({ reason: `program: ${gl.getProgramInfoLog(made)}` });
  gl.useProgram(made);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const at = gl.getAttribLocation(made, 'a_position');
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0);
  return made;
});

/** A texture on its own unit, bound there for the context's life: `upload` puts a picture in it, the same texture each time. */
const texture = (gl: WebGL2RenderingContext, unit: number, mipmaps: boolean) => {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  if (mipmaps) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  return {
    upload: (picture: HTMLImageElement) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, picture);
      if (mipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    },
  };
};

/** The canvas's WebGL2 context, given back to the browser when the scene ends rather than left for the collector. */
const context = (canvas: HTMLCanvasElement) =>
  Effect.acquireRelease(
    Effect.fromNullishOr(
      canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false }),
    ).pipe(Effect.mapError(() => new Unmoved({ reason: 'no WebGL2' }))),
    (gl) => Effect.sync(() => gl.getExtension('WEBGL_lose_context')?.loseContext()),
  );

/** The canvas, laid over its picture as the picture's next sibling, and taken away when the scene ends. */
const overlay = (picture: HTMLImageElement) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const canvas = document.createElement('canvas');
      canvas.className = 'motion';
      canvas.setAttribute('aria-hidden', 'true');
      picture.after(canvas);
      return canvas;
    }),
    (canvas) => Effect.sync(() => canvas.remove()),
  );

/** A listener added for the scene's life. */
const listening = <T extends EventTarget>(target: T, type: string, listener: () => void) =>
  Effect.acquireRelease(
    Effect.sync(() => target.addEventListener(type, listener)),
    () => Effect.sync(() => target.removeEventListener(type, listener)),
  );

/** The frame loop's state: whether it may draw, how far its time has come, and the last frame's time (the frame clock's, or -1 when it has just started or resumed). */
interface Clock {
  seen: boolean;
  time: number;
  last: number;
  frame: number;
}

/** One still, moving until the scene's scope closes or its context is lost. */
const scene = Effect.fn('Motion.scene')(function* (picture: HTMLImageElement, kind: Kind) {
  yield* decoded(picture);
  const maps = yield* Effect.forEach(kind.maps, loaded);
  const canvas = yield* overlay(picture);
  const gl = yield* context(canvas);
  const made = yield* program(gl, kind.fragment);
  const still = texture(gl, 0, kind.mipmaps);
  still.upload(picture);
  gl.uniform1i(gl.getUniformLocation(made, 'u_still'), 0);
  maps.forEach((map, n) => {
    texture(gl, 1 + n, false).upload(map);
    gl.uniform1i(gl.getUniformLocation(made, 'u_wind'), 1 + n);
  });
  const uMap = gl.getUniformLocation(made, 'u_map');
  const uTime = gl.getUniformLocation(made, 'u_time');
  const uRamp = gl.getUniformLocation(made, 'u_ramp');

  const fit = () => {
    const box = picture.getBoundingClientRect();
    const density = Math.min(MOST_DENSITY, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(box.width * density));
    canvas.height = Math.max(1, Math.round(box.height * density));
    gl.viewport(0, 0, canvas.width, canvas.height);
    const map = coverMap(
      box,
      { width: picture.naturalWidth, height: picture.naturalHeight },
      positionOf(getComputedStyle(picture).objectPosition),
    );
    gl.uniform4f(uMap, map[0], map[1], map[2], map[3]);
  };
  const clock: Clock = { seen: false, time: 0, last: -1, frame: 0 };
  const draw = () => {
    const grown = Math.min(1, clock.time / RAMP);
    gl.uniform1f(uTime, clock.time);
    gl.uniform1f(uRamp, grown * grown * (3 - 2 * grown));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
  const tick = (now: number) => {
    if (clock.last >= 0)
      clock.time += Math.min(LONGEST_STEP, Math.max(0, (now - clock.last) / 1000));
    clock.last = now;
    draw();
    clock.frame = requestAnimationFrame(tick);
  };
  const playing = () => clock.seen && document.visibilityState === 'visible';
  const update = () => {
    cancelAnimationFrame(clock.frame);
    if (!playing()) return;
    clock.last = -1;
    clock.frame = requestAnimationFrame(tick);
  };
  yield* Effect.acquireRelease(Effect.void, () =>
    Effect.sync(() => cancelAnimationFrame(clock.frame)),
  );

  fit();
  draw();
  canvas.classList.add('motion-on');

  yield* Effect.acquireRelease(
    Effect.sync(() => {
      const sized = new ResizeObserver(() => {
        fit();
        draw();
      });
      sized.observe(picture);
      const seen = new IntersectionObserver((entries) => {
        clock.seen = entries.some((entry) => entry.isIntersecting);
        update();
      });
      seen.observe(canvas);
      return [sized, seen] as const;
    }),
    (observers) => Effect.sync(() => observers.forEach((observer) => observer.disconnect())),
  );
  yield* listening(document, 'visibilitychange', update);
  // A wider box can have the picture fetch a larger file: the canvas reads it too, into the same texture.
  yield* listening(picture, 'load', () => {
    still.upload(picture);
    draw();
  });
  // A lost context ends the scene: the canvas is taken away and the still shows.
  yield* Effect.callback<void>((resume) => {
    canvas.addEventListener('webglcontextlost', () => resume(Effect.void), { once: true });
  });
});

/** Waits until the reader asks for less motion (the query `../client.tsx` matched). */
const lessMotion = (query: MediaQueryList) =>
  Effect.callback<void>((resume) => {
    const changed = () => {
      if (query.matches) resume(Effect.void);
    };
    query.addEventListener('change', changed);
    return Effect.sync(() => query.removeEventListener('change', changed));
  });

/** Every still on the page set moving, until the reader asks for less motion: `less` is the query for it, matched by the caller (`./query.ts`). */
export const moveTheStills = (less: MediaQueryList) =>
  Effect.suspend(() => {
    if (less.matches) return Effect.void;
    const scenes = KINDS.flatMap((kind) =>
      Array.from(document.querySelectorAll(kind.selector))
        .filter((found) => found instanceof HTMLImageElement)
        .map((picture) => ({ picture, kind })),
    );
    const moving = Effect.forEach(
      scenes,
      ({ picture, kind }) =>
        scene(picture, kind).pipe(
          Effect.scoped,
          Effect.catchTag('Unmoved', (unmoved) =>
            Effect.logDebug('motion.still').pipe(Effect.annotateLogs({ reason: unmoved.reason })),
          ),
        ),
      { concurrency: 4, discard: true },
    );
    return Effect.raceFirst(moving.pipe(Effect.andThen(Effect.never)), lessMotion(less));
  });
