// The look pass, as pure functions: every scene drawn small at 2 fps (a
// 64×36 thumb per sample, and the faces the kit declared), measured for what a
// viewer across the room sees. How much of a scene holds still (`HeldShare`),
// the light of each scene and act against the film's declared colour script
// (`ColourScript`), whether a face ever reaches human scale (`FaceSmall`), how
// the hands the kit declared move (`HandJump`, `HandFar`, `HandHidden`), and
// the YouTube chapters the declared acts name. `looker.ts` draws the samples.

import { Array as Arr, Option, Order, Result } from 'effect';
import { type Placed, filmEnd } from '../core/layout.ts';
import type { Stretch } from '../core/acts.ts';
import { type AddressError, resolveAddress } from '../core/address.ts';
import type { Act, FaceMark, HandMark } from '../core/schema.ts';
import { ChaptersInvalid } from './errors.ts';
import {
  ColourScript,
  FaceSmall,
  HandFar,
  HandHidden,
  HandJump,
  HeldShare,
  type LookFinding,
} from './findings.ts';
import type { LoadedFilm } from './film-repo.ts';

/** A thumb's size: the research's measure (a 64×36 grey frame, research #1). */
export const THUMB_W = 64;
export const THUMB_H = 36;
/** Bytes in one RGBA thumb. */
export const THUMB_BYTES = THUMB_W * THUMB_H * 4;
/** Seconds between samples: 2 fps. */
export const LOOK_STEP = 0.5;
/** A step whose mean grey difference is under this barely changes (paper grain alone scores 0.5–2). */
export const HELD_DIFF = 2;
/** The most of a scene's seconds that may hold still (CRAFT rule 5). */
export const HELD_MAX = 0.4;
/** A frame darker than this mean luma counts as dark (CRAFT rule 11). */
export const DARK_LUMA = 60;
/** A face at human scale fills this share of the frame's height (CRAFT rule 5). */
export const FACE_SHARE = 1 / 3;
/** How many colours the report names per scene or act. */
const HUES = 5;
/** Colour bins: 8 levels a channel. */
const BIN_BITS = 3;
const BINS = 1 << (3 * BIN_BITS);

/** One frame the look pass draws: in a scene, at film time `T`. */
export interface LookSample {
  readonly scene: string;
  readonly frame: number;
  readonly T: number;
}

/** A drawn sample: its thumb (RGBA, `THUMB_BYTES`) and the faces and hands it declared. */
export interface Drawn {
  readonly thumb: Uint8Array;
  readonly faces: ReadonlyArray<FaceMark>;
  readonly hands: ReadonlyArray<HandMark>;
}

/** Every scene's samples, `LOOK_STEP` apart from its start, in film order. */
export const lookSamples = (
  placed: ReadonlyArray<Placed>,
  fps: number,
  frames: number,
): ReadonlyArray<LookSample> =>
  placed.flatMap((p) =>
    Arr.makeBy(Math.max(1, Math.ceil(p.dur / LOOK_STEP - 1e-9)), (k) => {
      const T = p.start + k * LOOK_STEP;
      return { scene: p.spec.id, frame: Math.min(frames - 1, Math.round(T * fps)), T };
    }),
  );

/** The light of a run of frames, summed so scenes add up to acts and the film. */
export interface Light {
  readonly frames: number;
  readonly luma: number;
  readonly dark: number;
  readonly saturation: number;
  /** Per colour bin: count, then red, green and blue sums. */
  readonly bins: Float64Array;
}

/** A light still being summed. */
type Sum = { -readonly [K in keyof Light]: Light[K] };

const emptyLight = (): Sum => ({
  frames: 0,
  luma: 0,
  dark: 0,
  saturation: 0,
  bins: new Float64Array(BINS * 4),
});

/** `a` and `b` summed. */
const addLight = (a: Light, b: Light): Light => {
  const bins = new Float64Array(BINS * 4);
  for (let i = 0; i < bins.length; i++) bins[i] = (a.bins[i] ?? 0) + (b.bins[i] ?? 0);
  return {
    frames: a.frames + b.frames,
    luma: a.luma + b.luma,
    dark: a.dark + b.dark,
    saturation: a.saturation + b.saturation,
    bins,
  };
};

