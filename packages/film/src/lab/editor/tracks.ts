// The strip's tracks: a scene's cues by the actor or part each moves (its
// span's `track`), as rows the strip draws. Tracks come in the order their
// first cue is written; a cue that names no track is its own, named by the
// cue, so a scene that names none draws one cue to a row. A track's cues are
// packed into lanes by their place on the clock, so two moves of one actor
// that overlap stack instead of hiding each other. A cue's words say what
// it is (`bow 0.35 s`, `build until {evidence}`, `card · holds to end`), and
// the scene's marks are the labels every track's cues are tied to. Pure.

import { Array as Arr, Match, Option, Order, Predicate } from 'effect';
import type { ResolvedCue, Span, Timeline, Until } from '../../core/schema.ts';
import { CLOCK_EPSILON } from '../../core/time.ts';

/** One cue as the strip draws it on its track. */
export interface Block {
  readonly name: string;
  readonly cue: ResolvedCue;
  /** What the cue is, in a few words: its name, then `more`. */
  readonly words: string;
  /** What follows its name in its words (`0.35 s`, `until {evidence}`), none for an instant. */
  readonly more: Option.Option<string>;
  /** It runs `until` a point (a mark, a landmark or a cue's edge): its end is that point's, not a length. */
  readonly until: boolean;
}

/** A track: the actor or part its cues move, and its cues in lanes, none overlapping another in its lane. */
export interface Track {
  /** Which track it is: a named track's and a cue's own never share one, though a cue may be named as a track is. */
  readonly key: string;
  readonly name: string;
  /** Named by its cues' `track`; else the one cue that names none, named by itself. */
  readonly named: boolean;
  readonly lanes: Arr.NonEmptyReadonlyArray<ReadonlyArray<Block>>;
}

/** A mark of the scene's narration, at its scene second. */
export interface Label {
  readonly name: string;
  readonly t: number;
}

/** Seconds as the strip prints them: `0.35`, `1.40`. */
const seconds = (s: number) => s.toFixed(2);

/** The point a span runs `until`, in words. */
const pointWords = (until: Until): string =>
  Match.value(until).pipe(
    Match.when(Predicate.isString, (mark) => `{${mark}}`),
    Match.when({ at: Predicate.isString }, ({ at }) => at),
    Match.orElse(({ cue, edge }) => `${cue}’s ${edge ?? 'end'}`),
  );

/** Seconds off a point, signed: `+0.20 s`, `−1.00 s`. */
const offWords = (s: number) =>
  `${Option.match(
    Option.liftPredicate(s, (n) => n < 0),
    { onSome: () => '−', onNone: () => '+' },
  )}${seconds(Math.abs(s))} s`;

/**
 * What ends a span that runs `until` a point, in words: the point and the
 * seconds off it (`untilOffset`), or, on the scene's end itself, that it
 * holds to it.
 */
const untilWords = (until: Until, offset: Option.Option<number>): string =>
  Option.match(
    Option.filter(offset, (s) => s !== 0),
    {
      onSome: (s) => `until ${pointWords(until)} ${offWords(s)}`,
      onNone: () =>
        Match.value(until).pipe(
          Match.when({ at: 'end' }, () => '· holds to end'),
          Match.orElse((u) => `until ${pointWords(u)}`),
        ),
    },
  );

/** What a cue is after its name: what ends it (a point it runs until, the scene's end) or its length; an instant, nothing. */
const moreWords = (span: Span, cue: ResolvedCue): Option.Option<string> =>
  Option.match(Option.fromUndefinedOr(span.until), {
    onSome: (until) => Option.some(untilWords(until, Option.fromUndefinedOr(span.untilOffset))),
    onNone: () =>
      Option.map(
        Option.liftPredicate(cue.dur, (d) => d > 0),
        (d) => `${seconds(d)} s`,
      ),
  });

/** By where a cue starts, then where it ends. */
const byStart: Order.Order<Block> = Order.combine(
  Order.mapInput(Order.Number, (b: Block) => b.cue.start),
  Order.mapInput(Order.Number, (b: Block) => b.cue.end),
);

/** A lane as it fills: where it is taken up to, whether an instant holds that end, and its blocks. */
interface Filling {
  end: number;
  /** An instant ends the lane: a cue starting on it would hide it. */
  closed: boolean;
  readonly blocks: Array<Block>;
}

/** Whether `b` goes in `lane`: it starts at or after the lane's end, and not on an instant that ends it. */
const fits = (lane: Filling, b: Block) => {
  const touching = Math.abs(lane.end - b.cue.start) <= CLOCK_EPSILON;
  return lane.end <= b.cue.start + CLOCK_EPSILON && !(touching && lane.closed);
};

/** `b` put at the end of `lane`. */
const put = (lane: Filling, b: Block) => {
  lane.end = b.cue.end;
  lane.closed = b.cue.dur <= CLOCK_EPSILON;
  lane.blocks.push(b);
};

