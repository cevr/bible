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

import { BunServices } from '@effect/platform-bun';
import { type SceneSpec, createFilm } from '@bible/film/canvas';
import { TimingsJson, sceneMoments } from '@bible/film/core';
import { importFilmModule } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Schema } from 'effect';
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

/** A canvas element that draws nothing, for the compositor's paper, grain and transition layers. */
const nullCanvas = () => ({ width: 0, height: 0, getContext: () => nullContext() });

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
    Effect.catchDefect((defect) => Effect.succeed(Option.some(String(defect)))),
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
