// What `film check` looks for, as pure functions over a laid-out film: the
// static findings (cues past their scene, sound cues naming nothing, acts out
// of order, stale takes and sounds, an audio master missing or not as long as
// the film) and the layout findings in what a probed frame reports: text over
// text, text off the frame, brush strokes across text, and a plate carrying
// text cut off by the frame. Every finding is collected; none stops the others.

import { Array as Arr, Match, Option, Order, Record as Rec, Result } from 'effect';
import type { Placed } from '../core/layout.ts';
import { everyTakeRecorded, sceneOf, transitionDur } from '../core/layout.ts';
import { hashText, parse, voiceKey } from '../core/narration.ts';
import type {
  InkMark,
  Music,
  Point,
  Probed,
  Sound,
  SoundManifest,
  TextBox,
} from '../core/schema.ts';
import { MIN_CHUNK_MS, cueTime, effectKey, filmEnd, musicKey, musicPlan } from '../core/sound.ts';
import {
  ActTooShort,
  AssetMissing,
  AssetStale,
  type AudioMissing,
  type AudioStale,
  CueLate,
  type CueInvalid,
  InkOverText,
  PlateOffFrame,
  TakeStale,
  TextOffFrame,
  TextOverlap,
  type UnknownCue,
  type UnknownMark,
  type UnknownScene,
} from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import { masterFile, masterFinding } from './mixer.ts';

export type StaticFinding =
  | CueLate
  | TakeStale
  | AssetStale
  | AssetMissing
  | AudioMissing
  | AudioStale
  | UnknownScene
  | UnknownCue
  | UnknownMark
  | CueInvalid
  | ActTooShort;
export type LayoutFinding = TextOverlap | TextOffFrame | InkOverText | PlateOffFrame;
export type Finding = StaticFinding | LayoutFinding;

export type Level = 'error' | 'warning';

export interface Reported {
  readonly level: Level;
  readonly finding: Finding;
}

export interface CheckOptions {
  /** Report stale takes and stale sounds as warnings: work in progress, not a broken film. */
  readonly allowStale: boolean;
}

// ---------------------------------------------------------------------------
// Static

/** Named cues that end after their scene. */
export const lateCues = (placed: ReadonlyArray<Placed>): ReadonlyArray<CueLate> =>
  placed.flatMap((p) =>
    [...p.cues]
      .filter(([, c]) => c.end > p.dur + 1e-9)
      .map(([cue, c]) => CueLate.make({ scene: p.spec.id, cue, end: c.end, dur: p.dur })),
  );

/** Beats with words whose take is missing or was recorded for other text or another voice. */
export const staleTakes = (film: LoadedFilm): ReadonlyArray<TakeStale> => {
  const voiceChanged = film.timings.voice !== voiceKey(film.voice);
  return film.scenes.flatMap((scene) => {
    const spoken = parse(Option.getOrElse(Option.fromNullishOr(scene.say), () => '')).spoken;
    if (spoken.length === 0) return [];
    const take = Rec.get(film.timings.scenes, scene.id);
    if (Option.isNone(take)) return [TakeStale.make({ scene: scene.id, reason: 'missing' })];
    if (voiceChanged) return [TakeStale.make({ scene: scene.id, reason: 'voice changed' })];
    if (take.value.hash !== hashText(spoken))
      return [TakeStale.make({ scene: scene.id, reason: 'text changed' })];
    return [];
  });
};

/** A generated asset against the hash its request has now. */
const assetFinding = (
  asset: string,
  stored: Option.Option<string>,
  wanted: string,
): ReadonlyArray<AssetStale | AssetMissing> =>
  Option.match(stored, {
    onNone: () => [AssetMissing.make({ asset })],
    onSome: (hash) => {
      if (hash === wanted) return [];
      return [AssetStale.make({ asset, stored: hash, wanted })];
    },
  });

/**
 * The score's acts: each names a scene, and each runs in film order for at
 * least the API's shortest chunk. Only a plan that holds is checked for a
 * stale score.
 */
