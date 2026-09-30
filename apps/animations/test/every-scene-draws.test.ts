// Every scene of every registered film draws: at its first frame, at each cue's
// edges and midpoint, at its 60% point and at its last frame, through the film's own
// compositor (`createFilm(...).render`). A scene that reads a mark, a cue or a
// knob its film no longer has throws at draw time, and until now only a render
// or `film check`'s layout leg (run by hand) drew it: 4f46add3 was a `declared`
// card reading `{declared}` after the revised script removed the mark.
//
// Bun has no canvas, so the frame is drawn into a null 2D context: every call
// answers a value that reads as nothing (a number 0, an empty list, a callable
// that answers the same), except where a real canvas refuses an argument (a
// negative arc, ellipse or gradient radius, a colour stop off 0..1), where it
// throws as the real one does. Nothing is rasterised, which is the point: this
// is the draw path's logic, the part a script edit can break, run in the gate.
// A throw only between samples (say, a branch at 30% of a cue) still needs a
// render to find.
//
// Every frame is also pure: a function of its time, not of what the film drew
// before (ab75a2a1, 5da347fd). Each sampled frame is drawn after the frame
// after it, and again after the frame before it, into a context that logs
// every call; the two logs must be the same. Only what a frame asks the canvas
// to do is logged: a factory or a query (a gradient, a pattern, a measure) is
// left out, so a cache that hands back the same gradient or tile is not a
// difference; a canvas passed to a call reads as which canvas it is, any other
// object as its kind. The compositor may draw a scene twice (its framing
// guess, `sheet` in canvas/film.ts, draws again from the paper when it guessed
// wrong), so what is compared is what is left on the frame: the calls from the
// last time the paper is drawn.

import { BunServices } from '@effect/platform-bun';
import { type SceneSpec, createFilm } from '@bible/film/canvas';
import { TimingsJson, sceneMoments } from '@bible/film/core';
import { importFilmModule } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import { FILMS } from '../server.ts';
import { films } from '../src/films/index.ts';

/** Every film the player and the renderer know: the registry's keys. */
const FILM_NAMES = Object.keys(films);

/**
 * A value that stands for anything a context could answer: callable (it answers
 * itself), every property is itself, it reads as 0 in arithmetic and as an
 * empty list when spread, and writes to it are dropped.
 */
function none(): void {}
const nothing: typeof none = new Proxy(none, {
  get: (_target, key) => {
    if (key === Symbol.toPrimitive) return () => 0;
    if (key === Symbol.iterator) return function* () {};
    if (key === 'length') return 0;
    return nothing;
  },
  apply: () => nothing,
  construct: () => nothing,
  set: () => true,
});

/**
 * What a real canvas does with an argument it refuses: throws an
 * IndexSizeError out of the draw. Here the same defect, raised synchronously.
 */
const refuseWhen = (bad: boolean, what: string) => {
  if (bad) Effect.runSync(Effect.die(new RangeError(`IndexSizeError: ${what}`)));
};

/** A gradient that refuses a colour stop off 0..1, as a real one does. */
const nullGradient = () => ({
  addColorStop: (offset: number) =>
    refuseWhen(!(offset >= 0 && offset <= 1), `addColorStop offset ${offset}`),
});

/**
 * The context calls whose arguments a real canvas checks and throws on,
 * checked the same way; everything else answers `nothing`.
 */
const checked = {
  arc: (_x = 0, _y = 0, r = 0) => refuseWhen(r < 0, `arc radius ${r}`),
  ellipse: (_x = 0, _y = 0, rx = 0, ry = 0) =>
    refuseWhen(rx < 0 || ry < 0, `ellipse radii ${rx}, ${ry}`),
  arcTo: (_x1 = 0, _y1 = 0, _x2 = 0, _y2 = 0, r = 0) => refuseWhen(r < 0, `arcTo radius ${r}`),
  createRadialGradient: (_x0 = 0, _y0 = 0, r0 = 0, _x1 = 0, _y1 = 0, r1 = 0) => {
    refuseWhen(r0 < 0 || r1 < 0, `radial gradient radii ${r0}, ${r1}`);
    return nullGradient();
  },
  createLinearGradient: () => nullGradient(),
  createConicGradient: () => nullGradient(),
};

