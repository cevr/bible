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
 * - `mismatched`: the samples whose count of lines is not the timeline's;
 * - `adrift`: the samples whose selected line is not sung at the sample's
 *   time on the score clock, which starts at the first sung line at the tap
 *   (`first + at`), give or take `TIMING`: a clock that runs fast or slow;
 * - `early`: whether the player was seen to end before the timeline's end
 *   on that clock, less `TIMING`.
 *
 * A run holds when each of those is 0, false or true as it should be, the
 * player was seen to end, and the check touched the screen once (`touches`).
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
  /** The node's place in the snapshot, and its parent's: the tree the page's lines hang in. */
  readonly index?: number;
  readonly parentIndex?: number;
  readonly identifier?: string;
  readonly label?: string;
  /** What the element says of its state; iOS gives a checked control's state here. */
  readonly value?: string;
  readonly selected?: boolean;
  readonly rect?: Rect;
}

/**
 * Whether the snapshot shows sound off: the player bar's `Sound` button
 * unchecked. On iOS the button is one element labelled `Sound`, its text
 * (`Sound off`) not a node of its own, and React Native says its checked
 * state in the element's value.
 */
export const soundOff = (nodes: ReadonlyArray<Node>): boolean =>
  nodes.some(
    (node) =>
      node.label === 'Sound' && (node.value ?? '').split(', ').some((word) => word === 'unchecked'),
  );

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

/**
 * How far, in ms, a sample's time may sit from the score clock's place and
 * still count as on time. A sample's time is read once its snapshot is
 * done, and a snapshot of the whole tree takes up to about a second; the
 * clock starts some hundreds of ms after the tap. A clock 1 % fast is out
 * by this much 150 s into a hymn.
 */
export const TIMING = 1500;

/** The part of a hymn's timeline the judge reads, in ms: each line's span, the first sung line, the end. */
export interface Timed {
  readonly first: number;
  readonly end: number;
  readonly lines: ReadonlyArray<{ readonly start: number; readonly until: number }>;
}

/** How far, in points, a frame may stand past the scroll's edge and still count as inside. */
export const SLACK = 1;

const NO_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };

/** The frame `a` and `b` both cover; none when they do not meet. */
const meet = (a: Rect, b: Rect): Option.Option<Rect> => {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;
  return Option.liftPredicate({ x, y, width, height }, () => width > 0 && height > 0);
};

/** `node` and each of its ancestors, nearest first, by `parentIndex`; at most `depth` of them. */
const lineage = (byIndex: ReadonlyMap<number, Node>, node: Node, depth = 100): Array<Node> => {
  const chain = [node];
  for (let at = node; chain.length < depth;) {
    const parent = Option.fromNullishOr(byIndex.get(at.parentIndex ?? -1));
    if (Option.isNone(parent)) break;
    at = parent.value;
    chain.push(at);
  }
  return chain;
};

/** The part of `node`'s frame the screen shows: its frame cut to each ancestor's (a pager's page, a window). */
const shownFrame = (byIndex: ReadonlyMap<number, Node>, node: Node): Option.Option<Rect> =>
  lineage(byIndex, node).reduce(
    (frame, at) => Option.flatMap(frame, (rect) => meet(rect, at.rect ?? rect)),
    Option.fromNullishOr(node.rect),
  );

/**
 * The sample a snapshot's nodes give, `at` ms after the tap, for hymn
 * `hymn`. The pager keeps the pages beside the open one in the tree, each
 * with its own scroll and lines; the page's scroll is the one the screen
 * shows, its frame as shown (a scroll's own frame is as tall as its
 * content), and its lines are those inside it.
 */
export const sampleOf = (nodes: ReadonlyArray<Node>, hymn: number, at: number): Sample => {
  const byIndex = new Map(
    nodes.flatMap((node) =>
      Option.match(Option.fromNullishOr(node.index), {
        onNone: () => [],
        onSome: (index) => [[index, node] as const],
      }),
    ),
  );
  const page = Arr.findFirst(nodes, (node) =>
    Option.liftPredicate(node, (at) => at.identifier === 'hymn-scroll').pipe(
      Option.flatMap((scroll) => shownFrame(byIndex, scroll)),
      Option.map((frame) => ({ node, frame })),
    ),
  );
  const onPage = (node: Node) =>
    Option.exists(page, ({ node: scroll }) => lineage(byIndex, node).includes(scroll));
  return {
    at,
    lines: nodes
      .filter((node) => node.identifier === 'line' && onPage(node))
      .map((node) => ({ selected: node.selected === true, rect: node.rect ?? NO_RECT })),
    scroll: Option.match(page, { onNone: () => false, onSome: ({ frame }) => frame }),
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
  readonly adrift: number;
  readonly early: boolean;
  readonly ended: boolean;
  readonly touches: number;
  readonly holds: boolean;
}

/** Whether line `span` is sung, give or take `TIMING`, at `place` ms on the score clock. */
const onTime = (span: Timed['lines'][number], place: number) =>
  span.start - TIMING <= place && place < span.until + TIMING;

/** The verdict on `samples`, for the hymn whose timeline is `timed`, after `touches` touches. */
export const judge = (
  hymn: number,
  timed: Timed,
  samples: ReadonlyArray<Sample>,
  touches: number,
): Verdict => {
  const lengths = timed.lines.map((span) => span.until - span.start);
  let adrift = 0;
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
    if (!Option.exists(Arr.get(timed.lines, line), (span) => onTime(span, timed.first + sample.at)))
      adrift++;
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
  const early = samples.some(
    (sample) => sample.ended && timed.first + sample.at < timed.end - TIMING,
  );
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
    adrift,
    early,
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
      adrift === 0 &&
      !early &&
      ended &&
      touches === 1,
  };
};
