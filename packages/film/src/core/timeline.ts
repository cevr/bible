// Named cues: a scene's moments, declared once as data beside its drawing.
// Each span anchors to a narration mark, another cue or a scene landmark —
// never to an absolute second — so a re-recorded take carries every cue with
// it. Resolved once per layout; the picture and the sound both read the result.
// Pure and DOM-free.

import { Option } from 'effect';
import type { CuePatch, ResolvedCue, Span, Timeline } from './schema.ts';
import { DEFAULT_EASE, type Key, ease, keys, progress } from './time.ts';

/** 0→1 across a cue at scene time `t`, eased by the cue's own ease. */
export const cueProgress = (cue: ResolvedCue, t: number): number =>
  progress(t, cue.start, cue.dur, ease[cue.ease]);

/**
 * 0→1 for item `i` of `n` across a staggered cue at scene time `t`, eased by
 * the cue's ease. The items' starts spread evenly over the cue's `stagger`
 * share, the first at its start, and each lasts the rest, the last ending
 * with the cue; so a `dur` edit scales every item. One item is the whole cue.
 */
export const staggerProgress = (cue: ResolvedCue, t: number, i: number, n: number): number => {
  if (n <= 1) return cueProgress(cue, t);
  const lead = (cue.stagger * i) / (n - 1);
  return progress(t, cue.start + cue.dur * lead, cue.dur * (1 - cue.stagger), ease[cue.ease]);
};

/**
 * Keyframes across a cue at scene time `t`. Each key's time is a fraction of
 * the cue (0 its start, 1 its end), so a `dur` edit stretches the motion; a
 * key that names no ease takes the cue's, so an `ease` edit reshapes it.
 */
export const cueKeys = (cue: ResolvedCue, t: number, frames: ReadonlyArray<Key>): number => {
  if (cue.dur <= 0) return keys(t >= cue.start ? 1 : 0, frames, cue.ease);
  return keys((t - cue.start) / cue.dur, frames, cue.ease);
};

/** A span's anchor alone: the field that says where it starts. */
const anchorField = (span: Span) => {
  if ('mark' in span) return { mark: span.mark };
  if ('after' in span) return { after: span.after };
  if ('with' in span) return { with: span.with };
  return { scene: span.scene };
};

/** A span's end: its `dur`, or the mark it runs `until`. */
const endField = (span: Span, patch: CuePatch) => {
  if (patch.until !== undefined) return { until: patch.until };
  if (patch.dur !== undefined) return { dur: patch.dur };
  if (span.until !== undefined) return { until: span.until };
  if (span.dur !== undefined) return { dur: span.dur };
  return {};
};

/**
 * `span` with a lab edit applied. A span ends one way, so a `dur` replaces
 * its `until` and an `until` its `dur`.
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
 * body moves the offset, the right edge the dur, the left edge both.
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
  const anchor = cue.start - (span.offset ?? 0);
  if (span.until !== undefined) return untilPatch(span, cue, edge, at, anchor, frame);
  const offset = ms(at.start - anchor);
  const dur = ms(at.end - at.start);
  if (offset === ms(span.offset ?? 0) && dur === ms(cue.dur)) return Option.none();
  if (edge === 'move') return Option.some({ offset });
  if (edge === 'end') return Option.some({ dur });
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

/** What a timeline resolves against. `marks` are speech-relative, as narration gives them. */
export interface SceneClock {
  readonly scene: string;
  readonly marks: ReadonlyMap<string, number>;
  /** Scene-local time the voice starts and ends. */
  readonly speechStart: number;
  readonly speechEnd: number;
  readonly dur: number;
}

/** Resolve every cue in dependency order. Unknown names and cycles are authoring errors. */
export const resolveTimeline = (
  timeline: Timeline | undefined,
  clock: SceneClock,
): ReadonlyMap<string, ResolvedCue> => {
  const out = new Map<string, ResolvedCue>();
  if (timeline === undefined) return out;
  const visiting = new Set<string>();

  const resolve = (name: string, from: string | undefined): ResolvedCue => {
    const done = out.get(name);
    if (done !== undefined) return done;
    const span = Object.hasOwn(timeline, name) ? timeline[name] : undefined;
    if (span === undefined)
      throw new Error(`scene ${clock.scene}: cue "${from}" refers to unknown cue "${name}"`);
    if (visiting.has(name))
      throw new Error(
        `scene ${clock.scene}: cue "${name}" is part of a cycle (${[...visiting, name].join(' → ')})`,
      );
    visiting.add(name);
    const start = anchor(name, span) + (span.offset ?? 0);
    visiting.delete(name);
    const dur = length(name, span, start);
    const cue = {
      start,
      end: start + dur,
      dur,
      ease: span.ease ?? DEFAULT_EASE,
      stagger: span.stagger ?? 0,
    };
    out.set(name, cue);
    return cue;
  };

  /** How long a cue that starts at `start` lasts: its `dur`, or up to its `until` mark. */
  const length = (name: string, span: Span, start: number): number => {
    if (span.until === undefined) return span.dur ?? 0;
    const m = clock.marks.get(span.until);
    if (m === undefined)
      throw new Error(`scene ${clock.scene}: cue "${name}" ends at unknown mark {${span.until}}`);
    const dur = clock.speechStart + m - start;
    if (dur < 0)
      throw new Error(
        `scene ${clock.scene}: cue "${name}" ends at {${span.until}}, before it starts`,
      );
    return dur;
  };

  const anchor = (name: string, span: Span): number => {
    if ('mark' in span) {
      const m = clock.marks.get(span.mark);
      if (m === undefined)
        throw new Error(`scene ${clock.scene}: cue "${name}" names unknown mark {${span.mark}}`);
      return clock.speechStart + m;
    }
    if ('after' in span) return resolve(span.after, name).end;
    if ('with' in span) return resolve(span.with, name).start;
    switch (span.scene) {
      case 'start':
        return 0;
      case 'speech':
        return clock.speechStart;
      case 'speechEnd':
        return clock.speechEnd;
      case 'end':
        return clock.dur;
    }
  };

  for (const name of Object.keys(timeline)) resolve(name, undefined);
  return out;
};