/** `blocks` packed into lanes by their clock: each into the first lane it fits. */
const pack = (
  blocks: Arr.NonEmptyReadonlyArray<Block>,
): Arr.NonEmptyReadonlyArray<ReadonlyArray<Block>> => {
  const [first, ...rest] = Arr.sort(blocks, byStart);
  const lanes: Arr.NonEmptyArray<Filling> = [{ end: 0, closed: false, blocks: [] }];
  put(lanes[0], first);
  for (const b of rest)
    Option.match(
      Arr.findFirst(lanes, (lane) => fits(lane, b)),
      {
        onSome: (lane) => put(lane, b),
        onNone: () => {
          const lane: Filling = { end: 0, closed: false, blocks: [] };
          put(lane, b);
          lanes.push(lane);
        },
      },
    );
  return Arr.map(lanes, (l) => l.blocks);
};

/** One cue of a timeline, resolved, with the track it is on. */
interface Placed {
  /** Its track's key: `track:` and the name its span gives, else `cue:` and its own. */
  readonly key: string;
  readonly track: string;
  readonly named: boolean;
  readonly block: Block;
}

/** A cue on the track its span names, or on its own, named by itself. */
const placedOn = (name: string, span: Span, cue: ResolvedCue): Placed => {
  const more = moreWords(span, cue);
  const words = Option.match(more, { onSome: (m) => `${name} ${m}`, onNone: () => name });
  const block = { name, cue, words, more, until: 'until' in span };
  return Option.match(Option.fromUndefinedOr(span.track), {
    onSome: (track) => ({ key: `track:${track}`, track, named: true, block }),
    onNone: () => ({ key: `cue:${name}`, track: name, named: false, block }),
  });
};

/**
 * The tracks of a scene's `timeline` (its cues in the order written) with its
 * `cues` resolved on the clock: a cue the clock has not resolved is left out.
 */
export const tracksOf = (
  timeline: Timeline,
  cues: ReadonlyMap<string, ResolvedCue>,
): ReadonlyArray<Track> => {
  const placed = Arr.getSomes(
    Object.entries(timeline).map(([name, span]) =>
      Option.map(Option.fromUndefinedOr(cues.get(name)), (cue) => placedOn(name, span, cue)),
    ),
  );
  // Grouped by key; a record's keys are not kept in the order written (`'2'` before `'b'`), so the order is its own.
  const byTrack = Arr.groupBy(placed, (p) => p.key);
  return Arr.getSomes(
    Arr.dedupe(placed.map((p) => p.key)).map((key) =>
      Option.map(Option.fromUndefinedOr(byTrack[key]), (mine): Track => ({
        key,
        name: mine[0].track,
        named: mine[0].named,
        lanes: pack(Arr.map(mine, (p) => p.block)),
      })),
    ),
  );
};

/**
 * `next`'s tracks in `held`'s lanes while a cue is held: a drag that moves a
 * bar into or out of an overlap keeps it on the lane it was pressed on (the
 * bar holds the pointer, so a lane of its own would drop the grip), packed
 * again once it is let go. A track whose cues changed takes `next`'s lanes.
 */
export const heldLanes = (
  held: ReadonlyArray<Track>,
  next: ReadonlyArray<Track>,
): ReadonlyArray<Track> =>
  next.map((track) =>
    Option.getOrElse(
      Option.flatMap(
        Arr.findFirst(held, (h) => h.key === track.key),
        (was) => {
          const now = new Map(track.lanes.flatMap((lane) => lane.map((b) => [b.name, b] as const)));
          const lanes = Arr.map(was.lanes, (lane) =>
            Arr.getSomes(lane.map((b) => Option.fromUndefinedOr(now.get(b.name)))),
          );
          // Every cue it holds now was on one of its lanes then.
          return Option.liftPredicate(
            { ...track, lanes },
            () => lanes.flat().length === now.size && stripOrder([was]).length === now.size,
          );
        },
      ),
      () => track,
    ),
  );

/** The cue names of `tracks` in the strip's order: track by track, lane by lane, each lane by its clock. */
export const stripOrder = (tracks: ReadonlyArray<Track>): ReadonlyArray<string> =>
  tracks.flatMap((t) => t.lanes.flatMap((lane) => lane.map((b) => b.name)));

/** The scene's marks as labels at their scene seconds (`marks` from the start of speech), in time order. */
export const labelsOf = (
  speechStart: number,
  marks: ReadonlyMap<string, number>,
): ReadonlyArray<Label> =>
  Arr.sortWith(
    Array.from(marks, ([name, m]): Label => ({ name, t: speechStart + m })),
    (l) => l.t,
    Order.Number,
  );

/** `count` of `word`, its plural for any count but one. */
const counted = (count: number, word: string) =>
  `${count} ${word}${Option.match(
    Option.liftPredicate(count, (c) => c === 1),
    { onSome: () => '', onNone: () => 's' },
  )}`;

/** The strip's count: `3 tracks · 6 marks · 7 cues`. */
export const countText = (tracks: ReadonlyArray<Track>, labels: number): string =>
  [
    counted(tracks.length, 'track'),
    counted(labels, 'mark'),
    counted(stripOrder(tracks).length, 'cue'),
  ].join(' · ');