export const musicFindings = (
  music: Music,
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
): ReadonlyArray<UnknownScene | ActTooShort | AssetStale | AssetMissing> => {
  const unknown = music.acts.flatMap((act) =>
    Result.match(sceneOf(placed, act.from), { onFailure: (e) => [e], onSuccess: () => [] }),
  );
  if (unknown.length > 0) return unknown;
  const starts = music.acts.map((act, i) => {
    if (i === 0) return 0;
    return Option.match(
      Arr.findFirst(placed, (p) => p.spec.id === act.from),
      { onNone: () => 0, onSome: (p) => p.start },
    );
  });
  const bounds = [...starts, filmEnd(placed)].map((s) => Math.round(s * 1000));
  const short = music.acts.flatMap((act, i) => {
    const ms = Arr.getUnsafe(bounds, i + 1) - Arr.getUnsafe(bounds, i);
    if (ms >= MIN_CHUNK_MS) return [];
    return [ActTooShort.make({ act: act.name, ms })];
  });
  if (short.length > 0) return short;
  return Result.match(musicPlan(music, placed), {
    onFailure: (error) => [error],
    onSuccess: (plan) =>
      assetFinding(
        'music',
        Option.map(Option.fromNullishOr(manifest.music), (a) => a.hash),
        musicKey(music, plan),
      ),
  });
};

/** Every effect placement names a real scene, cue or mark; every effect's asset is current. */
export const effectFindings = (
  sound: Sound,
  placed: ReadonlyArray<Placed>,
  manifest: SoundManifest,
): ReadonlyArray<StaticFinding> =>
  Object.entries(sound.effects).flatMap(([id, effect]) => [
    ...effect.at.flatMap((cue) =>
      Result.match(cueTime(cue, placed), { onFailure: (e) => [e], onSuccess: () => [] }),
    ),
    ...assetFinding(
      id,
      Option.map(Rec.get(manifest.effects, id), (a) => a.hash),
      effectKey(effect),
    ),
  ]);

const levelOf = (finding: StaticFinding, options: CheckOptions): Level => {
  switch (finding._tag) {
    case 'TakeStale':
    case 'AssetStale':
    case 'AudioStale':
    case 'AudioMissing':
      if (options.allowStale) return 'warning';
      return 'error';
    case 'AssetMissing':
      return 'warning';
    default:
      return 'error';
  }
};

/**
 * How far the audio master may differ from the film's length. The check does
 * not know the film's frame rate, so it holds the master to a frame at 60 fps,
 * no looser than the render's one frame at any rate up to that; a mix is
 * trimmed to the film's length, so a current master is exact.
 */
export const MASTER_TOLERANCE = 1 / 60;

/** Once every take is recorded the film has a mixed track, and its master must cover the film. */
export const masterFindings = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  length: Option.Option<number>,
): ReadonlyArray<AudioMissing | AudioStale> => {
  if (!everyTakeRecorded(placed)) return [];
  return Option.toArray(
    masterFinding(masterFile(film.paths), length, filmEnd(placed), MASTER_TOLERANCE),
  );
};

/**
 * Everything the check finds without drawing a frame. `master` is the audio
 * master's measured length, or none when there is no master.
 */
export const staticFindings = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
  options: CheckOptions,
  master: Option.Option<number>,
): ReadonlyArray<Reported> => {
  const sound = Option.toArray(film.sound).flatMap((s) => [
    ...Option.toArray(Option.fromNullishOr(s.music)).flatMap((m) =>
      musicFindings(m, placed, film.manifest),
    ),
    ...effectFindings(s, placed, film.manifest),
  ]);
  const audio = masterFindings(film, placed, master);
  return [...lateCues(placed), ...staleTakes(film), ...sound, ...audio].map((finding) => ({
    level: levelOf(finding, options),
    finding,
  }));
};

// ---------------------------------------------------------------------------
// Layout

/** A frame the layout leg probes, and why: a mark, a cue edge, the scene's 60% point. */
export interface Sample {
  readonly scene: string;
  readonly frame: number;
  /** Film seconds. */
  readonly time: number;
  readonly at: string;
}

/**
 * The frames to probe in each scene: every mark, every cue's start and end,
 * and the 60% point. A time is pulled inside the scene's own frames, after
 * its entering transition: mid-transition, two scenes slide or fade across
 * each other by design.
 */
