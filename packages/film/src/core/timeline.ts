// Named cues: a scene's moments, declared once as data beside its drawing.
// Each span anchors to a point in its scene (`ScenePoint`: a narration mark or
// a word said after it, another cue, or a scene landmark) — never to an
// absolute second — so a re-recorded take carries every cue with it. Resolved
// once per layout; the picture and the sound both read the result. A timeline
// that does not resolve fails as a value naming its scene and cue. Pure and
// DOM-free.

import { Option, Result } from 'effect';
import {
  CueCycle,
  type PointError,
  UnknownCue,
  UnknownMark,
  UntilBeforeStart,
  WordMissing,
} from './errors.ts';
import { wordAfter } from './narration.ts';
import type { CuePatch, ResolvedCue, ScenePoint, Span, Timeline, Word } from './schema.ts';
import { DEFAULT_EASE, type Key, ease, keys, progress } from './time.ts';

/** 0→1 across a cue at scene time `t`, eased by the cue's own ease. */
export const cueProgress = (cue: ResolvedCue, t: number): number =>
  progress(t, cue.start, cue.dur, ease[cue.ease]);

/**
 * 0→1 for the item at `at` (0 the first, 1 the last) across a staggered cue
 * at scene time `t`, eased by the cue's ease: the items' starts spread over
 * the cue's `stagger` share and each lasts the rest, the last ending with
 * the cue, so a `dur` edit scales every item. For a set spread by place (a
 * field by how far the rain reaches it) rather than by count.
 */
export const staggerAt = (cue: ResolvedCue, t: number, at: number): number => {
  const lead = cue.stagger * at;
  return progress(t, cue.start + cue.dur * lead, cue.dur * (1 - cue.stagger), ease[cue.ease]);
};

/**
 * 0→1 for item `i` of `n` across a staggered cue at scene time `t`, eased by
 * the cue's ease. The items' starts spread evenly over the cue's `stagger`
 * share, the first at its start, and each lasts the rest, the last ending
 * with the cue; so a `dur` edit scales every item. One item is the whole cue.
 */
export const staggerProgress = (cue: ResolvedCue, t: number, i: number, n: number): number =>
  n <= 1 ? cueProgress(cue, t) : staggerAt(cue, t, i / (n - 1));

/**
 * Keyframes across a cue at scene time `t`. Each key's time is a fraction of
 * the cue (0 its start, 1 its end), so a `dur` edit stretches the motion; a
 * key that names no ease takes the cue's, so an `ease` edit reshapes it.
 */
export const cueKeys = (cue: ResolvedCue, t: number, frames: ReadonlyArray<Key>): number => {
  if (cue.dur <= 0) return keys(t >= cue.start ? 1 : 0, frames, cue.ease);
  return keys((t - cue.start) / cue.dur, frames, cue.ease);
};

/** A span's anchor alone: the fields that say where it starts. */
const anchorField = (span: Span) => {
  if ('mark' in span)
    return span.word === undefined ? { mark: span.mark } : { mark: span.mark, word: span.word };
  if ('after' in span) return { after: span.after };
  if ('with' in span) return { with: span.with };
  return { at: span.at };
};

/** A span's end: its `dur` (from its anchor, or up to it with `ends`), or the mark it runs `until`. */
const endField = (span: Span, patch: CuePatch) => {
  if (patch.until !== undefined) return { until: patch.until };
  const ends = span.ends === true ? { ends: true as const } : {};
  if (patch.dur !== undefined) return { dur: patch.dur, ...ends };
  if (span.until !== undefined) return { until: span.until };
  if (span.dur !== undefined) return { dur: span.dur, ...ends };
  return ends;
};

/**
 * `span` with a lab edit applied. A span ends one way, so a `dur` replaces
 * its `until` and an `until` its `dur`; a span that `ends` on its anchor
 * keeps landing there as its `dur` changes.
 */
export const patchSpan = (span: Span, patch: CuePatch): Span => ({
  ...anchorField(span),
  offset: patch.offset ?? span.offset,
  ...endField(span, patch),
  ease: patch.ease ?? span.ease,
  stagger: patch.stagger ?? span.stagger,
});