/** The colour bin of one pixel. */
const binOf = (r: number, g: number, b: number) =>
  ((r >> (8 - BIN_BITS)) << (2 * BIN_BITS)) |
  ((g >> (8 - BIN_BITS)) << BIN_BITS) |
  (b >> (8 - BIN_BITS));

/** One thumb's grey (Rec. 601 luma per pixel), and its light added into `into`. */
const readThumb = (thumb: Uint8Array, into: Sum): Float32Array => {
  const px = THUMB_W * THUMB_H;
  const grey = new Float32Array(px);
  let luma = 0;
  let saturation = 0;
  for (let i = 0; i < px; i++) {
    const r = thumb[i * 4] ?? 0;
    const g = thumb[i * 4 + 1] ?? 0;
    const b = thumb[i * 4 + 2] ?? 0;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    grey[i] = y;
    luma += y;
    const hi = Math.max(r, g, b);
    // Black has no hue: its spread is 0, over 1.
    saturation += (hi - Math.min(r, g, b)) / Math.max(1, hi);
    const bin = binOf(r, g, b) * 4;
    into.bins[bin] = (into.bins[bin] ?? 0) + 1;
    into.bins[bin + 1] = (into.bins[bin + 1] ?? 0) + r;
    into.bins[bin + 2] = (into.bins[bin + 2] ?? 0) + g;
    into.bins[bin + 3] = (into.bins[bin + 3] ?? 0) + b;
  }
  into.frames += 1;
  into.luma += luma / px;
  into.saturation += saturation / px;
  into.dark += Number(luma / px < DARK_LUMA);
  return grey;
};

/** Mean absolute difference of two greys. */
const greyDiff = (a: Float32Array, b: Float32Array): number => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / Math.max(1, a.length);
};

/** One scene's look. */
export interface SceneLook {
  readonly scene: string;
  readonly start: number;
  readonly dur: number;
  /** The voice speaks in it, and it is drawn (no storyboard card): the rules on stillness and faces hold. */
  readonly judged: boolean;
  readonly light: Light;
  /** Whole seconds measured for stillness, and how many held. */
  readonly seconds: number;
  readonly held: number;
  /** The longest held run, film seconds; empty (from = to) when none held. */
  readonly heldFrom: number;
  readonly heldTo: number;
  /** The largest face centred on the frame, px on screen; 0 when none. */
  readonly face: number;
}

/** What the look pass measured: each scene's look, the frame's height in px, and the hands. */
export interface Looked {
  readonly looks: ReadonlyArray<SceneLook>;
  readonly height: number;
  /** Hands that jump between adjacent frames (the hands pass). */
  readonly jumps: ReadonlyArray<HandJump>;
  /** Hands at work past their figure's reach. */
  readonly far: ReadonlyArray<HandFar>;
  /** Acting hands lost behind their own bodies. */
  readonly hidden: ReadonlyArray<HandHidden>;
}

/**
 * Which of a scene's seconds hold still: second `s` holds when the smaller of
 * its two steps (sample 2s → 2s+1 → 2s+2) changes under `HELD_DIFF`.
 */
export const heldSeconds = (greys: ReadonlyArray<Float32Array>): ReadonlyArray<boolean> => {
  const steps = Arr.makeBy(Math.max(0, greys.length - 1), (k) =>
    greyDiff(greys[k] ?? new Float32Array(), greys[k + 1] ?? new Float32Array()),
  );
  return Arr.makeBy(
    Math.floor(steps.length / 2),
    (s) => Math.min(steps[2 * s] ?? Infinity, steps[2 * s + 1] ?? Infinity) < HELD_DIFF,
  );
};

/** The longest run of `true` in `held`, as [first, end) indices. */
const longestRun = (held: ReadonlyArray<boolean>): readonly [number, number] => {
  let best: readonly [number, number] = [0, 0];
  let from = -1;
  for (let i = 0; i <= held.length; i++) {
    const still = i < held.length && held[i] === true;
    if (still && from < 0) from = i;
    if (!still && from >= 0) {
      if (i - from > best[1] - best[0]) best = [from, i];
      from = -1;
    }
  }
  return best;
};

