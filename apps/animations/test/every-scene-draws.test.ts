// Every scene of every registered film draws: at its first frame, at each cue's
// edges and midpoint, at its 60% point and at its last frame, as its page
// builds it: the film's own `film()` (its title, paper, captions and shorts'
// styles) from its committed timings, drawn by the compositor. A scene that reads a mark, a cue or a
// knob its film no longer has throws at draw time, and until now only a render
// or `film check`'s layout leg (run by hand) drew it: 4f46add3 was a `declared`
// card reading `{declared}` after the revised script removed the mark.
//
// Bun has no canvas, so the frame is drawn into the framework's stand-in
// context (`@bible/film/stand-in`), keeping nothing: every call it does not
// track answers a value that reads as nothing, except where a real canvas
// refuses an argument (a negative arc, ellipse or gradient radius, a colour
// stop off 0..1), where it throws as the real one does. Nothing is
// rasterised, which is the point: this is the draw path's logic, the part a
// script edit can break, run in the gate. A throw only between samples (say,
// a branch at 30% of a cue) still needs a render to find.
//
// Every frame is also pure: a function of its time, not of what the film drew
// before (ab75a2a1, 5da347fd). Where a cue starts and at each scene's 60%
// point, the frame is drawn after the frame after it, and again after the
// frame before it, into a context that logs every call; the two logs must be
// the same. Those four draws are that moment's draw check too, so each moment
// is drawn by one pass over the film. Only what a frame asks the canvas to do
// is logged: a factory or a query (a gradient, a pattern, a measure) is left
// out, so a cache that hands back the same gradient or tile is not a
// difference; a canvas passed to a call reads as which canvas it is (the
// stand-in numbers each as it is made), any other object as its kind. The
// compositor may draw a scene twice (its framing guess, `sheet` in
// canvas/film.ts, draws again from the paper when it guessed wrong), so what
// is compared is what is left on the frame: the calls from the last time the
// paper is drawn.

import { BunServices } from '@effect/platform-bun';
import { type Film, type SceneSpec, createFilm } from '@bible/film/canvas';
import type { FilmModule } from '@bible/film/player';
import { TimingsJson, sceneMoments } from '@bible/film/core';
import { isStandInCanvas, recorder, standInDom } from '@bible/film/stand-in';
import { importFilmModule } from '@bible/film/tools';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, FileSystem, Option, Path, Predicate, Schema } from 'effect';
import { FILMS } from '../server.ts';
import { films } from '../src/films/index.ts';

/** Every film the player and the renderer know: the registry's keys. */
const FILM_NAMES = Object.keys(films);

/** The stand-in keeps nothing: the test asks only whether each frame draws, and what it asks. */
const BLANK = { record: false } as const;

/** A fresh stand-in context for one draw. */
const blank = () => recorder(1920, 1080, BLANK).ctx;

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
    if (isStandInCanvas(v)) return `<canvas ${v.made}>`;
    if (Predicate.isObject(v)) return '<object>';
    return v;
  });

/** The paper: a full-frame image drawn at 0, 0 (`drawImage(canvas, 0, 0)`). */
const atOrigin = (key: PropertyKey, args: ReadonlyArray<unknown>) =>
  key === 'drawImage' && args.length === 3 && args[1] === 0 && args[2] === 0;

/**
 * A stand-in context that logs what is left on a frame, as the calls from
 * the last time its paper (the first image it draws at 0, 0) is drawn: a draw
 * the compositor threw away and drew again from the paper is gone. `onCall`
 * sees each call but a factory or a query; `fresh` starts over at each paper.
 */