/** Where a lab drag grabs a cue's bar: its body, its left edge or its right edge. */
export type DragEdge = 'move' | 'start' | 'end';

/** Where a dragged bar now sits on the scene clock. */
export interface DraggedBar {
  readonly start: number;
  readonly end: number;
}

/** A time as the lab writes it: to the millisecond. */
const ms = (v: number) => Math.round(v * 1000) / 1000 + 0;

/**
 * The patch a lab drag of `span` writes, given its cue as resolved before the
 * drag and where the bar now sits; none when the drag changes nothing. The
 * body moves the offset, the right edge the dur, the left edge both. A span
 * that `ends` on its anchor mirrors it: its offset moves the end, so the left
 * edge sets only the dur and the right edge both.
 *
 * A span that runs `until` a mark keeps ending on the mark (narration is the
 * clock): the body and the left edge move only its offset, its start held
 * at least `frame` before the mark so it never ends before it starts, and the
 * right edge leaves the mark only when dropped off it, as a hand-set `dur`.
 */
export const dragPatch = (
  span: Span,
  cue: ResolvedCue,
  edge: DragEdge,
  at: DraggedBar,
  frame: number,
): Option.Option<CuePatch> => {
  if (span.until !== undefined)
    return untilPatch(span, cue, edge, at, cue.start - (span.offset ?? 0), frame);
  const lands = span.ends === true;
  const anchor = (lands ? cue.end : cue.start) - (span.offset ?? 0);
  const offset = ms((lands ? at.end : at.start) - anchor);
  const dur = ms(at.end - at.start);
  if (offset === ms(span.offset ?? 0) && dur === ms(cue.dur)) return Option.none();
  if (edge === 'move') return Option.some({ offset });
  if (edge === (lands ? 'start' : 'end')) return Option.some({ dur });
  return Option.some({ offset, dur });
};

/** `dragPatch` for a span that runs `until` a mark: see there. */
const untilPatch = (
  span: Span,
  cue: ResolvedCue,
  edge: DragEdge,
  at: DraggedBar,
  anchor: number,
  frame: number,
): Option.Option<CuePatch> => {
  if (edge === 'end') {
    if (ms(at.end) === ms(cue.end)) return Option.none();
    return Option.some({ dur: ms(Math.max(0, at.end - cue.start)) });
  }
  const offset = ms(Math.min(at.start, cue.end - frame) - anchor);
  if (offset === ms(span.offset ?? 0)) return Option.none();
  return Option.some({ offset });
};

/** What a timeline resolves against. `marks` and `words` are speech-relative, as narration gives them. */
export interface SceneClock {
  readonly scene: string;
  readonly marks: ReadonlyMap<string, number>;
  /** The words spoken, which a word pin (`{ mark, word }`) lands on. */
  readonly words: ReadonlyArray<Word>;
  /** Scene-local time the voice starts and ends. */
  readonly speechStart: number;
  readonly speechEnd: number;
  readonly dur: number;
}

/**
 * Where `point` lands on `clock`, scene-local: a mark where its word starts
 * (or the first word it pins, said at or after it), a named cue's start or
 * end (`cueOf` resolves it; a point that names no edge takes `edge`), or a
 * landmark. `by` names who asked, for the error: `cue "lift"`, `sound`.
 */