/** The frame a film draws, in canvas pixels. */
export interface FrameSize {
  readonly width: number;
  readonly height: number;
}

/** A face the viewer sees: its scene's own, mostly opaque, and centred on the frame. */
const seenFace = (f: FaceMark, scene: string, frame: FrameSize) =>
  f.scene === scene &&
  f.alpha > 0.5 &&
  f.x >= 0 &&
  f.x <= frame.width &&
  f.y >= 0 &&
  f.y <= frame.height;

/** Each scene's look from its drawn samples, in film order; `frame` is the canvas the faces were marked on. */
export const sceneLooks = (
  placed: ReadonlyArray<Placed>,
  samples: ReadonlyArray<LookSample>,
  drawn: ReadonlyArray<Drawn>,
  frame: FrameSize,
): ReadonlyArray<SceneLook> => {
  const pairs = Arr.zip(samples, drawn);
  return placed.map((p) => {
    const light = emptyLight();
    const mine = pairs.filter(([s]) => s.scene === p.spec.id).map(([, d]) => d);
    const greys = mine.map((d) => readThumb(d.thumb, light));
    const face = Math.max(
      0,
      ...mine.flatMap((d) =>
        d.faces.filter((f) => seenFace(f, p.spec.id, frame)).map((f) => f.size),
      ),
    );
    const held = heldSeconds(greys);
    const [a, b] = longestRun(held);
    return {
      scene: p.spec.id,
      start: p.start,
      dur: p.dur,
      judged: p.voice.duration > 0 && p.spec.storyboard !== true,
      light,
      seconds: held.length,
      held: held.filter(Boolean).length,
      heldFrom: p.start + a,
      heldTo: p.start + b,
      face,
    };
  });
};

/** Scenes that hold still for more than `HELD_MAX` of their seconds. */
export const heldShares = (looks: ReadonlyArray<SceneLook>): ReadonlyArray<HeldShare> =>
  looks
    .filter((l) => l.judged && l.seconds > 0 && l.held / l.seconds > HELD_MAX)
    .map((l) =>
      HeldShare.make({
        scene: l.scene,
        share: l.held / l.seconds,
        max: HELD_MAX,
        from: l.heldFrom,
        to: l.heldTo,
      }),
    );

/** Scenes whose largest face never reaches `FACE_SHARE` of a frame `height` px tall. */
export const smallFaces = (
  looks: ReadonlyArray<SceneLook>,
  height: number,
): ReadonlyArray<FaceSmall> =>
  looks
    .filter((l) => l.judged && l.face < height * FACE_SHARE)
    .map((l) => FaceSmall.make({ scene: l.scene, largest: l.face, min: height * FACE_SHARE }));

/**
 * The most a hand may move about its shoulder between adjacent frames, in its
 * own lengths: more, and one frame's hand no longer meets the next one's, so
 * the eye sees it pop, not travel (`HandJump`).
 */
export const HAND_JUMP = 1.5;
/** The most a hand's size may change between adjacent frames, as a share of it (`HandJump`). */
export const SIZE_JUMP = 0.25;
/** A hand is seen at this opacity or more. */
export const HAND_SEEN = 0.5;
/**
 * A hand is at work once it has travelled this far: at its target, not on
 * its way there. A far hand going to work in front of its body passes behind
 * it on the way; that is travel (`HandJump` judges it), not a hand hidden.
 */
export const HAND_AT_WORK = 0.9;
/** A hand a frame on is the same hand when its shoulder moved at most this many px. */
export const SHOULDER_MATCH = 24;

/** One frame drawn for its hands: in a scene, frame `frame` at film time `T`. */
export interface HandFrame {
  readonly scene: string;
  readonly frame: number;
  readonly T: number;
  readonly hands: ReadonlyArray<HandMark>;
}

/**
 * The frames the hands pass draws: every frame between two adjacent samples
 * of a scene across which any hand travels to or from its work, or comes or
 * goes at work; each once, in film order. A hand bobbing at rest draws none.
 */
