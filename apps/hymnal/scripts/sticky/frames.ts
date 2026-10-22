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
 *
 * A frame where a hymn page covers the list (the `push` pass) is not the
 * list's to judge. `listShows` finds the list by a second column, right of
 * the hymn titles, where the list draws only its rows' separators and topic
 * hairlines: lines that keep the rows' pitch.
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
  /** A hymn row's height: `ceil(22 × fontScale) + 22`. */
  readonly hymn: number;
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

/** The list does not stand in the frame: a hymn page covers it, or slides over it. */
export interface Covered {
  readonly _tag: 'Covered';
}

/** What one frame shows. */
export type Verdict = Missing | Seen | Covered;

/** How many row pitches in a row make a column the list's. */
export const PITCHES = 3;

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

/**
 * Whether the list stands in a frame, from the lines of a column right of
 * the hymn titles (`linesIn`): at least `PITCHES` gaps in a row under the
 * list's top, each a hymn row's or a topic row's height (± 1 pt).
 */
export const listShows = (lines: ReadonlyArray<number>, layout: Layout) => {
  const under = lines.filter((line) => line >= layout.top);
  const pitch = (gap: number) =>
    Math.abs(gap - layout.hymn) <= TOLERANCE || Math.abs(gap - layout.topic) <= TOLERANCE;
  let run = 0;
  let longest = 0;
  for (let i = 1; i < under.length; i++) {
    if (pitch((under[i] ?? 0) - (under[i - 1] ?? 0))) run += 1;
    else run = 0;
    longest = Math.max(longest, run);
  }
  return longest >= PITCHES;
};

/** One pass's numbers: the line the check prints. */
export interface Summary {
  readonly frames: number;
  /** The frames where the list stands: every frame but the covered ones. */
  readonly shown: number;
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
  const shown = verdicts.filter((verdict) => verdict._tag !== 'Covered').length;
  return {
    frames: verdicts.length,
    shown,
    judged: deviations.length,
    missing: shown - deviations.length,
    off: deviations.filter((deviation) => deviation > TOLERANCE).length,
    worst: round2(Math.max(0, ...deviations)),
  };
};

/**
 * A pass holds when no frame is off, the worst is within 1 pt, at least 95%
 * of the frames that show the list were judged, and the list shows in at
 * least `least` of all frames (every frame unless a pass covers the list).
 */
export const holds = (summary: Summary, least = 1) =>
  summary.off === 0 &&
  summary.worst <= TOLERANCE &&
  summary.shown >= least * summary.frames &&
  summary.judged >= 0.95 * summary.shown;