export const layoutSamples = (placed: ReadonlyArray<Placed>, fps: number): ReadonlyArray<Sample> =>
  placed.flatMap((p) => {
    const moments: Array<readonly [string, number]> = [
      ...[...p.voice.marks].map(([name, at]): readonly [string, number] => [
        `mark ${name}`,
        p.speechStart + at,
      ]),
      ...[...p.cues].flatMap(([name, c]): Array<readonly [string, number]> => [
        [`cue ${name} start`, c.start],
        [`cue ${name} end`, c.end],
      ]),
      ['60%', p.dur * 0.6],
    ];
    // The first scene has nothing to arrive from.
    const settled = Math.min(p.index, 1) * transitionDur(p.spec.enter);
    const first = Math.ceil((p.start + settled) * fps - 1e-6);
    const last = Math.ceil((p.start + p.dur) * fps - 1e-6) - 1;
    const byFrame = new Map<number, Array<string>>();
    for (const [at, t] of moments) {
      const frame = Math.min(last, Math.max(first, Math.round((p.start + t) * fps)));
      const before = Option.getOrElse(Option.fromNullishOr(byFrame.get(frame)), () => []);
      byFrame.set(frame, [...before, at]);
    }
    return Arr.sort(
      [...byFrame].map(([frame, at]) => ({
        scene: p.spec.id,
        frame,
        time: frame / fps,
        at: at.join(', '),
      })),
      Order.mapInput(Order.Number, (s: Sample) => s.frame),
    );
  });

/**
 * Text fainter than this reads as gone. Both lines of a pair must be above it
 * to collide, so a word fading out where another fades in is a crossfade, not
 * a collision.
 */
export const VISIBLE_ALPHA = 0.3;
/** Two lines collide only where they overlap by more than this many pixels, across and down. */
export const OVERLAP_TOLERANCE = 4;

const visible = (box: TextBox) => box.alpha > VISIBLE_ALPHA;

type Quad = TextBox['corners'];

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const cross = (a: Point, b: Point) => a[0] * b[1] - a[1] * b[0];

/** Shoelace area of a polygon: positive for one winding, negative for the other. */
const signedArea = (poly: ReadonlyArray<Point>): number =>
  poly.reduce((sum, p, i) => sum + cross(p, Arr.getUnsafe(poly, (i + 1) % poly.length)), 0) / 2;

/** Sutherland–Hodgman: the part of `subject` inside the convex polygon `clip`. */
const clipPolygon = (
  subject: ReadonlyArray<Point>,
  clip: ReadonlyArray<Point>,
): ReadonlyArray<Point> => {
  const winding = Math.sign(signedArea(clip));
  return clip.reduce<ReadonlyArray<Point>>((poly, a, i) => {
    if (poly.length === 0) return poly;
    const b = Arr.getUnsafe(clip, (i + 1) % clip.length);
    const inside = (p: Point) => winding * cross(sub(b, a), sub(p, a)) >= 0;
    const meet = (p: Point, q: Point): Point => {
      const d = sub(q, p);
      const k = cross(sub(b, a), sub(a, p)) / cross(sub(b, a), d);
      return [p[0] + d[0] * k, p[1] + d[1] * k];
    };
    return poly.flatMap((p, j) => {
      const prev = Arr.getUnsafe(poly, (j + poly.length - 1) % poly.length);
      if (inside(p)) {
        if (inside(prev)) return [p];
        return [meet(prev, p), p];
      }
      if (inside(prev)) return [meet(prev, p)];
      return [];
    });
  }, subject);
};

/** The area two convex quads share. */
const sharedArea = (a: Quad, b: Quad): number => {
  if (signedArea(a) === 0 || signedArea(b) === 0) return 0;
  return Math.abs(signedArea(clipPolygon(a, b)));
};

/** A quad pulled in by `by` pixels on every side along its own axes; none if too thin. */
const inset = (q: Quad, by: number): Option.Option<Quad> => {
  const [tl, tr, br, bl] = q;
  const across = Math.hypot(...sub(tr, tl));
  const down = Math.hypot(...sub(bl, tl));
  if (across <= 2 * by || down <= 2 * by) return Option.none();
  const u = sub(tr, tl).map((c) => (c / across) * by);
  const v = sub(bl, tl).map((c) => (c / down) * by);
  const move = (p: Point, su: number, sv: number): Point => [
    p[0] + su * Arr.getUnsafe(u, 0) + sv * Arr.getUnsafe(v, 0),
    p[1] + su * Arr.getUnsafe(u, 1) + sv * Arr.getUnsafe(v, 1),
  ];
  return Option.some([move(tl, 1, 1), move(tr, -1, 1), move(br, -1, -1), move(bl, 1, -1)]);
};

/**
 * The area two lines of text share, in their own rotated boxes, or 0 when
 * they overlap by no more than the tolerance: each box is pulled in by half
 * of it before they are compared.
 */