export const handSpans = (
  frames: ReadonlyArray<HandFrame>,
  fps: number,
): ReadonlyArray<LookSample> => {
  const drawn = new Map<number, LookSample>();
  for (const [a, b] of pairs(frames)) {
    if (a.scene !== b.scene || !handsTravel(ownHands(a), ownHands(b))) continue;
    for (let frame = a.frame; frame <= b.frame; frame++)
      if (!drawn.has(frame)) drawn.set(frame, { scene: a.scene, frame, T: frame / fps });
  }
  return Arr.sort(
    [...drawn.values()],
    Order.mapInput(Order.Number, (s: LookSample) => s.frame),
  );
};

/**
 * How `now` jumped from `was`, a frame on, if it did: about its shoulder by
 * more than `HAND_JUMP` of its length, or in size against its figure's reach
 * by more than `SIZE_JUMP`. Both are measured in the hand's own terms, so a
 * camera's pan or zoom, or its whole figure scaled, is no jump.
 */
const jumpOf = (
  was: HandMark,
  now: HandMark,
): Option.Option<{
  readonly what: HandJump['what'];
  readonly by: number;
  readonly max: number;
}> => {
  if (was.size <= 0 || now.size <= 0) return Option.none();
  // Each frame in its figure's own measure (its reach, always longer than its
  // hand; the hand's length when it declares none), so a zoom or the figure
  // scaled changes nothing.
  const wasUnit = Math.max(was.radius, was.size);
  const nowUnit = Math.max(now.radius, now.size);
  const length = (was.size / wasUnit + now.size / nowUnit) / 2;
  const moved =
    Math.hypot(
      (now.x - now.sx) / nowUnit - (was.x - was.sx) / wasUnit,
      (now.y - now.sy) / nowUnit - (was.y - was.sy) / wasUnit,
    ) / length;
  if (moved > HAND_JUMP) return Option.some({ what: 'place', by: moved, max: HAND_JUMP });
  const was1 = was.size / wasUnit;
  const now1 = now.size / nowUnit;
  const grew = Math.abs(now1 - was1) / Math.max(was1, now1);
  return Option.filter(
    Option.some({ what: 'size' as const, by: grew, max: SIZE_JUMP }),
    (jump) => jump.by > SIZE_JUMP,
  );
};

/**
 * Each hand that jumps between two adjacent frames of its scene: moves about
 * its shoulder more than `HAND_JUMP` of its length, or changes size against
 * its figure's reach by more than `SIZE_JUMP`. A camera's pan or zoom, or
 * the whole figure scaled, carries hand, shoulder and reach together, so it
 * is no jump.
 */
export const handJumps = (frames: ReadonlyArray<HandFrame>): ReadonlyArray<HandJump> =>
  pairs(frames)
    .filter(([a, b]) => a.scene === b.scene && b.frame === a.frame + 1)
    .flatMap(([a, b]) =>
      ownHands(a).flatMap((was) =>
        Option.toArray(
          Option.filter(
            sameHand(was, ownHands(b)),
            (now) => Math.max(was.alpha, now.alpha) >= HAND_SEEN,
          ),
        ).flatMap((now) =>
          Option.toArray(jumpOf(was, now)).map((jump) =>
            HandJump.make({ scene: b.scene, side: now.side, T: b.T, ...jump }),
          ),
        ),
      ),
    );

/** One finding per scene and side from the frames whose hands `pick` keeps, with each hand's measure. */
const perHand = (frames: ReadonlyArray<HandFrame>, pick: (h: HandMark) => Option.Option<number>) =>
  Object.values(
    Arr.groupBy(
      frames.flatMap((f) =>
        ownHands(f).flatMap((h) =>
          Option.toArray(pick(h)).map((by) => ({ scene: f.scene, side: h.side, T: f.T, by })),
        ),
      ),
      (s) => `${s.scene}\u0000${s.side}`,
    ),
  ).map((group) => ({
    scene: group[0].scene,
    side: group[0].side,
    from: Math.min(...group.map((s) => s.T)),
    to: Math.max(...group.map((s) => s.T)),
    worst: Math.max(...group.map((s) => s.by)),
    frames: group.length,
  }));

