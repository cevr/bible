// The lab's loop, as one machine: A and B (the in and out points, as the
// panel says them) mark a range of film seconds, and
// once B lies after A the range loops, played from A; the selected cue loops
// its span as the timeline shows it now, played from its start (a cue edited
// while it loops is followed: `rangeOf` reads its span afresh each frame).
// Off stops looping.
//
//   Off | Marked | Range | Cue ─MarkA | MarkB→ Marked (no range yet) | Range
//                                ─LoopCue→ Cue ─Stop→ Off
//
// The player's clock is the stage's (`Stage.playFrom`); the machine touches
// no DOM. The view (sessionStorage) keeps a range or a cue through the reload
// a write causes, and the page starts in it without playing.

import { Effect, Match, Option, Schema } from 'effect';
import { Event, Machine, State } from 'effect-machine';
import { timecode } from '../../core/time.ts';
import type { LoopRange } from '../../player/main.ts';
import type { LabView } from '../view-state.ts';
import { Stage, type StageOps } from '../stage.ts';

/** A cue shorter than this loops with CUE_PAD either side, or there is nothing to watch. */
const SHORT_CUE = 0.2;
const CUE_PAD = 0.4;

export const LoopState = State({
  Off: {},
  /** A or B marked, and no range yet: no A, or B not after it. */
  Marked: { a: Schema.Option(Schema.Finite), b: Schema.Option(Schema.Finite) },
  /** A to B loops. */
  Range: { from: Schema.Finite, to: Schema.Finite },
  /** The cue loops, following its edits. */
  Cue: { scene: Schema.String, name: Schema.String },
});
export type LoopState = typeof LoopState.Type;

export const LoopEvent = Event({
  /** A marked at `t`, film seconds. */
  MarkA: { t: Schema.Finite },
  MarkB: { t: Schema.Finite },
  LoopCue: { scene: Schema.String, name: Schema.String },
  Stop: {},
});
export type LoopEvent = typeof LoopEvent.Type;

/** Every state: a mark, a cue or Off is taken in any of them. */
const ANY = [LoopState.Off, LoopState.Marked, LoopState.Range, LoopState.Cue] as const;

/** The A a state has marked, if any. */
const aOf = (state: LoopState): Option.Option<number> =>
  Match.value(state).pipe(
    Match.tag('Marked', (s) => s.a),
    Match.tag('Range', (s) => Option.some(s.from)),
    Match.orElse(() => Option.none()),
  );

/** The B a state has marked, if any. */
const bOf = (state: LoopState): Option.Option<number> =>
  Match.value(state).pipe(
    Match.tag('Marked', (s) => s.b),
    Match.tag('Range', (s) => Option.some(s.to)),
    Match.orElse(() => Option.none()),
  );

/** The span of `cue` as a loop plays it: padded when it is too short to watch. */
const padCue = (span: LoopRange, duration: number): LoopRange => {
  if (span.to - span.from >= SHORT_CUE) return span;
  return {
    from: Math.max(0, span.from - CUE_PAD),
    to: Math.min(duration, span.to + CUE_PAD),
  };
};

/** The in and out points `state` has marked as a range (a note written now is about it), if any. */
export const inOutOf = (state: LoopState): Option.Option<LoopRange> =>
  Match.value(state).pipe(
    Match.tag('Range', (s) => Option.some({ from: s.from, to: s.to })),
    Match.orElse(() => Option.none()),
  );

/** What `state` loops now, if anything: a cue's span as the stage shows it. */
export const rangeOf = (
  state: LoopState,
  stage: Pick<StageOps, 'cueSpan' | 'duration'>,
): Option.Option<LoopRange> =>
  Match.value(state).pipe(
    Match.tag('Range', (s) => Option.some({ from: s.from, to: s.to })),
    Match.tag('Cue', (s) =>
      Option.map(stage.cueSpan(s.scene, s.name), (span) => padCue(span, stage.duration)),
    ),
    Match.orElse(() => Option.none()),
  );

/** Mark A and B as `a` and `b`: a range once B lies after A, played from A. */
const mark = (a: Option.Option<number>, b: Option.Option<number>) =>
  Option.match(
    Option.filter(Option.all({ a, b }), (m) => m.b > m.a),
    {
      onNone: () => Effect.succeed(LoopState.Marked({ a, b })),
      onSome: (m) =>
        Stage.use((stage) =>
          Effect.as(stage.playFrom(m.a), LoopState.Range({ from: m.a, to: m.b })),
        ),
    },
  );

/** The loop machine, starting in `initial` (the view's, after a reload). */
export const loopMachine = (initial: LoopState) =>
  Machine.make({ state: LoopState, event: LoopEvent, initial })
    .on(ANY, LoopEvent.MarkA, ({ state, event }) => mark(Option.some(event.t), bOf(state)))
    .on(ANY, LoopEvent.MarkB, ({ state, event }) => mark(aOf(state), Option.some(event.t)))
    .on(ANY, LoopEvent.LoopCue, ({ event }) => {
      const cue = LoopState.Cue({ scene: event.scene, name: event.name });
      return Stage.use((stage) =>
        Option.match(rangeOf(cue, stage), {
          onNone: () => Effect.succeed(cue),
          onSome: (range) => Effect.as(stage.playFrom(range.from), cue),
        }),
      );
    })
    .on(ANY, LoopEvent.Stop, () => LoopState.Off);

/** The loop's actor, started in `initial`. */
export const spawnLoop = (initial: LoopState) =>
  Machine.spawn(loopMachine(initial)).pipe(Effect.tap((actor) => actor.start));

export type LoopActor = Effect.Success<ReturnType<typeof spawnLoop>>;

/** What the panel says of `state`, each point in timecode at `fps`. */
export const loopText = (state: LoopState, fps: number): string => {
  const at = (t: number) => timecode(t, fps);
  return Match.value(state).pipe(
    Match.tagsExhaustive({
      Off: () => '',
      Marked: (s) =>
        Option.match(s.a, {
          onNone: () =>
            Option.match(s.b, {
              onNone: () => '',
              onSome: (b) => `out ${at(b)}: set the in point before it`,
            }),
          onSome: (a) =>
            Option.match(s.b, {
              onNone: () => `in ${at(a)}`,
              onSome: (b) => `in ${at(a)} · out ${at(b)}: set the out point after the in point`,
            }),
        }),
      Range: (s) => `looping in ${at(s.from)} – out ${at(s.to)}`,
      Cue: (s) => `looping ${s.name}`,
    }),
  );
};

type ViewLoop = NonNullable<LabView['loop']>;

/** The loop as the view keeps it through a reload: a range or a cue, else none. */
export const loopView = (state: LoopState): Option.Option<ViewLoop> =>
  Match.value(state).pipe(
    Match.tag('Range', (s): Option.Option<ViewLoop> =>
      Option.some({ kind: 'ab', from: s.from, to: s.to }),
    ),
    Match.tag('Cue', (s): Option.Option<ViewLoop> =>
      Option.some({ kind: 'cue', scene: s.scene, name: s.name }),
    ),
    Match.orElse(() => Option.none()),
  );

/** The loop the view kept, as the machine starts in it. */
export const loopFromView = (kept: Option.Option<ViewLoop>): LoopState =>
  Option.match(kept, {
    onNone: () => LoopState.Off,
    onSome: (loop): LoopState => {
      if (loop.kind === 'ab') return LoopState.Range({ from: loop.from, to: loop.to });
      return LoopState.Cue({ scene: loop.scene, name: loop.name });
    },
  });