/** A 2D context that draws nothing: its state properties hold what is set, every method answers `nothing`. */
const nullContext = (): CanvasRenderingContext2D => {
  const state = new Map<PropertyKey, unknown>();
  const ctx = new Proxy(
    {},
    {
      get: (_target, key) => {
        if (Object.hasOwn(checked, key)) return Reflect.get(checked, key);
        if (key === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        if (key === 'measureText')
          return (text: string) => ({
            width: text.length * 10,
            actualBoundingBoxAscent: 8,
            actualBoundingBoxDescent: 2,
          });
        if (key === 'getImageData' || key === 'createImageData')
          return (_x: number, _y: number, w = 1, h = 1) => ({
            data: new Uint8ClampedArray(Math.max(1, w * h) * 4),
          });
        if (state.has(key)) return state.get(key);
        return nothing;
      },
      set: (_target, key, value) => {
        state.set(key, value);
        return true;
      },
    },
  );
  return Schema.decodeSync(Schema.Any)(ctx);
};

/** What a frame asks of its context and never paints: factories and queries. */
const UNLOGGED: ReadonlySet<PropertyKey> = new Set([
  'createLinearGradient',
  'createRadialGradient',
  'createConicGradient',
  'createPattern',
  'createImageData',
  'getImageData',
  'getTransform',
  'measureText',
  'isPointInPath',
  'isPointInStroke',
  'getLineDash',
]);

/** A call or a property set: its name, and its arguments as `kept`. */
type Call = readonly [name: PropertyKey, args: ReadonlyArray<unknown>];

/** Arguments as the log keeps them: a canvas by its number, another object as its kind, anything else itself. */
const kept = (args: ReadonlyArray<unknown>): ReadonlyArray<unknown> =>
  args.map((v) => {
    if (Predicate.isFunction(v)) return '<function>';
    if (!Predicate.isObject(v)) return v;
    return Option.match(Option.fromUndefinedOr(canvases.get(v)), {
      onNone: () => '<object>',
      onSome: (n) => `<canvas ${n}>`,
    });
  });

/** The paper: a full-frame image drawn at 0, 0 (`drawImage(canvas, 0, 0)`). */
const atOrigin = (key: PropertyKey, args: ReadonlyArray<unknown>) =>
  key === 'drawImage' && args.length === 3 && args[1] === 0 && args[2] === 0;

/**
 * What is left on a frame, as the calls from the last time its paper (the
 * first image it draws at 0, 0) is drawn: a draw the compositor threw away
 * and drew again from the paper is gone. `onCall` sees each call; `fresh`
 * starts over at each paper.
 */
const loggingInto = (
  inner: CanvasRenderingContext2D,
  onCall: (key: PropertyKey, args: ReadonlyArray<unknown>) => void,
  fresh: () => void,
) => {
  let paper = Option.none<unknown>();
  const call = (key: PropertyKey, args: ReadonlyArray<unknown>) => {
    if (atOrigin(key, args)) {
      if (Option.isNone(paper)) paper = Option.some(args[0]);
      if (Option.contains(paper, args[0])) fresh();
    }
    onCall(key, args);
  };
  return new Proxy(inner, {
    get: (target, key) => {
      const value: unknown = Reflect.get(target, key);
      if (!Predicate.isFunction(value) || UNLOGGED.has(key)) return value;
      return (...args: ReadonlyArray<unknown>) => {
        call(key, args);
        return Reflect.apply(value, target, args);
      };
    },
    set: (target, key, value) => {
      call(key, [value]);
      return Reflect.set(target, key, value);
    },
  });
};

/** Scratch for hashing a number by its bits. */
const bits = new Float64Array(1);
const words = new Uint32Array(bits.buffer);

/** FNV-1a over a string, onto `h`. */
const hashText = (h: number, text: string) => {
  let out = h;
  for (let i = 0; i < text.length; i++) out = Math.imul(out ^ text.charCodeAt(i), 16777619);
  return out;
};

/** A hash of what a frame at `T` leaves on it, and how many calls that is: cheap, for every sample. */
const fingerprintAt = (film: ReturnType<typeof createFilm>, T: number) => {
  let hash = 2166136261;
  let calls = 0;
  const ctx = loggingInto(
    nullContext(),
    (key, args) => {
      calls += 1;
      hash = hashText(hash, String(key));
      for (const v of kept(args)) {
        if (Predicate.isNumber(v)) {
          bits[0] = v;
          hash = Math.imul(hash ^ (words[0] ?? 0), 16777619);
          hash = Math.imul(hash ^ (words[1] ?? 0), 16777619);
        } else hash = hashText(hash, String(v));
      }
    },
    () => {
      hash = 2166136261;
      calls = 0;
    },
  );
  film.render(ctx, T, { captions: true });
  return `${calls}:${hash >>> 0}`;
};

/** What a frame at `T` leaves on it, call by call: to name the first difference once one is found. */
const callsAt = (film: ReturnType<typeof createFilm>, T: number): ReadonlyArray<Call> => {
  const log: Call[] = [];
  const ctx = loggingInto(
    nullContext(),
    (key, args) => log.push([key, kept(args)]),
    () => {
      log.length = 0;
    },
  );
  film.render(ctx, T, { captions: true });
  return log;
};

/** Whether two logs make the same call at `k`. */
const sameAt = (a: ReadonlyArray<Call>, b: ReadonlyArray<Call>, k: number) =>
  Option.exists(
    Option.all([Option.fromUndefinedOr(a[k]), Option.fromUndefinedOr(b[k])]),
    ([x, y]) =>
      x[0] === y[0] && x[1].length === y[1].length && x[1].every((v, i) => Object.is(v, y[1][i])),
  );

/** A log's call at `k`, as written. */
const shownAt = (log: ReadonlyArray<Call>, k: number) =>
  Option.match(Option.fromUndefinedOr(log[k]), {
    onNone: () => 'nothing',
    onSome: ([name, args]) => `${String(name)}(${args.map(String).join(', ')})`,
  });

/** Frame `frame` drawn after the next frame, then after the one before: what each left, by `at`. */
const bothWays = <A>(
  film: ReturnType<typeof createFilm>,
  frame: number,
  at: (film: ReturnType<typeof createFilm>, T: number) => A,
) => {
  const T = (f: number) => f / film.fps;
  film.render(nullContext(), T(frame + 1), { captions: true });
  const afterNext = at(film, T(frame));
  film.render(nullContext(), T(Math.max(0, frame - 1)), { captions: true });
  const afterBefore = at(film, T(frame));
  return { afterNext, afterBefore };
};

/**
 * Where frame `frame` is not pure: drawn after the next frame, then after the
 * one before, what is left on it differs; the first call that differs.
 */
const impureAt = (film: ReturnType<typeof createFilm>, frame: number): Option.Option<string> => {
  const quick = bothWays(film, frame, fingerprintAt);
  if (quick.afterNext === quick.afterBefore) return Option.none();
  const { afterNext, afterBefore } = bothWays(film, frame, callsAt);
  const length = Math.max(afterNext.length, afterBefore.length);
  const first = Array.from({ length }, (_, k) => k).find((k) => !sameAt(afterNext, afterBefore, k));
  return Option.some(
    Option.match(Option.fromUndefinedOr(first), {
      onNone: () =>
        `its calls hash ${quick.afterNext} after the next frame, ${quick.afterBefore} after the one before`,
      onSome: (k) =>
        `call ${k}: ${shownAt(afterNext, k)} after the next frame, ${shownAt(afterBefore, k)} after the one before`,
    }),
  );
};

/** Each canvas made off the page, numbered as it is made, so a log can tell them apart. */
const canvases = new WeakMap<object, number>();
let made = 0;

/** A canvas element that draws nothing, for the compositor's paper, grain and transition layers. */
const nullCanvas = () => {
  const canvas = { width: 0, height: 0, getContext: () => nullContext() };
  made += 1;
  canvases.set(canvas, made);
  return canvas;
};

/**
 * The DOM the compositor reaches for (`document.createElement('canvas')`,
 * `DOMMatrix` for a pattern's offset), installed for one test and removed after.
 */
const nullDom = Effect.acquireRelease(
  Effect.sync(() => {
    const before = {
      document: Reflect.get(globalThis, 'document'),
      matrix: Reflect.get(globalThis, 'DOMMatrix'),
    };
    Reflect.set(globalThis, 'document', { createElement: nullCanvas });
    Reflect.set(globalThis, 'DOMMatrix', function DOMMatrix() {
      return nothing;
    });
    return before;
  }),
  (before) =>
    Effect.sync(() => {
      Reflect.set(globalThis, 'document', before.document);
      Reflect.set(globalThis, 'DOMMatrix', before.matrix);
    }),
);

const ScenesModule = Schema.Struct({ scenes: Schema.Array(Schema.Any) });

/** A film's scenes and committed timings, read as the player reads them. */
const filmOf = Effect.fn('test.filmOf')(function* (film: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const module = yield* Effect.promise(() =>
    importFilmModule(path.join(FILMS, film, 'scenes', 'index.ts')),
  );
  const scenes: ReadonlyArray<SceneSpec> = (yield* Schema.decodeUnknownEffect(ScenesModule)(module))
    .scenes;
  const timings = yield* Schema.decodeEffect(TimingsJson)(
    yield* fs.readFileString(path.join(FILMS, film, 'narration', 'timings.json')),
  );
  return createFilm({
    title: film,
    paper: { base: '#fff', tone: '#000', seed: 1 },
    shade: '#000',
    scenes,
    timings,
    captions: { font: '38px x', color: '#000', plate: '#fff' },
  });
});

/** Why a frame failed to draw, or none. */
const drawAt = (film: ReturnType<typeof createFilm>, T: number) =>
  Effect.sync(() => film.render(nullContext(), T, { captions: true })).pipe(
    Effect.as(Option.none<string>()),
    Effect.catchDefect((defect) => Effect.succeedSome(String(defect))),
  );

describe('every scene draws', () => {
  for (const name of FILM_NAMES)
    it.effect.layer(BunServices.layer)(
      `${name}: every scene at its start, each cue's edges and midpoint, its 60% point and its end`,
      () =>
        Effect.gen(function* () {
          yield* nullDom;
          const film = yield* filmOf(name);
          const fps = film.fps;
          const edges = film.placed.flatMap((p) => {
            const first = Math.ceil(p.start * fps - 1e-6);
            const last = Math.ceil((p.start + p.dur) * fps - 1e-6) - 1;
            // Mid-span, where a branch on `0 < f.at(cue) < 1` draws and neither edge does.
            const mids = [...p.cues]
              .filter(([, c]) => c.end > c.start)
              .map(([cue, c]) => ({
                scene: p.spec.id,
                at: `cue ${cue} mid`,
                frame: Math.min(
                  last,
                  Math.max(first, Math.round((p.start + (c.start + c.end) / 2) * fps)),
                ),
              }));
            return [
              { scene: p.spec.id, at: 'start', frame: first },
              { scene: p.spec.id, at: 'end', frame: last },
              ...mids,
            ];
          });
          const moments = [...sceneMoments(film.placed, fps, { marks: false }), ...edges];
          const failures: string[] = [];
          for (const m of moments) {
            const failed = yield* drawAt(film, m.frame / fps);
            if (Option.isSome(failed))
              failures.push(`${m.scene} (${m.at}, frame ${m.frame}): ${failed.value}`);
          }
          expect(moments.length).toBeGreaterThan(film.placed.length * 3);
          expect(failures).toEqual([]);
        }).pipe(Effect.scoped),
      30_000,
    );
});

describe('every frame is pure', () => {
  it.effect('a frame that reads the frame drawn before it is caught', () =>
    Effect.gen(function* () {
      yield* nullDom;
      const filmOfOne = (draw: SceneSpec['draw']) =>
        createFilm({
          title: 'purity',
          paper: { base: '#fff', tone: '#000', seed: 1 },
          shade: '#000',
          scenes: [{ id: 'one', min: 4, draw }],
          captions: { font: '38px x', color: '#000', plate: '#fff' },
        });
      // The last frame drawn kept in a module `let`, as a scene that eases from it would.
      let last = 0;
      const impure = filmOfOne((f) => {
        f.ctx.fillRect(last, 0, 10, 10);
        last = f.t;
      });
      expect(Option.isSome(impureAt(impure, 30))).toBe(true);
      // The same square placed by its own time is pure.
      const pure = filmOfOne((f) => f.ctx.fillRect(f.t, 0, 10, 10));
      expect(impureAt(pure, 30)).toEqual(Option.none());
    }).pipe(Effect.scoped),
  );

  for (const name of FILM_NAMES)
    it.effect.layer(BunServices.layer)(
      `${name}: every sampled frame draws the same after the frame after it and the frame before it`,
      () =>
        Effect.gen(function* () {
          yield* nullDom;
          const film = yield* filmOf(name);
          // Where a cue starts, and each scene's 60% point: a sample, as a
          // frame here costs four draws.
          const moments = sceneMoments(film.placed, film.fps, { marks: false }).filter(
            (m) => m.at.includes('start') || m.at.includes('60%'),
          );
          const impure = moments.flatMap((m) =>
            Option.toArray(
              Option.map(impureAt(film, m.frame), (why) => `${m.scene} (${m.at}): ${why}`),
            ),
          );
          expect(moments.length).toBeGreaterThan(film.placed.length);
          expect(impure).toEqual([]);
        }).pipe(Effect.scoped),
      120_000,
    );
});