/** How far past its figure's reach a hand works, seen and on its way or at work: its target's distance over the reach. */
const pastReach = (h: HandMark): Option.Option<number> =>
  Option.filter(
    Option.some(Math.hypot(h.tx - h.sx, h.ty - h.sy) / h.radius),
    (out) => h.reach > 0 && h.alpha >= HAND_SEEN && h.radius > 0 && out > 1,
  );

/**
 * Each scene's hands that go to work past their figure's reach (their
 * target farther from the shoulder than the reach), seen: one finding per
 * scene and side, with the farthest.
 */
export const farHands = (frames: ReadonlyArray<HandFrame>): ReadonlyArray<HandFar> =>
  perHand(frames, pastReach).map((g) => HandFar.make(g));

/** A hand at work, seen, inside its own body and drawn behind it. */
const hidden = (h: HandMark): Option.Option<number> =>
  Option.filter(
    Option.some(1),
    () => h.reach >= HAND_AT_WORK && h.alpha >= HAND_SEEN && h.inside && !h.over,
  );

/**
 * Each scene's hands at work (travelled past `HAND_AT_WORK`, seen past
 * `HAND_SEEN`) inside their own body's silhouette and drawn behind it: one
 * finding per scene and side.
 */
export const hiddenHands = (frames: ReadonlyArray<HandFrame>): ReadonlyArray<HandHidden> =>
  perHand(frames, hidden).map(({ scene, side, from, to, frames }) =>
    HandHidden.make({ scene, side, from, to, frames }),
  );

/** Each frame with the next. */
const pairs = <A>(xs: ReadonlyArray<A>): ReadonlyArray<readonly [A, A]> => Arr.zip(xs, xs.slice(1));

/** A frame's hands that belong to its own scene (not the other of a transition). */
const ownHands = (f: HandFrame) => f.hands.filter((h) => h.scene === f.scene);

/** The hand among `next` that is `h`: the same side, its shoulder nearest and within `SHOULDER_MATCH`. */
const sameHand = (h: HandMark, next: ReadonlyArray<HandMark>): Option.Option<HandMark> =>
  Arr.head(
    Arr.sort(
      next
        .map((n) => [n, Math.hypot(n.sx - h.sx, n.sy - h.sy)] as const)
        .filter(([n, d]) => n.side === h.side && d <= SHOULDER_MATCH),
      Order.mapInput(Order.Number, ([, d]: readonly [HandMark, number]) => d),
    ).map(([n]) => n),
  );

/** A reach moved less than this is held. */
const REACH_HELD = 1e-3;
/** A target moved about its shoulder less than this share of its hand's length is held. */
const TARGET_HELD = 0.1;

/** Whether `h` has changed its work by `n`: travelled, or its target moved about its shoulder (a new target, what it holds moving). */
const worksOn = (h: HandMark, n: HandMark) =>
  Math.abs(n.reach - h.reach) > REACH_HELD ||
  (Math.max(h.reach, n.reach) > 0 &&
    Math.hypot(n.tx - n.sx - (h.tx - h.sx), n.ty - n.sy - (h.ty - h.sy)) >
      TARGET_HELD * Math.max(h.size, n.size));

/** Whether any hand travels or changes its work from `was` to `now`, or one comes or goes at work. */
const handsTravel = (was: ReadonlyArray<HandMark>, now: ReadonlyArray<HandMark>) =>
  was.some((h) =>
    Option.match(sameHand(h, now), {
      onNone: () => h.reach > 0,
      onSome: (n) => worksOn(h, n),
    }),
  ) || now.some((h) => h.reach > 0 && Option.isNone(sameHand(h, was)));

/** An act laid over the film (`stretchesOf`): its declaration and the scenes it holds. */
export type ActSpan = Stretch<Act>;

/** The light of `looks` summed. */
export const lightOf = (looks: ReadonlyArray<SceneLook>): Light =>
  looks.reduce((sum, l) => addLight(sum, l.light), emptyLight());

/** The looks of `scenes`. */
const within = (looks: ReadonlyArray<SceneLook>, scenes: ReadonlyArray<string>) =>
  looks.filter((l) => scenes.includes(l.scene));

