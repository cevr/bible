/**
 * The sticky check's frame classifier: where the home list's pinned topic
 * row sits in one recorded frame, and whether that place is one the list
 * may show.
 *
 * The check reads a narrow column of the screen left of the hymn rows'
 * separators (they start 64 pt in), where the only full-width lines are the
 * topic rows' bottom hairlines. Each frame's column is averaged across its
 * width into one grey value per pixel row (`linesIn` takes those values); a
 * run of rows that differ from the ground and is at most 2 pt thick is a
 * line.
 *
 * A frame is valid when its first line under the list's top is the pinned
 * row's hairline at rest (± 1 pt), or when the next topic row pushes it: a
 * line within one topic row under rest, and the first line one topic row
 * above that line (± 1 pt).
 */
import { Array as Arr, Option } from 'effect';

/** The layout the check judges against, in points. */
export interface Layout {
  /** The pixels per point of the recording. */
  readonly scale: number;
  /** The list's top: the safe-area inset. */
  readonly top: number;
  /** A topic row's height: `ceil(20 × fontScale) + 16`. */
  readonly topic: number;
}

/** No line under the list's top: the pinned row is not in the column. */
export interface Missing {
  readonly _tag: 'Missing';
}

/** The pinned hairline and its distance from where it belongs. */
export interface Seen {
  readonly _tag: 'Seen';
  readonly pinned: number;
  readonly pushed: boolean;
  readonly expected: number;
  readonly deviation: number;
}

/** What one frame shows. */
export type Verdict = Missing | Seen;

/** How far a line may sit from its place and still be in it, in points. */
export const TOLERANCE = 1;

/** The middle of `values` (the upper middle of an even count). */
const median = (values: ReadonlyArray<number>) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The centres of the thin lines in one frame's column, in points from the
 * screen's top. `rows` holds one grey value per pixel row; a row is off the
 * ground when it differs from the column's median by more than `threshold`.
 */
export const linesIn = (
  rows: ReadonlyArray<number>,
  scale: number,
  threshold = 5,
): ReadonlyArray<number> => {
  const ground = median(rows);
  const lines: Array<number> = [];
  let start = -1;
  for (let y = 0; y <= rows.length; y++) {
    const off = y < rows.length && Math.abs((rows[y] ?? ground) - ground) > threshold;
    if (off && start === -1) start = y;
    if (!off && start !== -1) {
      if (y - start <= 2 * scale) lines.push(round2((start + y - 1) / 2 / scale));
      start = -1;
    }
  }
  return lines;
};

/**
 * The pinned hairline's rest place: the last pixel row of the topic row
 * that ends at the list's top plus one topic row, as a line centre.
 */
export const restOf = (layout: Layout) =>
  round2((Math.round((layout.top + layout.topic) * layout.scale) - 1) / layout.scale);

/**
 * Judge one frame's lines. The first line at or under the list's top is the
 * pinned row's hairline. When a later line lies within one topic row under
 * rest, the next topic row is pushing: the pinned hairline belongs one topic
 * row above the line that fits it best. Lines between the two (a hymn
 * separator crossing the column) are passed over.
 */
export const judge = (lines: ReadonlyArray<number>, layout: Layout): Verdict => {
  const rest = restOf(layout);
  const [first, ...later] = lines.filter((line) => line >= layout.top);
  return Option.match(Option.fromUndefinedOr(first), {
    onNone: (): Verdict => ({ _tag: 'Missing' }),
    onSome: (pinned): Verdict => {
      const pushedPlace = Arr.head(
        later
          .filter((line) => line < rest + layout.topic + TOLERANCE)
          .map((line) => line - layout.topic)
          .toSorted((a, b) => Math.abs(a - pinned) - Math.abs(b - pinned)),
      );
      const atRest = Math.abs(pinned - rest) <= TOLERANCE;
      const pushed = Option.filter(
        pushedPlace,
        (place) => !atRest && Math.abs(pinned - place) <= TOLERANCE,
      );
      const expected = Option.getOrElse(pushed, () => rest);
      return {
        _tag: 'Seen',
        pinned,
        pushed: Option.isSome(pushed),
        expected,
        deviation: round2(pinned - expected),
      };
    },
  });
};

/** One pass's numbers: the line the check prints. */
export interface Summary {
  readonly frames: number;
  readonly judged: number;
  readonly missing: number;
  readonly off: number;
  readonly worst: number;
}

/** The summary of a pass's verdicts. */
export const summarize = (verdicts: ReadonlyArray<Verdict>): Summary => {
  const deviations = verdicts
    .filter((verdict): verdict is Seen => verdict._tag === 'Seen')
    .map((verdict) => Math.abs(verdict.deviation));
  return {
    frames: verdicts.length,
    judged: deviations.length,
    missing: verdicts.length - deviations.length,
    off: deviations.filter((deviation) => deviation > TOLERANCE).length,
    worst: round2(Math.max(0, ...deviations)),
  };
};

/** A pass holds when no frame is off, the worst is within 1 pt, and at least 95% of frames were judged. */
export const holds = (summary: Summary) =>
  summary.off === 0 && summary.worst <= TOLERANCE && summary.judged >= 0.95 * summary.frames;
