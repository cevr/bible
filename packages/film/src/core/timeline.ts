// Named cues: a scene's moments, declared once as data beside its drawing.
// Each span anchors to a point in its scene (`ScenePoint`: a narration mark or
// a word said after it, another cue, or a scene landmark) — never to an
// absolute second — so a re-recorded take carries every cue with it. Resolved
// once per layout; the picture and the sound both read the result. A timeline
// that does not resolve fails as a value naming its scene and cue. Pure and
// DOM-free.

import { Option, Predicate, Result } from 'effect';
import {
  CueCycle,
  type PointError,
  UnknownCue,
  UnknownMark,
  UntilBeforeStart,
  WordMissing,
} from './errors.ts';
import { wordAfter } from './narration.ts';
import {
  CUE_PATCH_KEYS,
  type CuePatch,
  type ResolvedCue,
  type ScenePoint,
  type Span,
  type Timeline,
  type Until,
  type Word,
} from './schema.ts';
import {
  CLOCK_EPSILON,
  DEFAULT_EASE,
  type Key,
  ease,
  keys,
  onTheMs,
  progress,
  toMs,
} from './time.ts';

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

/** An `until` span's offset off its point as the span writes it: none on the point (0, to the millisecond). */
const untilOffsetField = (untilOffset: number | undefined) =>
  untilOffset === undefined || toMs(untilOffset) === 0 ? {} : { untilOffset };

/**
 * A span's end: its `dur` (from its anchor, or up to it with `ends`), or the
 * point it runs `until` and its offset off it. A patch's `dur` or `until`
 * sets the whole end, so a new point starts on the point; its `untilOffset`
 * alone moves an `until` span's end off the point it keeps. A patch that
 * leaves the end leaves it as written, its `untilOffset` included, however
 * fine: only an edit of the end is put to the millisecond.
 */
const endField = (span: Span, patch: CuePatch) => {
  if (patch.until !== undefined)
    return { until: patch.until, ...untilOffsetField(patch.untilOffset) };
  const ends = span.ends === true ? { ends: true as const } : {};
  if (patch.dur !== undefined) return { dur: patch.dur, ...ends };
  if (span.until !== undefined && patch.untilOffset !== undefined)
    return { until: span.until, ...untilOffsetField(patch.untilOffset) };
  if (span.until !== undefined)
    return span.untilOffset === undefined
      ? { until: span.until }
      : { until: span.until, untilOffset: span.untilOffset };
  if (span.dur !== undefined) return { dur: span.dur, ...ends };
  return ends;
};

/**
 * `patch` as a scene file holds it once written: every number to the
 * millisecond (`toMs`), the one rounding the source writer applies. What a
 * write is judged by before it lands, so the judgement is of what lands.
 */
export const writtenPatch = (patch: CuePatch): CuePatch =>
  CUE_PATCH_KEYS.reduce<CuePatch>((written, key) => {
    const value = patch[key];
    if (!Predicate.isNumber(value)) return written;
    return { ...written, [key]: toMs(value) };
  }, patch);

/**
 * `span` with a lab edit applied. A span ends one way, so a `dur` replaces
 * its `until` (and the offset off it) and an `until` its `dur`; an
 * `untilOffset` moves an `until` span's end off its point, and 0 puts it back
 * on it, the key dropped; a span that `ends` on its anchor keeps landing there
 * as its `dur` changes. A field neither has stays absent, never `undefined`,
 * so the result decodes as a `Span`; a designed `silence` is kept.
 */
export const patchSpan = (span: Span, patch: CuePatch): Span => {
  const offset = patch.offset ?? span.offset;
  const easeName = patch.ease ?? span.ease;
  const stagger = patch.stagger ?? span.stagger;
  const offsetField = offset === undefined ? {} : { offset };
  const easeField = easeName === undefined ? {} : { ease: easeName };
  const staggerField = stagger === undefined ? {} : { stagger };
  const silenceField = span.silence === true ? { silence: true as const } : {};
  return {
    ...anchorField(span),
    ...offsetField,
    ...endField(span, patch),
    ...easeField,
    ...staggerField,
    ...silenceField,
  };
};

/** Where a lab drag grabs a cue's bar: its body, its left edge or its right edge. */
export type DragEdge = 'move' | 'start' | 'end';

/** Where a dragged bar now sits on the scene clock. */
interface DraggedBar {
  readonly start: number;
  readonly end: number;
}

/**
 * The patch a lab drag of `span` writes, given its cue as resolved before the
 * drag and where the bar now sits; none when the drag changes nothing. The
 * body moves the offset, the right edge the dur, the left edge both. A span
 * that `ends` on its anchor mirrors it: its offset moves the end, so the left
 * edge sets only the dur and the right edge both.
 *
 * A span that runs `until` a point (a mark, a landmark or a cue's edge) keeps
 * following it: the body and the left edge move only its offset, its start
 * held at least `frame` before its end so it never ends before it starts, and
 * the right edge sets the end's offset off the point (`untilOffset`; 0, the
 * key dropped, when dropped back on it), never a `dur`, so a re-take or a drag
 * of that point still moves the end.
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
  const offset = toMs((lands ? at.end : at.start) - anchor);
  const dur = toMs(at.end - at.start);
  if (offset === toMs(span.offset ?? 0) && dur === toMs(cue.dur)) return Option.none();
  if (edge === 'move') return Option.some({ offset });
  if (edge === (lands ? 'start' : 'end')) return Option.some({ dur });
  return Option.some({ offset, dur });
};

/**
 * The fields a drag of `span` at `edge` writes (`dragPatch`): what the lab
 * must find literal, or absent, in the source to write it.
 */
