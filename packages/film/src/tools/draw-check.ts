// The draw leg of `film check` (`--draw`): every scene of a film drawn in this
// process, as its page builds it (the film's own `film()` from its committed
// timings, drawn by the compositor), at its first frame, each cue's edges and
// midpoint, its 60% point and its last frame. A scene that reads a mark, a
// cue or a knob its film no longer has (a card reading a mark a revised
// script removed) throws at draw time: `DrawThrew`.
//
// Bun has no canvas, so each frame is drawn into the framework's stand-in
// context (`canvas/fixtures/stand-in.ts`), keeping nothing: every call it does
// not track answers a value that reads as nothing, except where a real canvas
// refuses an argument (a negative arc, ellipse or gradient radius, a colour
// stop off 0..1), where it throws as the real one does. Nothing is
// rasterised, which is the point: this is the draw path's logic, the part a
// script edit can break. A throw only between samples (say, a branch at 30%
// of a cue) still needs a render to find.
//
// Every sampled frame is also pure: a function of its time, not of what the
// film drew before (a scene easing from a value it kept from the last
// frame). Where a cue starts and at each
// scene's 60% point, the frame is drawn after the frame after it, and again
// after the frame before it, into a context that logs every call; the two
// logs must be the same, else `FrameImpure`. Those draws are that moment's
// draw check too, so each moment is drawn by one pass over the film. Only what
// a frame asks the canvas to do is logged: a factory or a query (a gradient, a
// pattern, a measure) is left out, so a cache that hands back the same
// gradient or tile is not a difference; a canvas passed to a call reads as
// which canvas it is (the stand-in numbers each as it is made), any other
// object as its kind. The compositor may draw a scene twice (its framing
// guess, `sheet` in canvas/film.ts, draws again from the paper when it guessed
// wrong), so what is compared is what is left on the frame: the calls from the
// last time the paper is drawn.
//
// Each moment is drawn with the probe collecting faces, strokes and text, so
// ink or text drawn over a face the viewer sees (`seenFace`: its scene's own,
// mostly opaque, centred on the frame) is found (`InkOverFace`). The stand-in sets
// text a width from its font's size and a fixed height, so a line of text is
// found over a face where its baseline strip crosses the face's core.

import { Array as Arr, Effect, Option, Order, Predicate, type Scope } from 'effect';
import type { Film } from '../canvas/film.ts';
import type { ProbeSink } from '../canvas/probe.ts';
import { isStandInCanvas, recorder, standInDom } from '../canvas/fixtures/stand-in.ts';
import { sceneMoments } from '../core/moments.ts';
import { FNV_START, fnvStep, fnvText } from '../core/random.ts';
import { inkOverFace } from './check.ts';
import { type DrawFinding, DrawThrew, FrameImpure, InkOverFace } from './findings.ts';

/** A font's size in px, when its shorthand names one. */
const fontPx = (font: string): number =>
  Option.getOrElse(
    Option.map(Option.fromNullishOr(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]), Number),
    () => 10,
  );

/** How wide the stand-in sets text: half an em a character, near enough to place a line. */
const measure = (font: string, text: string) => fontPx(font) * 0.5 * text.length;

/** The stand-in keeps nothing: the leg asks only whether each frame draws, what it asks, and what it probes. */
const BLANK = { record: false, measure } as const;

/** A fresh stand-in context for one draw. */
const blank = () => recorder(1920, 1080, BLANK).ctx;

/** A probe's sink that collects faces as well as text and ink. */
const sinkOf = (): Required<Pick<ProbeSink, 'texts' | 'inks' | 'faces'>> => ({
  texts: [],
  inks: [],
  faces: [],
});

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

/** Each call name's own hash, worked out once. */
const nameHashes = new Map<PropertyKey, number>();
const nameHash = (key: PropertyKey) =>
  Option.getOrElse(Option.fromUndefinedOr(nameHashes.get(key)), () => {
    const h = fnvText(FNV_START, String(key));
    nameHashes.set(key, h);
    return h;
  });