export const overlapArea = (a: TextBox, b: TextBox): number => {
  const deep = Option.zipWith(
    inset(a.corners, OVERLAP_TOLERANCE / 2),
    inset(b.corners, OVERLAP_TOLERANCE / 2),
    sharedArea,
  );
  if (Option.getOrElse(deep, () => 0) <= 0) return 0;
  return sharedArea(a.corners, b.corners);
};

/**
 * How far a box reaches past each edge of a `width` × `height` frame (0 where
 * it does not). A box wholly outside the frame shows nothing, so it reaches
 * past nothing: text that has slid or fallen away is gone, not cut off.
 */
export const pastFrame = (
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  width: number,
  height: number,
) => {
  const gone = box.x >= width || box.y >= height || box.x + box.w <= 0 || box.y + box.h <= 0;
  if (gone) return { left: 0, top: 0, right: 0, bottom: 0 };
  return {
    left: Math.max(0, -box.x),
    top: Math.max(0, -box.y),
    right: Math.max(0, box.x + box.w - width),
    bottom: Math.max(0, box.y + box.h - height),
  };
};

/**
 * A plate or fill at least this opaque hides the strokes drawn before it; a
 * fainter one lets them show through.
 */
export const HIDING_ALPHA = 0.8;
/**
 * A stroke drawn before a line of text lies under it, and one fainter than
 * this is page texture the words read over (greeked copy on a newspaper): only
 * a stroke drawn over the text, or a heavy one under it, strikes it.
 */
export const UNDER_ALPHA = 0.5;
/** Along a crossing, the check looks for a plate over the stroke every this many pixels. */
const CROSS_STEP = 2;

/** Whether `p` lies inside the polygon `poly` (even-odd; any winding, convex or not). */
export const insidePolygon = (poly: ReadonlyArray<Point>, p: Point): boolean =>
  poly.reduce((inside, a, i) => {
    const b = Arr.getUnsafe(poly, (i + poly.length - 1) % poly.length);
    const crosses =
      a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0];
    return crosses !== inside;
  }, false);

/**
 * The part of the segment `p` → `q` inside the convex polygon `poly`, as the
 * fractions of the way along it where it enters and leaves (Cyrus–Beck); none
 * when it misses.
 */