/** A light's mean luma (0–255), dark share (0–1) and mean saturation (0–1). */
export const measures = (light: Light) => {
  const n = Math.max(1, light.frames);
  return { luma: light.luma / n, dark: light.dark / n, saturation: light.saturation / n };
};

/** A light's commonest colours, each as `#rrggbb` (its bin's mean) and its share of pixels. */
export const hues = (light: Light): ReadonlyArray<readonly [string, number]> => {
  let total = 0;
  const found: Array<readonly [number, number]> = [];
  for (let bin = 0; bin < BINS; bin++) {
    const n = light.bins[bin * 4] ?? 0;
    total += n;
    if (n > 0) found.push([bin, n]);
  }
  const hex = (sum: number, n: number) =>
    Math.round(sum / n)
      .toString(16)
      .padStart(2, '0');
  return found
    .sort((a, b) => b[1] - a[1])
    .slice(0, HUES)
    .map(([bin, n]) => [
      `#${hex(light.bins[bin * 4 + 1] ?? 0, n)}${hex(light.bins[bin * 4 + 2] ?? 0, n)}${hex(light.bins[bin * 4 + 3] ?? 0, n)}`,
      n / Math.max(1, total),
    ]);
};

/** One declared target: a measure and the [low, high] range it should fall in. */
type Target = readonly [ColourScript['measure'], readonly [number, number]];

/** An act's declared targets, each measure with its [low, high] range. */
const targetsOf = (act: Act): ReadonlyArray<Target> => {
  const targets: ReadonlyArray<Option.Option<Target>> = [
    Option.map(Option.fromNullishOr(act.luma), (range) => ['luma', range]),
    Option.map(Option.fromNullishOr(act.saturation), (range) => ['saturation', range]),
    Option.map(Option.fromNullishOr(act.dark), (max) => ['dark', [0, max]]),
  ];
  return targets.flatMap(Option.toArray);
};

/** Each declared act's measure outside its target. */
export const colourScript = (
  acts: ReadonlyArray<ActSpan>,
  looks: ReadonlyArray<SceneLook>,
): ReadonlyArray<ColourScript> =>
  acts.flatMap(({ part: act, scenes }) => {
    const m = measures(lightOf(within(looks, scenes)));
    return targetsOf(act)
      .filter(([measure, [low, high]]) => m[measure] < low || m[measure] > high)
      .map(([measure, [low, high]]) =>
        ColourScript.make({ act: act.name, measure, value: m[measure], low, high }),
      );
  });

/**
 * What the look pass finds: scenes held still, faces never at human scale,
 * each of `acts` outside its colour script, and hands that jump, work out of
 * reach or are lost in their bodies. The check levels them (`levelOf`: all
 * warnings). Pass no acts for a part of the film: an act measured on some of
 * its scenes is not the act.
 */
export const lookFindings = (
  looked: Looked,
  acts: ReadonlyArray<ActSpan>,
): ReadonlyArray<LookFinding> => [
  ...heldShares(looked.looks),
  ...smallFaces(looked.looks, looked.height),
  ...colourScript(acts, looked.looks),
  ...looked.jumps,
  ...looked.far,
  ...looked.hidden,
];

const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(4);

/** `part` of `whole` as a percentage, or a dash when there is no whole. */
const shareOf = (part: number, whole: number) =>
  Option.match(
    Option.liftPredicate(whole, (n) => n > 0),
    {
      onNone: () => '   -',
      onSome: (n) => pct(part / n),
    },
  );

/** One report line for a light: luma, dark share, saturation and its colours. */
const lightLine = (light: Light) => {
  const m = measures(light);
  const colours = hues(light)
    .map(([hex, share]) => `${hex} ${Math.round(share * 100)}%`)
    .join(', ');
  return `luma=${m.luma.toFixed(0).padStart(3)} dark=${pct(m.dark)} sat=${m.saturation.toFixed(2)} hues=${colours}`;
};

