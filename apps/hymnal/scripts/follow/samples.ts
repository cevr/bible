/**
 * The follow check's judge: what a run of accessibility snapshots, taken
 * while one hymn plays on the score clock, shows of the sung line.
 *
 * Each snapshot becomes a `Sample` (`sampleOf`): its time since the Play
 * tap, each line's selected state and frame in the order the page lays
 * them (the nodes with identifier `line`; line i is the timeline's line i),
 * the frame of the page's scroll (`hymn-scroll`), and whether the player
 * has ended (its button reads `Play hymn <n> again`). No words are kept.
 *
 * `judge` holds the samples to the hymn's timeline:
 *
 * - `backwards`: the times the selected line comes before the last one seen;
 * - `missed`: the lines longer than `LONG` ms never seen selected;
 * - `last`: whether the last sung line was seen selected;
 * - `outside`: the samples whose selected line is not inside the scroll's
 *   frame, or whose next line's top is not;
 * - `doubled`: the samples with more than one line selected;
 * - `mismatched`: the samples whose count of lines is not the timeline's.
 *
 * A run holds when each of those is 0 or true, the player was seen to end,
 * and the check touched the screen once (`touches`).
 */
import { Array as Arr, Option } from 'effect';

/** A frame on the screen, in points. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The part of a snapshot node the judge reads. */
export interface Node {
  readonly identifier?: string;
  readonly label?: string;
  readonly selected?: boolean;
  readonly rect?: Rect;
}

/** One sung line as a sample shows it. */
export interface Shown {
  readonly selected: boolean;
  readonly rect: Rect;
}

/** One snapshot, reduced to what the judge reads. */
export interface Sample {
  /** Milliseconds since the Play tap. */
  readonly at: number;
  readonly lines: ReadonlyArray<Shown>;
  /** The scroll's frame; none when the page's scroll is not in the snapshot. */
  readonly scroll: Rect | false;
  readonly ended: boolean;
}

/** A line at least this long, in ms, must be seen selected: the samples come about every 500 ms. */
export const LONG = 1000;

/** How far, in points, a frame may stand past the scroll's edge and still count as inside. */
export const SLACK = 1;

const NO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** The sample a snapshot's nodes give, `at` ms after the tap, for hymn `hymn`. */
export const sampleOf = (nodes: ReadonlyArray<Node>, hymn: number, at: number): Sample => {
  const scroll = nodes.find((node) => node.identifier === 'hymn-scroll');
  return {
    at,
    lines: nodes
      .filter((node) => node.identifier === 'line')
      .map((node) => ({ selected: node.selected === true, rect: node.rect ?? NO_RECT })),
    scroll: scroll?.rect ?? false,
    ended: nodes.some((node) => node.label === `Play hymn ${hymn} again`),
  };
};

/** Whether `y` lies within the scroll's frame, top to bottom. */
const within = (y: number, scroll: Rect) =>
  y >= scroll.y - SLACK && y <= scroll.y + scroll.height + SLACK;

/** Whether `rect` lies inside the scroll's frame, top to bottom. */
const inside = (rect: Rect, scroll: Rect) =>
  within(rect.y, scroll) && within(rect.y + rect.height, scroll);

/** The verdict on one hymn's run. */
export interface Verdict {
  readonly hymn: number;
  readonly samples: number;
  readonly lines: number;
  readonly seen: number;
  readonly missed: ReadonlyArray<number>;
  readonly backwards: number;
  readonly last: boolean;
  readonly outside: number;
  readonly doubled: number;
  readonly mismatched: number;
  readonly ended: boolean;
  readonly touches: number;
  readonly holds: boolean;
}

/**
 * The verdict on `samples`, for a hymn whose lines last `lengths` ms each
 * (the timeline's `until - start`), after `touches` touches.
 */
export const judge = (
  hymn: number,
  lengths: ReadonlyArray<number>,
  samples: ReadonlyArray<Sample>,
  touches: number,
): Verdict => {
  const seen = new Set<number>();
  let before = -1;
  let backwards = 0;
  let outside = 0;
  let doubled = 0;
  let mismatched = 0;
  for (const sample of samples) {
    if (sample.lines.length !== lengths.length) {
      mismatched++;
      continue;
    }
    const selected = Arr.getSomes(
      sample.lines.map((line, index) => Option.liftPredicate(index, () => line.selected)),
    );
    if (selected.length > 1) doubled++;
    const first = Arr.head(selected);
    if (Option.isNone(first)) continue;
    const line = first.value;
    seen.add(line);
    if (line < before) backwards++;
    before = line;
    const shown = Option.map(Arr.get(sample.lines, line), (at) => at.rect);
    const next = Option.map(Arr.get(sample.lines, line + 1), (at) => at.rect);
    const { scroll } = sample;
    const held =
      scroll !== false &&
      Option.exists(shown, (rect) => inside(rect, scroll)) &&
      Option.match(next, { onNone: () => true, onSome: (rect) => within(rect.y, scroll) });
    if (!held) outside++;
  }
  const missed = Arr.getSomes(
    lengths.map((length, index) =>
      Option.liftPredicate(index, () => length > LONG && !seen.has(index)),
    ),
  );
  const last = seen.has(lengths.length - 1);
  const ended = samples.some((sample) => sample.ended);
  return {
    hymn,
    samples: samples.length,
    lines: lengths.length,
    seen: seen.size,
    missed,
    backwards,
    last,
    outside,
    doubled,
    mismatched,
    ended,
    touches,
    holds:
      samples.length > 0 &&
      missed.length === 0 &&
      backwards === 0 &&
      last &&
      outside === 0 &&
      doubled === 0 &&
      mismatched === 0 &&
      ended &&
      touches === 1,
  };
};