export const pointOn = <E>(
  clock: SceneClock,
  cueOf: (name: string) => Result.Result<ResolvedCue, E>,
  point: ScenePoint,
  by: string,
  edge: 'start' | 'end' = 'start',
): Result.Result<number, E | PointError> => {
  if (point.mark !== undefined) {
    const { mark, word } = point;
    const m = clock.marks.get(mark);
    if (m === undefined)
      return Result.fail(
        UnknownMark.make({ scene: clock.scene, mark, by, known: [...clock.marks.keys()] }),
      );
    if (word === undefined) return Result.succeed(clock.speechStart + m);
    return Result.map(
      Result.fromOption(wordAfter(clock.words, m, word), () =>
        WordMissing.make({ scene: clock.scene, by, mark, word }),
      ),
      (w) => clock.speechStart + w,
    );
  }
  if (point.cue !== undefined) {
    const named = point.edge ?? edge;
    return Result.map(cueOf(point.cue), (c) => (named === 'end' ? c.end : c.start));
  }
  switch (point.at) {
    case 'start':
      return Result.succeed(0);
    case 'speech':
      return Result.succeed(clock.speechStart);
    case 'speechEnd':
      return Result.succeed(clock.speechEnd);
    case 'end':
      return Result.succeed(clock.dur);
  }
};

/** A span's anchor as a point: `after` a cue is its end, `with` it its start. */
export const anchorPoint = (span: Span): ScenePoint => {
  if ('mark' in span)
    return span.word === undefined ? { mark: span.mark } : { mark: span.mark, word: span.word };
  if ('after' in span) return { cue: span.after, edge: 'end' };
  if ('with' in span) return { cue: span.with };
  return { at: span.at };
};

/** Why a timeline does not resolve: a point it names, a cycle, or an `until` before its start. */
export type TimelineError = PointError | CueCycle | UntilBeforeStart;

/** Resolve every cue in dependency order; an unknown name, a cycle or a backward `until` fails naming its cue. */
export const resolveTimeline = (
  timeline: Timeline | undefined,
  clock: SceneClock,
): Result.Result<ReadonlyMap<string, ResolvedCue>, TimelineError> => {
  const out = new Map<string, ResolvedCue>();
  if (timeline === undefined) return Result.succeed(out);
  const visiting: Array<string> = [];
  const known = Object.keys(timeline);

  /** How long a cue that starts at `start` lasts: its `dur`, or up to its `until` mark. */
  const length = (
    name: string,
    span: Span,
    start: number,
  ): Result.Result<number, TimelineError> => {
    if (span.until === undefined) return Result.succeed(span.dur ?? 0);
    const mark = span.until;
    const m = clock.marks.get(mark);
    if (m === undefined)
      return Result.fail(
        UnknownMark.make({
          scene: clock.scene,
          mark,
          by: `cue "${name}"`,
          known: [...clock.marks.keys()],
        }),
      );
    const dur = clock.speechStart + m - start;
    if (dur < 0) return Result.fail(UntilBeforeStart.make({ scene: clock.scene, cue: name, mark }));
    return Result.succeed(dur);
  };

  const resolve = (name: string, by: string): Result.Result<ResolvedCue, TimelineError> => {
    const done = out.get(name);
    if (done !== undefined) return Result.succeed(done);
    const span = Object.hasOwn(timeline, name) ? timeline[name] : undefined;
    if (span === undefined)
      return Result.fail(UnknownCue.make({ scene: clock.scene, cue: name, by, known }));
    if (visiting.includes(name))
      return Result.fail(CueCycle.make({ scene: clock.scene, cycle: [...visiting, name] }));
    visiting.push(name);
    const self = `cue "${name}"`;
    const anchor = pointOn(clock, (n) => resolve(n, self), anchorPoint(span), self);
    visiting.pop();
    if (Result.isFailure(anchor)) return Result.fail(anchor.failure);
    const at = anchor.success + (span.offset ?? 0);
    // A span that `ends` on its anchor starts its length before it.
    const start = span.ends === true ? at - (span.dur ?? 0) : at;
    const dur = length(name, span, start);
    if (Result.isFailure(dur)) return Result.fail(dur.failure);
    const cue = {
      start,
      end: start + dur.success,
      dur: dur.success,
      ease: span.ease ?? DEFAULT_EASE,
      stagger: span.stagger ?? 0,
    };
    out.set(name, cue);
    return Result.succeed(cue);
  };

  for (const name of known) {
    const cue = resolve(name, 'timeline');
    if (Result.isFailure(cue)) return Result.fail(cue.failure);
  }
  return Result.succeed(out);
};