/** An act's targets as the report writes them, e.g. ` target=luma 90–110, dark ≤5%`. */
const targetLine = (act: Act) => {
  const shown = targetsOf(act).map(([measure, [low, high]]) =>
    Option.match(
      Option.liftPredicate(measure, (m) => m === 'dark'),
      {
        onNone: () => `${measure} ${low}–${high}`,
        onSome: () => `dark ≤${Math.round(high * 100)}%`,
      },
    ),
  );
  return Arr.match(shown, { onEmpty: () => '', onNonEmpty: (ts) => ` target=${ts.join(', ')}` });
};

/**
 * The look-book's numbers, one line each: every scene (light, held share and
 * longest held run, largest face), every declared act against its target,
 * and the film.
 */
export const lookLines = (
  looks: ReadonlyArray<SceneLook>,
  acts: ReadonlyArray<ActSpan>,
): ReadonlyArray<string> => {
  const judged = looks.filter((l) => l.judged);
  const seconds = judged.reduce((n, l) => n + l.seconds, 0);
  const held = judged.reduce((n, l) => n + l.held, 0);
  return [
    ...looks.map(
      (l) =>
        `scene=${l.scene.padEnd(11)} secs=${l.dur.toFixed(1).padStart(5)} held=${shareOf(l.held, l.seconds)} longest=${(l.heldTo - l.heldFrom).toFixed(0).padStart(2)}s face=${l.face.toFixed(0).padStart(4)}px ${lightLine(l.light)}`,
    ),
    ...acts.map(
      ({ part: act, start, end, scenes }) =>
        `act="${act.name}" ${start.toFixed(1)}–${end.toFixed(1)}s ${lightLine(lightOf(within(looks, scenes)))}${targetLine(act)}`,
    ),
    `film held=${shareOf(held, seconds)} ${lightLine(lightOf(looks))}`,
  ];
};

/** YouTube's rules for chapters (research #43): the first at 0:00, at least 3, each at least 10 s. */
export const CHAPTERS_MIN = 3;
export const CHAPTER_MIN_SECS = 10;

/** `secs` as YouTube writes a chapter's start: `mm:ss`, or `h:mm:ss` past an hour. */
export const chapterTime = (secs: number): string => {
  const s = Math.floor(secs);
  const h = Math.floor(s / 3600);
  const mmss = `${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return Option.match(
    Option.liftPredicate(h, (n) => n > 0),
    {
      onNone: () => mmss,
      onSome: (hours) => `${hours}:${mmss}`,
    },
  );
};

/**
 * The film's YouTube chapters, one `mm:ss title` line each: every declared
 * act that names a chapter, at its first scene's start. Fails unless they
 * make chapters YouTube accepts.
 */
export const chapters = (
  film: string,
  acts: ReadonlyArray<ActSpan>,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<string>, ChaptersInvalid> => {
  const named = acts.flatMap(({ part: act, start }) =>
    Option.toArray(Option.map(Option.fromNullishOr(act.chapter), (title) => ({ start, title }))),
  );
  const invalid = (reason: string) => Result.fail(ChaptersInvalid.make({ film, reason }));
  if (named.length < CHAPTERS_MIN)
    return invalid(`${named.length} acts name a chapter; YouTube needs ${CHAPTERS_MIN} or more`);
  const first = named[0]?.start ?? 0;
  if (first > 1e-6) return invalid(`the first chapter starts at ${chapterTime(first)}, not 00:00`);
  const end = filmEnd(placed);
  const short = Arr.findFirst(
    named,
    (c, i) => (named[i + 1]?.start ?? end) - c.start < CHAPTER_MIN_SECS,
  );
  if (Option.isSome(short))
    return invalid(`"${short.value.title}" runs under ${CHAPTER_MIN_SECS}s`);
  return Result.succeed(named.map((c) => `${chapterTime(c.start)} ${c.title}`));
};

/**
 * A film's chapters from the acts of its whole (`resolveAddress`): `film
 * chapters` prints them, a full render writes them.
 */
export const filmChapters = (
  film: LoadedFilm,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<string>, AddressError | ChaptersInvalid> =>
  Result.flatMap(
    resolveAddress(
      { name: film.paths.name, placed, look: film.look, shorts: film.shorts },
      { _tag: 'Film' },
    ),
    (whole) => chapters(film.paths.name, whole.acts, placed),
  );