export const clipSegment = (
  p: Point,
  q: Point,
  poly: ReadonlyArray<Point>,
): Option.Option<readonly [number, number]> => {
  const winding = Math.sign(signedArea(poly));
  if (winding === 0) return Option.none();
  const d = sub(q, p);
  let enter = 0;
  let leave = 1;
  for (const [i, a] of poly.entries()) {
    const edge = sub(Arr.getUnsafe(poly, (i + 1) % poly.length), a);
    // Inside where winding · cross(edge, x − a) ≥ 0, with x = p + t·d.
    const at = winding * cross(edge, sub(p, a));
    const rate = winding * cross(edge, d);
    if (rate === 0) {
      if (at < 0) return Option.none();
      continue;
    }
    const t = -at / rate;
    if (rate > 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
    if (enter > leave) return Option.none();
  }
  return Option.some([enter, leave]);
};

/**
 * How much of a stroke runs through a line of text where it shows: its
 * centre line clipped to the text's box, grown by half the stroke's width less
 * half the tolerance (so a stroke that grazes a box by no more than the
 * tolerance does not cross it), less every stretch a plate or fill drawn
 * after the stroke covers.
 */
export const crossing = (
  stroke: InkMark,
  text: TextBox,
  covers: ReadonlyArray<InkMark>,
): number => {
  const box = inset(text.corners, OVERLAP_TOLERANCE / 2);
  if (Option.isNone(box)) return 0;
  const over = covers.filter((c) => c.order > stroke.order);
  const hidden = (at: Point) => over.some((c) => insidePolygon(c.points, at));
  return stroke.points.slice(1).reduce((sum, q, i) => {
    const p = Arr.getUnsafe(stroke.points, i);
    return Option.match(clipSegment(p, q, box.value), {
      onNone: () => sum,
      onSome: ([enter, leave]) => {
        const len = Math.hypot(...sub(q, p)) * (leave - enter);
        const steps = Math.max(1, Math.ceil(len / CROSS_STEP));
        const shown = Arr.range(0, steps - 1).filter((k) => {
          const t = enter + ((leave - enter) * (k + 0.5)) / steps;
          return !hidden([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
        }).length;
        return sum + (len * shown) / steps;
      },
    });
  }, 0);
};

/** Two boxes' bounds meet, with `pad` pixels to spare. */
const near = (
  a: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  b: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  pad: number,
) =>
  a.x - pad <= b.x + b.w &&
  b.x <= a.x + a.w + pad &&
  a.y - pad <= b.y + b.h &&
  b.y <= a.y + a.h + pad;

/** The box around a set of ink marks. */
const boundsOf = (marks: ReadonlyArray<InkMark>) => {
  const x = Math.min(...marks.map((m) => m.x));
  const y = Math.min(...marks.map((m) => m.y));
  return {
    x,
    y,
    w: Math.max(...marks.map((m) => m.x + m.w)) - x,
    h: Math.max(...marks.map((m) => m.y + m.h)) - y,
  };
};

/**
 * Strokes across text: for each visible line, the visible strokes whose
 * centre line runs through its box (and is not hidden there by a plate drawn
 * after them), other than a stroke that `marks` that very text on purpose.
 */
export const inkOverText = (sample: Sample, probed: Probed): ReadonlyArray<InkOverText> => {
  const texts = probed.texts.filter(visible);
  const strokes = probed.inks.filter((m) => m.kind === 'stroke' && m.alpha > VISIBLE_ALPHA);
  const covers = probed.inks.filter((m) => m.kind !== 'stroke' && m.alpha >= HIDING_ALPHA);
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const byText = new Map<string, Array<readonly [InkMark, number]>>();
  for (const text of texts)
    for (const stroke of strokes) {
      if (stroke.marks === text.text || !near(stroke, text, stroke.width)) continue;
      if (stroke.order < text.order && stroke.alpha < UNDER_ALPHA) continue;
      const length = crossing(stroke, text, covers);
      if (length <= OVERLAP_TOLERANCE) continue;
      const found = Option.getOrElse(Option.fromNullishOr(byText.get(text.text)), () => []);
      byText.set(text.text, [...found, [stroke, length]]);
    }
  return [...byText].map(([text, crossed]) => {
    const marks = Arr.dedupe(crossed.map(([m]) => m));
    return InkOverText.make({
      ...where,
      text,
      strokes: marks.length,
      length: crossed.reduce((sum, [, len]) => sum + len, 0),
      ...boundsOf(marks),
    });
  });
};

/** The plate under a line of text: the topmost fill or plate under its centre, drawn before it. */
const plateUnder = (probed: Probed, text: TextBox) => {
  const centre: Point = [text.x + text.w / 2, text.y + text.h / 2];
  return Arr.last(
    probed.inks.filter(
      (m) =>
        m.kind !== 'stroke' &&
        m.alpha > VISIBLE_ALPHA &&
        m.order < text.order &&
        insidePolygon(m.points, centre),
    ),
  );
};

/** A plate at least this share of the frame wide or high is a backdrop, and may bleed. */
const BACKDROP = 0.5;
/** How far a plate may drift between two frames and still be at rest. */
const AT_REST = 1;

/**
 * Plates cut off by the frame: a line of text, wholly inside the frame, whose
 * plate (the topmost fill under its centre, drawn before it) reaches past an
 * edge by more than the tolerance and sits still there (`next`, the following
 * frame, has the same line on the same plate). A plate half the frame wide or
 * high is a backdrop or a panel (a sky, a split page) and bleeds off it by
 * design; a line that is past an edge itself, or a plate still moving, is
 * entering or leaving.
 */
export const platesOffFrame = (
  sample: Sample,
  probed: Probed,
  size: { readonly width: number; readonly height: number },
  next: Probed = probed,
): ReadonlyArray<PlateOffFrame> => {
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const still = (plate: InkMark, text: TextBox) =>
    Arr.some(next.texts, (later) => {
      if (later.text !== text.text) return false;
      return Option.match(plateUnder(next, later), {
        onNone: () => false,
        onSome: (moved) =>
          Math.max(
            Math.abs(moved.x - plate.x),
            Math.abs(moved.y - plate.y),
            Math.abs(moved.w - plate.w),
            Math.abs(moved.h - plate.h),
          ) <= AT_REST,
      });
    });
  return probed.texts.filter(visible).flatMap((text) => {
    const inside = pastFrame(text, size.width, size.height);
    if (Math.max(inside.left, inside.top, inside.right, inside.bottom) > 0) return [];
    return Option.match(plateUnder(probed, text), {
      onNone: () => [],
      onSome: (plate) => {
        if (plate.w >= size.width * BACKDROP || plate.h >= size.height * BACKDROP) return [];
        const past = pastFrame(plate, size.width, size.height);
        if (Math.max(past.left, past.top, past.right, past.bottom) <= OVERLAP_TOLERANCE) return [];
        if (!still(plate, text)) return [];
        return [PlateOffFrame.make({ ...where, text: text.text, ...past })];
      },
    });
  });
};

/**
 * The layout findings in one probed frame; `next` is the frame after it, which
 * tells a plate at rest from one on its way in or out (the frame itself when
 * there is none).
 */
export const frameFindings = (
  sample: Sample,
  probed: Probed,
  size: { readonly width: number; readonly height: number },
  next: Probed = probed,
): ReadonlyArray<LayoutFinding> => {
  const shown = probed.texts.filter(visible);
  const where = { scene: sample.scene, time: sample.time, at: sample.at, frames: 1 };
  const overlaps = shown.flatMap((a, i) =>
    shown.slice(i + 1).flatMap((b) => {
      if (a.text === b.text) return [];
      const area = overlapArea(a, b);
      if (area <= 0) return [];
      const [first, second] = Arr.sort([a.text, b.text], Order.String);
      return [TextOverlap.make({ ...where, a: first ?? a.text, b: second ?? b.text, area })];
    }),
  );
  const off = shown.flatMap((box) => {
    const past = pastFrame(box, size.width, size.height);
    if (past.left + past.top + past.right + past.bottom <= 0) return [];
    return [TextOffFrame.make({ ...where, text: box.text, ...past })];
  });
  return [
    ...overlaps,
    ...off,
    ...inkOverText(sample, probed),
    ...platesOffFrame(sample, probed, size, next),
  ];
};

const matchFinding = Match.type<LayoutFinding>();

const keyOf = matchFinding.pipe(
  Match.tagsExhaustive({
    TextOverlap: (f) => `overlap\u0000${f.scene}\u0000${f.a}\u0000${f.b}`,
    TextOffFrame: (f) => `off\u0000${f.scene}\u0000${f.text}`,
    InkOverText: (f) => `ink\u0000${f.scene}\u0000${f.text}`,
    PlateOffFrame: (f) => `plate\u0000${f.scene}\u0000${f.text}`,
  }),
);

const edges = (f: { left: number; top: number; right: number; bottom: number }) =>
  f.left + f.top + f.right + f.bottom;

const size = matchFinding.pipe(
  Match.tagsExhaustive({
    TextOverlap: (f) => f.area,
    InkOverText: (f) => f.length,
    TextOffFrame: edges,
    PlateOffFrame: edges,
  }),
);

const withFrames = (f: LayoutFinding, frames: number): LayoutFinding => {
  const where = { scene: f.scene, time: f.time, at: f.at, frames };
  return matchFinding.pipe(
    Match.tagsExhaustive({
      TextOverlap: (o): LayoutFinding =>
        TextOverlap.make({ ...where, a: o.a, b: o.b, area: o.area }),
      InkOverText: (o): LayoutFinding =>
        InkOverText.make({
          ...where,
          text: o.text,
          strokes: o.strokes,
          length: o.length,
          x: o.x,
          y: o.y,
          w: o.w,
          h: o.h,
        }),
      TextOffFrame: (o): LayoutFinding =>
        TextOffFrame.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
      PlateOffFrame: (o): LayoutFinding =>
        PlateOffFrame.make({
          ...where,
          text: o.text,
          left: o.left,
          top: o.top,
          right: o.right,
          bottom: o.bottom,
        }),
    }),
  )(f);
};

/**
 * One finding per scene and pair of texts (or per text off the frame): the
 * sampled frame where it is worst, with how many sampled frames show it.
 */
export const mergeFindings = (
  findings: ReadonlyArray<LayoutFinding>,
): ReadonlyArray<LayoutFinding> => {
  const merged = new Map<string, LayoutFinding>();
  for (const f of findings) {
    const key = keyOf(f);
    const seen = Option.fromNullishOr(merged.get(key));
    const frames = Option.match(seen, { onNone: () => 0, onSome: (s) => s.frames }) + f.frames;
    const worst = Option.match(seen, {
      onNone: () => f,
      onSome: (s) => {
        if (size(f) > size(s)) return f;
        return s;
      },
    });
    merged.set(key, withFrames(worst, frames));
  }
  return [...merged.values()];
};