const logging = (
  onCall: (key: PropertyKey, args: ReadonlyArray<unknown>) => void,
  fresh: () => void,
): CanvasRenderingContext2D => {
  let paper = Option.none<unknown>();
  return recorder(1920, 1080, {
    ...BLANK,
    onCall: (key, args) => {
      if (UNLOGGED.has(key)) return;
      if (atOrigin(key, args)) {
        if (Option.isNone(paper)) paper = Option.some(args[0]);
        if (Option.contains(paper, args[0])) fresh();
      }
      onCall(key, args);
    },
  }).ctx;
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

/** Each call name's own hash, worked out once. */
const nameHashes = new Map<PropertyKey, number>();
const nameHash = (key: PropertyKey) =>
  Option.getOrElse(Option.fromUndefinedOr(nameHashes.get(key)), () => {
    const h = hashText(2166136261, String(key));
    nameHashes.set(key, h);
    return h;
  });

/** A hash of what a frame at `T` leaves on it, and how many calls that is: cheap, for every sample. */
const fingerprintAt = (film: Film, T: number) => {
  let hash = 2166136261;
  let calls = 0;
  const ctx = logging(
    (key, args) => {
      calls += 1;
      hash = Math.imul(hash ^ nameHash(key), 16777619);
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
const callsAt = (film: Film, T: number): ReadonlyArray<Call> => {
  const log: Call[] = [];
  const ctx = logging(
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
const bothWays = <A>(film: Film, frame: number, at: (film: Film, T: number) => A) => {
  const T = (f: number) => f / film.fps;
  film.render(blank(), T(frame + 1), { captions: true });
  const afterNext = at(film, T(frame));
  film.render(blank(), T(Math.max(0, frame - 1)), { captions: true });
  const afterBefore = at(film, T(frame));
  return { afterNext, afterBefore };
};

/**
 * Where frame `frame` is not pure: drawn after the next frame, then after the
 * one before, what is left on it differs; the first call that differs.
 */
const impureAt = (film: Film, frame: number): Option.Option<string> => {
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

/** A film's module: the film, built from its narration (`narratedFilms`). */
const FilmFile = Schema.Struct({
  film: Schema.declare((u): u is FilmModule['film'] => Predicate.isFunction(u)),
});

/** A film as its page builds it: its own `film()`, from its committed timings. */
const filmOf = Effect.fn('test.filmOf')(function* (film: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const module = yield* Effect.promise(() => importFilmModule(path.join(FILMS, film, 'film.ts')));
  const build = (yield* Schema.decodeUnknownEffect(FilmFile)(module)).film;
  const timings = yield* Schema.decodeEffect(TimingsJson)(
    yield* fs.readFileString(path.join(FILMS, film, 'narration', 'timings.json')),
  );
  return build({ timings, audio: `/films/${film}/narration/full.wav` });
});

/** A moment a test draws, and whether it is also checked for purity. */
interface Moment {
  readonly scene: string;
  readonly at: string;
  readonly frame: number;
  readonly pure: boolean;
}

/**
 * The moments a film is drawn at: `sceneMoments` (every cue's edges and each
 * scene's 60% point), each scene's first and last frame, and each cue's
 * midpoint. Where a cue starts and each 60% point are also checked for
 * purity: a sample, as a frame there costs four draws.
 */
const momentsOf = (film: Film): ReadonlyArray<Moment> => {
  const fps = film.fps;
  const sampled = sceneMoments(film.placed, fps, { marks: false }).map((m) => ({
    ...m,
    pure: m.at.includes('start') || m.at.includes('60%'),
  }));
  const edges = film.placed.flatMap((p) => {
    const first = Math.ceil(p.start * fps - 1e-6);
    const last = Math.ceil((p.start + p.dur) * fps - 1e-6) - 1;
    // Mid-span, where a branch on `0 < f.at(cue) < 1` draws and neither edge does.
    const mids = [...p.cues]
      .filter(([, c]) => c.end > c.start)
      .map(([cue, c]) => ({
        scene: p.spec.id,
        at: `cue ${cue} mid`,
        frame: Math.min(last, Math.max(first, Math.round((p.start + (c.start + c.end) / 2) * fps))),
        pure: false,
      }));
    return [
      { scene: p.spec.id, at: 'start', frame: first, pure: false },
      { scene: p.spec.id, at: 'end', frame: last, pure: false },
      ...mids,
    ];
  });
  return [...sampled, ...edges];
};

/** What a moment found: a draw that threw, or a frame that is not pure. */
type Finding =
  | { readonly _tag: 'Threw'; readonly why: string }
  | { readonly _tag: 'Impure'; readonly why: string };

/** Draw moment `m` (four draws where it is checked for purity, one elsewhere): what it found, if anything. */
const checkAt = (film: Film, m: Moment) =>
  Effect.sync(() => {
    if (!m.pure) {
      film.render(blank(), m.frame / film.fps, { captions: true });
      return Option.none<Finding>();
    }
    return Option.map(impureAt(film, m.frame), (why): Finding => ({ _tag: 'Impure', why }));
  }).pipe(
    Effect.catchDefect((defect) =>
      Effect.succeedSome<Finding>({ _tag: 'Threw', why: String(defect) }),
    ),
  );

/**
 * One pass over righteousness-by-faith (about 700 draws and 360 purity
 * samples of four draws each) takes about 25 s alone; the gate runs it beside
 * every other package's tests on a shared box, so its budget is wide.
 */
const BUDGET = 120_000;

describe('every scene draws, and every sampled frame is pure', () => {
  it.effect('a frame that reads the frame drawn before it is caught', () =>
    Effect.gen(function* () {
      yield* standInDom(BLANK);
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
      `${name}: every scene at its start, each cue's edges and midpoint, its 60% point and its end; each cue start and 60% point the same after the frame after it and the frame before it`,
      () =>
        Effect.gen(function* () {
          yield* standInDom(BLANK);
          const film = yield* filmOf(name);
          const moments = momentsOf(film);
          const threw: string[] = [];
          const impure: string[] = [];
          for (const m of moments) {
            const found = yield* checkAt(film, m);
            if (Option.isSome(found)) {
              const line = `${m.scene} (${m.at}, frame ${m.frame}): ${found.value.why}`;
              if (found.value._tag === 'Threw') threw.push(line);
              else impure.push(line);
            }
          }
          expect(moments.length).toBeGreaterThan(film.placed.length * 3);
          expect(moments.filter((m) => m.pure).length).toBeGreaterThan(film.placed.length);
          expect(threw).toEqual([]);
          expect(impure).toEqual([]);
        }).pipe(Effect.scoped),
      BUDGET,
    );
});
