// What `film check --short` looks for, as pure functions over a resolved
// short, its phrases (`shortPhrases`) and what its probed frames report: text
// past the safe zone (`SAFE_ZONES`), an open that does not hook (a late first
// word, nothing moving, the film's title card), a loop that shows its seam (a
// last frame far from the first, or a long silence round the loop), and a
// length outside what holds. The numbers are `SHORT_RULES`. Every finding is
// collected; none stops the others.

import { Array as Arr, Match, Option, Order } from 'effect';
import type { Phrase } from '../core/phrases.ts';
import type { Probed, TextBox } from '../core/schema.ts';
import {
  type ResolvedShort,
  SAFE_ZONES,
  SHORT_RULES,
  type SafeZoneName,
  safeRect,
} from '../core/shorts.ts';
import { heldStill } from './check.ts';
import {
  type ShortFinding,
  ShortHook,
  ShortLength,
  ShortLoop,
  ShortUnsafeText,
} from './findings.ts';

/** A short over the most it may run, or outside the lengths that hold best. */
export const shortLength = (short: ResolvedShort): Option.Option<ShortLength> => {
  const { max, from, to } = SHORT_RULES.length;
  return Option.liftPredicate(
    ShortLength.make({ short: short.id, length: short.duration, max, from, to }),
    (f) => f.length > to + 1e-9 || f.length < from - 1e-9,
  );
};

/** Every word of the phrases, in order. */
const wordsOf = (phrases: ReadonlyArray<Phrase>) => phrases.flatMap((p) => p.words);

/** A first word later than the rule, or none at all. */
export const hookWord = (
  short: ResolvedShort,
  phrases: ReadonlyArray<Phrase>,
): Option.Option<ShortHook> => {
  const at = Option.match(Arr.head(wordsOf(phrases)), {
    onNone: () => short.duration,
    onSome: (w) => w.start,
  });
  return Option.liftPredicate(
    ShortHook.make({ short: short.id, reason: 'late word', at, max: SHORT_RULES.firstWord }),
    () => at > SHORT_RULES.firstWord + 1e-9,
  );
};

/** The silence from the last word to the end, and from the start to the first word, over the rule. */
export const loopGap = (
  short: ResolvedShort,
  phrases: ReadonlyArray<Phrase>,
): Option.Option<ShortLoop> => {
  const words = wordsOf(phrases);
  const gap = Option.match(Option.all([Arr.head(words), Arr.last(words)]), {
    onNone: () => short.duration,
    onSome: ([first, last]) => first.start + Math.max(0, short.duration - last.end),
  });
  return Option.liftPredicate(
    ShortLoop.make({ short: short.id, reason: 'gap', value: gap, max: SHORT_RULES.loopGap }),
    () => gap > SHORT_RULES.loopGap + 1e-9,
  );
};

/** What the short's words alone tell: its length, its first word, its loop's silence. */
export const shortStaticFindings = (
  short: ResolvedShort,
  phrases: ReadonlyArray<Phrase>,
): ReadonlyArray<ShortFinding> => [
  ...Option.toArray(shortLength(short)),
  ...Option.toArray(hookWord(short, phrases)),
  ...Option.toArray(loopGap(short, phrases)),
];

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
 * The lines of a probed frame at short second `at` that cross `zone`, each
 * past its worst side, in 1080 × 1920 px; `k` is page px per such px.
 */
export const unsafeTexts = (
  short: string,
  zone: SafeZoneName,
  at: number,
  probed: Probed,
  k: number,
): ReadonlyArray<ShortUnsafeText> => {
  const safe = safeRect(SAFE_ZONES[zone]);
  return probed.texts
    .filter((t) => t.alpha > SEEN && t.text.trim() !== '')
    .flatMap((t) => {
      const b = boxOf(t);
      const past = [
        { side: 'top' as const, by: safe.top - b.top / k },
        { side: 'bottom' as const, by: b.bottom / k - safe.bottom },
        { side: 'left' as const, by: safe.left - b.left / k },
        { side: 'right' as const, by: b.right / k - safe.right },
      ]
        .filter((p) => p.by > 0.5)
        .map((p) =>
          ShortUnsafeText.make({
            short,
            zone,
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
};

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
 * first frame, so every line the short sets and every moment of the band is
 * seen at least once.
 */
export const zoneFrames = (
  short: ResolvedShort,
  phrases: ReadonlyArray<Phrase>,
): ReadonlyArray<number> => {
  const frames = Math.round(short.duration * short.fps);
  const every = Arr.makeBy(Math.ceil(short.duration * 2), (i) => Math.round(i * 0.5 * short.fps));
  const starts = phrases.map((p) => Math.ceil(p.start * short.fps - 1e-6));
  return Arr.sort(
    Arr.dedupe([...every, ...starts].filter((f) => f >= 0 && f < frames)),
    Order.Number,
  );
};
