// What `film check --short` looks for, as pure functions over a vertical
// film (a resolved short, or a talk), its phrases (`shortPhrases`) and what
// its probed frames report: text past the safe zone (`SAFE_ZONES`; a talk's
// is `platforms`, inside every platform's own), an open that does not hook
// (a late first word, nothing moving, its footage included, the film's title
// card), a loop that shows its seam (a last frame far from the first, or a
// long silence round the loop), and a length outside what holds. The
// numbers are `SHORT_RULES`, and a talk's length its format's
// (`TALK_FORMATS`). Every finding is collected; none stops the others.

import { Array as Arr, Match, Option, Order } from 'effect';
import type { Phrase } from '../core/phrases.ts';
import type { Probed, TextBox } from '../core/export-handle.ts';
import {
  PLATFORM_ZONES,
  type ResolvedShort,
  SAFE_ZONES,
  SHORT_RULES,
  type SafeZone,
  type SafeZoneName,
  roomAcross,
  safeRect,
} from '../core/shorts.ts';
import { TALK_FORMATS } from '../core/talk.ts';
import { CLOCK_EPSILON, frameAtOrAfter } from '../core/time.ts';
import { heldStill } from './check.ts';
import {
  type ShortFinding,
  ShortHook,
  ShortLength,
  ShortLoop,
  ShortUnsafeText,
} from './findings.ts';

/**
 * A vertical film the checks read: a short cut from a film (`ResolvedShort`),
 * or a talk, which names the format it is cut to (`TALK_FORMATS`).
 */
interface Vertical {
  readonly id: string;
  readonly duration: number;
  readonly format?: keyof typeof TALK_FORMATS;
}

/** The lengths `film` is held to: a talk's format's, else a short's (`SHORT_RULES`). */
const lengthsOf = (film: Vertical) =>
  Option.match(Option.fromUndefinedOr(film.format), {
    onNone: () => SHORT_RULES.length,
    onSome: (format) => {
      const { min, max } = TALK_FORMATS[format].seconds;
      return { max, from: min, to: max };
    },
  });

/** A vertical film over the most it may run, or outside the lengths that hold best. */
export const shortLength = (film: Vertical): Option.Option<ShortLength> => {
  const { max, from, to } = lengthsOf(film);
  return Option.liftPredicate(
    ShortLength.make({ short: film.id, length: film.duration, max, from, to }),
    (f) => f.length > to + CLOCK_EPSILON || f.length < from - CLOCK_EPSILON,
  );
};

/** Every word of the phrases, in order. */
const wordsOf = (phrases: ReadonlyArray<Phrase>) => phrases.flatMap((p) => p.words);

/** A first word later than the rule, or none at all. */
export const hookWord = (
  short: Vertical,
  phrases: ReadonlyArray<Phrase>,
): Option.Option<ShortHook> => {
  const at = Option.match(Arr.head(wordsOf(phrases)), {
    onNone: () => short.duration,
    onSome: (w) => w.start,
  });
  return Option.liftPredicate(
    ShortHook.make({ short: short.id, reason: 'late word', at, max: SHORT_RULES.firstWord }),
    () => at > SHORT_RULES.firstWord + CLOCK_EPSILON,
  );
};

/** The silence from the last word to the end, and from the start to the first word, over the rule. */
export const loopGap = (
  short: Vertical,
  phrases: ReadonlyArray<Phrase>,
): Option.Option<ShortLoop> => {
  const words = wordsOf(phrases);
  const gap = Option.match(Option.all([Arr.head(words), Arr.last(words)]), {
    onNone: () => short.duration,
    onSome: ([first, last]) => first.start + Math.max(0, short.duration - last.end),
  });
  return Option.liftPredicate(
    ShortLoop.make({ short: short.id, reason: 'gap', value: gap, max: SHORT_RULES.loopGap }),
    () => gap > SHORT_RULES.loopGap + CLOCK_EPSILON,
  );
};

/** What the short's words alone tell: its length, its first word, its loop's silence. */
export const shortStaticFindings = (
  short: Vertical,
  phrases: ReadonlyArray<Phrase>,
): ReadonlyArray<ShortFinding> => [
  ...Option.toArray(shortLength(short)),
  ...Option.toArray(hookWord(short, phrases)),
  ...Option.toArray(loopGap(short, phrases)),
];

/** A talk as the vertical checks read it: the film, held to its format, and the phrases its captions show. */
export interface TalkVertical {
  readonly film: Vertical;
  readonly phrases: ReadonlyArray<Phrase>;
}

/** The mean absolute per-cell difference of two luma grids of one size, 0 to 1. */
export const lumaDiff = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  return sum / n / 255;
};

/** The last frame's picture far from the first's: the loop shows a cut. */
export const loopPicture = (
  short: string,
  first: ReadonlyArray<number>,
  last: ReadonlyArray<number>,
): Option.Option<ShortLoop> => {
  const value = lumaDiff(first, last);
  return Option.liftPredicate(
    ShortLoop.make({ short, reason: 'picture', value, max: SHORT_RULES.loopDiff }),
    () => value > SHORT_RULES.loopDiff,
  );
};