/**
 * A hash of what a frame at `T` leaves on it, and how many calls that is:
 * cheap, for every sample. Drawn with `probe` collecting, as every draw of a
 * moment is, so a probe's own reads are the same in both logs.
 */
const fingerprintAt = (film: Film, T: number, probe: ProbeSink) => {
  let hash = FNV_START;
  let calls = 0;
  const ctx = logging(
    (key, args) => {
      calls += 1;
      hash = fnvStep(hash, nameHash(key));
      for (const v of kept(args)) {
        if (Predicate.isNumber(v)) {
          bits[0] = v;
          hash = fnvStep(hash, words[0] ?? 0);
          hash = fnvStep(hash, words[1] ?? 0);
        } else hash = fnvText(hash, String(v));
      }
    },
    () => {
      hash = FNV_START;
      calls = 0;
    },
  );
  film.render(ctx, T, { captions: true, probe });
  return `${calls}:${hash >>> 0}`;
};

/** What a frame at `T` leaves on it, call by call: to name the first difference once one is found. */
const callsAt = (film: Film, T: number, probe: ProbeSink): ReadonlyArray<Call> => {
  const log: Call[] = [];
  const ctx = logging(
    (key, args) => log.push([key, kept(args)]),
    () => {
      log.length = 0;
    },
  );
  film.render(ctx, T, { captions: true, probe });
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

/**
 * Frame `frame` drawn after the next frame, then after the one before: what
 * each left, by `at`. The second draw's probe is `probe`, the moment's.
 */
const bothWays = <A>(
  film: Film,
  frame: number,
  at: (film: Film, T: number, probe: ProbeSink) => A,
  probe: ProbeSink,
) => {
  const T = (f: number) => f / film.fps;
  film.render(blank(), T(frame + 1), { captions: true });
  const afterNext = at(film, T(frame), sinkOf());
  film.render(blank(), T(Math.max(0, frame - 1)), { captions: true });
  const afterBefore = at(film, T(frame), probe);
  return { afterNext, afterBefore };
};

/**
 * Where frame `frame` is not pure: drawn after the next frame, then after the
 * one before, what is left on it differs; the first call that differs. What
 * the frame drawn after the one before probes lands in `probe`.
 */
export const impureAt = (
  film: Film,
  frame: number,
  probe: ProbeSink = sinkOf(),
): Option.Option<string> => {
  const quick = bothWays(film, frame, fingerprintAt, probe);
  if (quick.afterNext === quick.afterBefore) return Option.none();
  const { afterNext, afterBefore } = bothWays(film, frame, callsAt, sinkOf());
  const length = Math.max(afterNext.length, afterBefore.length);
  const first = Arr.findFirst(
    Arr.makeBy(length, (k) => k),
    (k) => !sameAt(afterNext, afterBefore, k),
  );
  return Option.some(
    Option.match(first, {
      onNone: () =>
        `its calls hash ${quick.afterNext} after the next frame, ${quick.afterBefore} after the one before`,
      onSome: (k) =>
        `call ${k}: ${shownAt(afterNext, k)} after the next frame, ${shownAt(afterBefore, k)} after the one before`,
    }),
  );
};

/** A moment the leg draws, and whether it is also checked for purity. */
export interface DrawMoment {
  readonly scene: string;
  readonly at: string;
  readonly frame: number;
  /** Film seconds. */
  readonly time: number;
  readonly pure: boolean;
}

/**
 * The moments a film is drawn at: `sceneMoments` (every cue's edges and each
 * scene's 60% point), each scene's first and last frame, and each cue's
 * midpoint. Where a cue starts and each 60% point are also checked for
 * purity: a sample, as a frame there costs four draws.
 */
export const drawMoments = (film: Film): ReadonlyArray<DrawMoment> => {
  const fps = film.fps;
  const sampled = sceneMoments(film.placed, fps, { marks: false }).map((m) => ({
    ...m,
    pure: m.at.includes('start') || m.at.includes('60%'),
  }));
  const edges = film.placed.flatMap((p) => {
    const first = Math.ceil(p.start * fps - 1e-6);
    const last = Math.ceil((p.start + p.dur) * fps - 1e-6) - 1;
    const at = (label: string, frame: number): DrawMoment => ({
      scene: p.spec.id,
      at: label,
      frame,
      time: frame / fps,
      pure: false,
    });
    // Mid-span, where a branch on `0 < f.at(cue) < 1` draws and neither edge does.
    const mids = [...p.cues]
      .filter(([, c]) => c.end > c.start)
      .map(([cue, c]) =>
        at(
          `cue ${cue} mid`,
          Math.min(last, Math.max(first, Math.round((p.start + (c.start + c.end) / 2) * fps))),
        ),
      );
    return [at('start', first), at('end', last), ...mids];
  });
  return [...sampled, ...edges];
};

/** Draw moment `m` (four draws where it is checked for purity, one elsewhere): what it found. */
const drawAt = (film: Film, m: DrawMoment): Effect.Effect<ReadonlyArray<DrawFinding>> => {
  const where = { scene: m.scene, time: m.time, at: m.at };
  const sample = { ...where, frame: m.frame };
  const probe = sinkOf();
  const frame = { width: film.width, height: film.height };
  return Effect.sync((): ReadonlyArray<DrawFinding> => {
    if (!m.pure) {
      film.render(blank(), m.time, { captions: true, probe });
      return inkOverFace(sample, probe, frame);
    }
    const impure = Option.map(impureAt(film, m.frame, probe), (why) =>
      FrameImpure.make({ ...where, why }),
    );
    return [...Option.toArray(impure), ...inkOverFace(sample, probe, frame)];
  }).pipe(
    Effect.catchDefect((defect) =>
      Effect.succeed([DrawThrew.make({ ...where, why: String(defect) })]),
    ),
  );
};

/**
 * Ink over the faces of a scene in many frames, as one finding per scene: the
 * first seen face it lies over (the moment the owner is sent to), the most
 * strokes over any one face, every line of text, and how many sampled frames
 * show it (a frame with ink over two faces counts once).
 */
const mergeFaces = (found: ReadonlyArray<DrawFinding>): ReadonlyArray<DrawFinding> => {
  const faces = Arr.groupBy(
    found.filter((f) => f._tag === 'InkOverFace'),
    (f) => f.scene,
  );
  const merged = Object.values(faces).map((same) => {
    const first = Arr.headNonEmpty(Arr.sortWith(same, (f) => f.time, Order.Number));
    return InkOverFace.make({
      scene: first.scene,
      time: first.time,
      at: first.at,
      x: first.x,
      y: first.y,
      size: first.size,
      strokes: Math.max(...same.map((f) => f.strokes)),
      texts: Arr.dedupe(same.flatMap((f) => f.texts)),
      frames: new Set(same.map((f) => f.time)).size,
    });
  });
  return [...found.filter((f) => f._tag !== 'InkOverFace'), ...merged];
};

/**
 * The draw leg: under a stand-in document, the film `build` makes (its
 * canvases stand-ins too), each moment of its scenes named in `scenes`
 * (every one when empty) drawn: what threw, what is not pure and what ink
 * lies over a face.
 */
export const drawFindings = (
  build: () => Film,
  scenes: ReadonlySet<string> = new Set(),
): Effect.Effect<ReadonlyArray<DrawFinding>, never, Scope.Scope> =>
  Effect.gen(function* () {
    yield* standInDom(BLANK);
    const film = build();
    const moments = drawMoments(film).filter((m) => scenes.size === 0 || scenes.has(m.scene));
    const found = yield* Effect.forEach(moments, (m) => drawAt(film, m));
    return mergeFaces(found.flat());
  });

/** How many moments `drawFindings` draws in `film`, and how many it checks for purity. */
export const momentCounts = (film: Film) => {
  const moments = drawMoments(film);
  return { moments: moments.length, pure: moments.filter((m) => m.pure).length };
};
