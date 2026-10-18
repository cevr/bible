// An edit's ripple on the timeline the studio shows, before the lab has
// read the version again: a beat moved (the beats laid end to end in the
// new order) or a beat's hold set (its length grows or shrinks by the
// change, and a lead moves its words and marks with it), every later beat
// following. Each clip that names a beat moves with that beat (Board panels,
// takes, scenes, notes), a score movement and an act band with the beat they
// begin on (`from`), each ending where the next begins; a render is of the
// cut it was made from, and stays. The lab's own read of the version
// replaces it once the write lands (`film-timeline.ts` lays the clock
// out the same way).
//
// The playhead's place through an edit (`anchorOf`, `anchoredT`): the beat
// it stands in, how far into it, and whether it stands in the beat's words,
// so it comes back to the same moment of the same beat once the beat has
// moved or its lead has changed. Pure.

import { Array as Arr, Boolean as Bool, Match, Option, Result } from 'effect';
import { movedOrder, type HoldEdge, type MovedBefore } from '../../core/beat-edit.ts';
import { CLOCK_EPSILON, justBefore, onTheMs } from '../../core/time.ts';
import type { ClockPart, FilmTimeline, Lane, ScriptClip } from '../../core/timeline-schema.ts';

/** `t` on the millisecond, never a negative zero. */
const ms = (t: number): number => onTheMs(t) + 0;

/** An edit shown before it is written: a beat moved, or a beat's hold from one value to another. */
export type Preview =
  | { readonly _tag: 'Move'; readonly beat: string; readonly before: MovedBefore }
  | {
      readonly _tag: 'Hold';
      readonly beat: string;
      readonly edge: HoldEdge;
      readonly from: number;
      readonly to: number;
    };

/** The script's beats, in film order. */
export const scriptOf = (timeline: FilmTimeline): ReadonlyArray<ScriptClip> =>
  timeline.lanes.flatMap((lane) =>
    Match.value(lane).pipe(
      Match.when({ track: 'script' }, (l) => l.clips),
      Match.orElse(() => []),
    ),
  );

/** How one beat lands: where it began and begins now, its length then and now, and how far its words moved inside it. */
interface Landed {
  readonly was: ScriptClip;
  readonly start: number;
  readonly dur: number;
  /** Seconds its words (and marks) moved inside it: a lead's change. */
  readonly inner: number;
}

/** Each beat as an edit lays it, by id, and the film's length after it. */
interface Landings {
  readonly by: ReadonlyMap<string, Landed>;
  readonly duration: number;
}

/** Each beat as `preview` lays it. */
const landings = (beats: ReadonlyArray<ScriptClip>, preview: Preview): Landings => {
  const ids = beats.map((b) => b.beat);
  const order = Match.value(preview).pipe(
    Match.tag('Move', (m) => Result.getOrElse(movedOrder(ids, m.beat, m.before), () => ids)),
    Match.orElse(() => ids),
  );
  const change = (beat: string) =>
    Match.value(preview).pipe(
      Match.tag('Hold', (h) => Option.liftPredicate(h, (x) => x.beat === beat)),
      Match.orElse(() => Option.none<Extract<Preview, { _tag: 'Hold' }>>()),
    );
  const named = new Map(beats.map((b) => [b.beat, b]));
  const first = Option.getOrElse(
    Option.map(Arr.head(beats), (b) => b.start),
    () => 0,
  );
  const by = new Map<string, Landed>();
  let at = first;
  for (const id of order)
    Option.map(Option.fromUndefinedOr(named.get(id)), (was) => {
      const delta = Option.match(change(id), { onNone: () => 0, onSome: (h) => h.to - h.from });
      const inner = Option.match(change(id), {
        onNone: () => 0,
        onSome: (h) =>
          Match.value(h.edge).pipe(
            Match.when('lead', () => delta),
            Match.orElse(() => 0),
          ),
      });
      const dur = ms(Math.max(0, was.dur + delta));
      by.set(id, { was, start: ms(at), dur, inner });
      at += dur;
    });
  const laid: Landings = { by, duration: ms(at) };
  return laid;
};

/** Film second `t` of beat `l` as it was, where it falls once the beat has landed; `end` for a span's end at the beat's end. */
const remap = (l: Landed, t: number, end: boolean): number => {
  const local = t - l.was.start;
  if (end && Math.abs(t - (l.was.start + l.was.dur)) < CLOCK_EPSILON) return ms(l.start + l.dur);
  const words = local + CLOCK_EPSILON >= l.was.hold.lead && local > 0;
  const moved = l.start + local + Bool.match(words, { onTrue: () => l.inner, onFalse: () => 0 });
  return ms(Math.min(l.start + l.dur, Math.max(l.start, moved)));
};

/** Parts (acts, movements) laid on their `from` beats, each ending where the next begins or at the film's end. */
const partsLanded = <P extends { readonly from: string; readonly start: number }>(
  parts: ReadonlyArray<P>,
  by: ReadonlyMap<string, Landed>,
  duration: number,
): ReadonlyArray<P & { readonly end: number }> => {
  const started = parts
    .map((p) => ({
      part: p,
      start: Option.getOrElse(
        Option.map(Option.fromUndefinedOr(by.get(p.from)), (l) => l.start),
        () => p.start,
      ),
    }))
    .toSorted((a, b) => a.start - b.start);
  return started.map(({ part, start }, i) => ({
    ...part,
    start,
    end: Option.getOrElse(
      Option.map(Arr.get(started, i + 1), (n) => n.start),
      () => duration,
    ),
  }));
};