/** The box a line of text covers, from its corners, in page px. */
const boxOf = (t: TextBox) => {
  const xs = t.corners.map(([x]) => x);
  const ys = t.corners.map(([, y]) => y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
};

/** Below this a line is faded out: not read, so not covered. */
const SEEN = 0.05;

const byReach = Order.mapInput(Order.Number, (f: ShortUnsafeText) => f.by);

/**
 * How far the page box `b` runs past each side of `zone`, in 1080 × 1920 px
 * (`k` page px per px), its right short of any button column it runs down
 * into (`roomAcross`); only the sides it crosses.
 */
const pastSides = (zone: SafeZone, b: ReturnType<typeof boxOf>, k: number) => {
  const safe = safeRect(zone);
  const across = roomAcross(zone, b.bottom / k);
  return [
    { side: 'top' as const, by: safe.top - b.top / k },
    { side: 'bottom' as const, by: b.bottom / k - safe.bottom },
    { side: 'left' as const, by: across.left - b.left / k },
    { side: 'right' as const, by: b.right / k - across.right },
  ].filter((p) => p.by > 0.5);
};

/**
 * The zone a finding names: the zone, and for `platforms` the platforms
 * whose own zone (`PLATFORM_ZONES`) the box runs past on `side`, so the
 * finding says whose buttons cover it.
 */
const zoneLabel = (
  zone: SafeZoneName,
  side: 'top' | 'bottom' | 'left' | 'right',
  b: ReturnType<typeof boxOf>,
  k: number,
): string => {
  if (zone !== 'platforms') return zone;
  const under = Object.values(PLATFORM_ZONES)
    .filter((p) => pastSides(p.zone, b, k).some((s) => s.side === side))
    .map((p) => p.title);
  return `${zone} (${under.join(', ')})`;
};

/**
 * The lines of a probed frame at short second `at` that cross `zone`, each
 * past its worst side, in 1080 × 1920 px; `k` is page px per such px.
 */
export const unsafeTexts = (
  short: string,
  zone: SafeZoneName,
  at: number,
  probed: Probed,
  k: number,
): ReadonlyArray<ShortUnsafeText> =>
  probed.texts
    .filter((t) => t.alpha > SEEN && t.text.trim() !== '')
    .flatMap((t) => {
      const b = boxOf(t);
      const past = pastSides(SAFE_ZONES[zone], b, k).map((p) =>
        ShortUnsafeText.make({
          short,
          zone: zoneLabel(zone, p.side, b, k),
          text: t.text,
          at,
          side: p.side,
          by: p.by,
          own: t.caption === true,
          others: 0,
        }),
      );
      return Arr.match(past, {
        onEmpty: () => [],
        onNonEmpty: (some) => [Arr.max(some, byReach)],
      });
    });

/**
 * One finding per line of the film's and side, and one per side for all the
 * short's own lines (they share one place, so one fix): the first time it
 * crosses, its furthest reach, and how many other lines crossed with it.
 */
export const mergeUnsafe = (
  found: ReadonlyArray<ShortUnsafeText>,
): ReadonlyArray<ShortUnsafeText> => {
  const merged = new Map<string, { finding: ShortUnsafeText; lines: Set<string> }>();
  for (const f of found) {
    const key = Match.value(f.own).pipe(
      Match.when(true, () => `own\u0000${f.side}`),
      Match.orElse(() => `film\u0000${f.side}\u0000${f.text}`),
    );
    const next = Option.match(Option.fromNullishOr(merged.get(key)), {
      onNone: () => ({ finding: f, lines: new Set([f.text]) }),
      onSome: (seen) => ({
        finding: ShortUnsafeText.make({
          ...seen.finding,
          at: Math.min(seen.finding.at, f.at),
          by: Math.max(seen.finding.by, f.by),
        }),
        lines: seen.lines.add(f.text),
      }),
    });
    merged.set(key, next);
  }
  return [...merged.values()].map(({ finding, lines }) =>
    ShortUnsafeText.make({ ...finding, others: lines.size - 1 }),
  );
};

/** The frames probed for motion at the open: every other one from the first to `motionBy`. */
export const openFrames = (fps: number): ReadonlyArray<number> => {
  const last = Math.round(SHORT_RULES.motionBy * fps);
  return Arr.dedupe([...Arr.makeBy(Math.floor(last / 2) + 1, (i) => i * 2), last]);
};

/** The open's frames all hold still (the hook and captions left out): nothing moves by the rule. */
export const stillOpen = (
  short: string,
  frames: ReadonlyArray<Probed>,
  at: number,
): Option.Option<ShortHook> =>
  Option.liftPredicate(
    ShortHook.make({ short, reason: 'still open', at, max: SHORT_RULES.motionBy }),
    () => frames.length > 1 && heldStill(frames),
  );

/** Words, case and punctuation aside. */
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * The first frame shows the film's title in its picture (not the short's own
 * hook): it opens on the title card. A logo drawn as ink is not told apart.
 */
export const titleOpen = (
  short: string,
  first: Probed,
  title: string,
): Option.Option<ShortHook> => {
  const want = plain(title);
  return Option.map(
    Arr.findFirst(
      first.texts,
      (t) => t.caption !== true && t.alpha > SEEN && want !== '' && plain(t.text).includes(want),
    ),
    (t) => ShortHook.make({ short, reason: 'title card', at: 0, max: 0, text: t.text }),
  );
};

/**
 * The frames the zone check probes: every half second, and each phrase's
 * first frame, so every line the film sets (a short's, a talk's) and every
 * moment of its picture is seen at least once.
 */
export const zoneFrames = (
  short: Pick<ResolvedShort, 'duration' | 'fps'>,
  phrases: ReadonlyArray<Phrase>,
): ReadonlyArray<number> => {
  const frames = Math.round(short.duration * short.fps);
  const every = Arr.makeBy(Math.ceil(short.duration * 2), (i) => Math.round(i * 0.5 * short.fps));
  const starts = phrases.map((p) => frameAtOrAfter(p.start, short.fps));
  return Arr.sort(
    Arr.dedupe([...every, ...starts].filter((f) => f >= 0 && f < frames)),
    Order.Number,
  );
};