export const dragFields = (span: Span, edge: DragEdge): ReadonlyArray<keyof CuePatch> => {
  if (edge === 'move') return ['offset'];
  if (span.until !== undefined) return edge === 'end' ? ['untilOffset'] : ['offset'];
  if (edge === (span.ends === true ? 'start' : 'end')) return ['dur'];
  return ['offset', 'dur'];
};

/** `dragPatch` for a span that runs `until` a point: see there. */
const untilPatch = (
  span: Span,
  cue: ResolvedCue,
  edge: DragEdge,
  at: DraggedBar,
  anchor: number,
  frame: number,
): Option.Option<CuePatch> => {
  if (edge === 'end') {
    if (toMs(at.end) === toMs(cue.end)) return Option.none();
    // The point the span runs until: its end less the offset it ends off it.
    const point = cue.end - (span.untilOffset ?? 0);
    const near = toMs(Math.max(cue.start, at.end) - point);
    // Rounded, the end may fall before the start: then it is the first millisecond at or after it.
    // On the start within float noise is on it, as the resolver judges it (`CLOCK_EPSILON`).
    if (point + near >= cue.start - CLOCK_EPSILON) return Option.some({ untilOffset: near });
    return Option.some({ untilOffset: onTheMs(cue.start - point) });
  }
  const offset = toMs(Math.min(at.start, cue.end - frame) - anchor);
  if (offset === toMs(span.offset ?? 0)) return Option.none();
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
const anchorPoint = (span: Span): ScenePoint => {
  if ('mark' in span)
    return span.word === undefined ? { mark: span.mark } : { mark: span.mark, word: span.word };
  if ('after' in span) return { cue: span.after, edge: 'end' };
  if ('with' in span) return { cue: span.with };
  return { at: span.at };
};

/** Where a span runs `until` as a point: a mark, a landmark, or a cue's edge (its end when none is named). */
const untilPoint = (until: Until): ScenePoint => {
  if (Predicate.isString(until)) return { mark: until };
  if (until.cue !== undefined) return { cue: until.cue, edge: until.edge ?? 'end' };
  return { at: until.at };
};

/** Where a span runs `until`, as the lab and an error say it: `{mark}`, the landmark's name, or `the end of cue "roll"`. */
export const untilText = (until: Until): string => {
  if (Predicate.isString(until)) return `{${until}}`;
  if (until.cue !== undefined) return `the ${until.edge ?? 'end'} of cue "${until.cue}"`;
  return until.at;
};

/**
 * Whether `cue` ends after its scene, `sceneDur` long: past its end by more
 * than float noise (`CLOCK_EPSILON`). The one judgement the lab's strip,
 * `film cues` and `film check` (`CueLate`) make of it.
 */
export const endsLate = (cue: ResolvedCue, sceneDur: number): boolean =>
  cue.end > sceneDur + CLOCK_EPSILON;

/**
 * Where a span that runs `until` a point ends, as the lab, `film cues` and an
 * error say it: the point (`untilText`), and its offset off it when it has
 * one, to the hundredth: `{first} + 0.10 s`, `{first} − 0.10 s`.
 */
export const untilEndText = (until: Until, untilOffset = 0): string => {
  if (toMs(untilOffset) === 0) return untilText(until);
  const sign = untilOffset < 0 ? '−' : '+';
  return `${untilText(until)} ${sign} ${Math.abs(untilOffset).toFixed(2)} s`;
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

  /** How long a cue that starts at `start` lasts: its `dur`, or up to where it runs `until`, plus its offset off it. */
  const length = (
    name: string,
    span: Span,
    start: number,
  ): Result.Result<number, TimelineError> => {
    const until = span.until;
    if (until === undefined) return Result.succeed(span.dur ?? 0);
    const self = `cue "${name}"`;
    return Result.flatMap(
      pointOn(clock, (n) => resolve(n, self), untilPoint(until), self),
      (point): Result.Result<number, TimelineError> => {
        const end = point + (span.untilOffset ?? 0);
        // Before its start by more than float noise (`CLOCK_EPSILON`); within it, it ends on its start.
        if (end < start - CLOCK_EPSILON)
          return Result.fail(
            UntilBeforeStart.make({
              scene: clock.scene,
              cue: name,
              until: untilEndText(until, span.untilOffset),
            }),
          );
        return Result.succeed(Math.max(0, end - start));
      },
    );
  };

  /** Where a cue starts and how long it lasts, read from the points its span names. */
  const timed = (
    name: string,
    span: Span,
  ): Result.Result<{ readonly start: number; readonly dur: number }, TimelineError> => {
    const self = `cue "${name}"`;
    return Result.flatMap(
      pointOn(clock, (n) => resolve(n, self), anchorPoint(span), self),
      (anchor) => {
        const at = anchor + (span.offset ?? 0);
        // A span that `ends` on its anchor starts its length before it.
        const start = span.ends === true ? at - (span.dur ?? 0) : at;
        return Result.map(length(name, span, start), (dur) => ({ start, dur }));
      },
    );
  };

  const resolve = (name: string, by: string): Result.Result<ResolvedCue, TimelineError> => {
    const done = out.get(name);
    if (done !== undefined) return Result.succeed(done);
    const span = Object.hasOwn(timeline, name) ? timeline[name] : undefined;
    if (span === undefined)
      return Result.fail(UnknownCue.make({ scene: clock.scene, cue: name, by, known }));
    if (visiting.includes(name))
      return Result.fail(CueCycle.make({ scene: clock.scene, cycle: [...visiting, name] }));
    // Held through both ends, so an `until` that leads back here is a cycle too.
    visiting.push(name);
    const at = timed(name, span);
    visiting.pop();
    if (Result.isFailure(at)) return Result.fail(at.failure);
    const { start, dur } = at.success;
    const cue = {
      start,
      end: start + dur,
      dur,
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