/** A clip of beat `beat` spanning `start`–`start + dur`, once that beat has landed. */
const spanOf = (
  by: ReadonlyMap<string, Landed>,
  beat: string,
  clip: { readonly start: number; readonly dur: number },
) =>
  Option.match(Option.fromUndefinedOr(by.get(beat)), {
    onNone: () => ({ start: clip.start, dur: clip.dur }),
    onSome: (l) => {
      const start = remap(l, clip.start, false);
      return { start, dur: ms(remap(l, clip.start + clip.dur, true) - start) };
    },
  });

const byStart = <C extends { readonly start: number }>(clips: ReadonlyArray<C>) =>
  clips.toSorted((a, b) => a.start - b.start);

/** `timeline` as it shows with `preview` applied, before the lab reads it again. */
export const rippled = (timeline: FilmTimeline, preview: Preview): FilmTimeline => {
  const { by, duration } = landings(scriptOf(timeline), preview);
  const movements = partsLanded(
    timeline.lanes.flatMap((lane) =>
      Match.value(lane).pipe(
        Match.when({ track: 'sound' }, (l) => l.clips),
        Match.orElse(() => []),
      ),
    ),
    by,
    duration,
  );
  const lanes = timeline.lanes.map((lane): Lane =>
    Match.value(lane).pipe(
      Match.discriminatorsExhaustive('track')({
        script: (l) => ({
          ...l,
          clips: byStart(
            l.clips.map((c) =>
              Option.match(Option.fromUndefinedOr(by.get(c.beat)), {
                onNone: () => c,
                onSome: (landed): ScriptClip => ({
                  ...c,
                  start: landed.start,
                  dur: landed.dur,
                  marks: c.marks.map((m) => ({ ...m, at: remap(landed, m.at, false) })),
                  ...Option.match(Option.fromUndefinedOr(c.speech), {
                    onNone: () => ({}),
                    onSome: (s) => ({
                      speech: {
                        start: remap(landed, s.start, false),
                        end: remap(landed, s.end, false),
                      },
                    }),
                  }),
                  hold: Match.value(preview).pipe(
                    Match.tag('Hold', (h) =>
                      Bool.match(h.beat === c.beat, {
                        onTrue: () => ({ ...c.hold, [h.edge]: h.to }),
                        onFalse: () => c.hold,
                      }),
                    ),
                    Match.orElse(() => c.hold),
                  ),
                }),
              }),
            ),
          ),
        }),
        board: (l) => ({
          ...l,
          clips: byStart(
            l.clips.map((c) => ({
              ...c,
              ...spanOf(by, c.beat, c),
              markAt: Option.match(Option.fromUndefinedOr(by.get(c.beat)), {
                onNone: () => c.markAt,
                onSome: (landed) => remap(landed, c.markAt, false),
              }),
            })),
          ),
        }),
        voice: (l) => ({
          ...l,
          clips: byStart(l.clips.map((c) => ({ ...c, ...spanOf(by, c.beat, c) }))),
        }),
        scenes: (l) => ({
          ...l,
          clips: byStart(l.clips.map((c) => ({ ...c, ...spanOf(by, c.beat, c) }))),
        }),
        sound: (l) => ({
          ...l,
          clips: movements.map(({ end, ...c }) => ({ ...c, dur: ms(end - c.start) })),
        }),
        render: (l) => l,
      }),
    ),
  );
  return {
    ...timeline,
    duration,
    bands: partsLanded<ClockPart>(timeline.bands, by, duration),
    lanes,
    markers: timeline.markers.map((m) =>
      Match.value(m).pipe(
        Match.discriminatorsExhaustive('kind')({
          ask: (a) => a,
          note: (n) => ({
            ...n,
            at: Option.match(Option.fromUndefinedOr(by.get(n.beat)), {
              onNone: () => n.at,
              onSome: (landed) => remap(landed, n.at, false),
            }),
          }),
        }),
      ),
    ),
  };
};

/** Where the playhead stands on a timeline: in which beat, how far in, and whether in its words. */
export interface Anchor {
  readonly beat: string;
  readonly local: number;
  /** The beat's lead as it stood. */
  readonly lead: number;
}

/** The playhead at `T` on `timeline`, anchored to its beat; none past every beat. */
export const anchorOf = (timeline: FilmTimeline, T: number): Option.Option<Anchor> =>
  Option.map(
    Arr.findFirst(scriptOf(timeline), (b) => T >= b.start && T < b.start + b.dur),
    (b) => ({ beat: b.beat, local: T - b.start, lead: b.hold.lead }),
  );

/**
 * The film second of `anchor` on `timeline` (the version read again after an
 * edit or its undo): the same moment of its words when it stood in them (a
 * lead's change moves them), else as far into the beat, inside its length;
 * `T` when the beat is gone.
 */
export const anchoredT = (timeline: FilmTimeline, anchor: Anchor, T: number): number =>
  Option.match(
    Arr.findFirst(scriptOf(timeline), (b) => b.beat === anchor.beat),
    {
      onNone: () => Math.min(T, timeline.duration),
      onSome: (b) => {
        const local = Bool.match(anchor.local >= anchor.lead, {
          onTrue: () => anchor.local - anchor.lead + b.hold.lead,
          onFalse: () => Math.min(anchor.local, b.hold.lead),
        });
        return ms(b.start + Math.min(Math.max(0, local), Math.max(0, justBefore(b.dur))));
      },
    },
  );
