// The film clock, without the canvas: scenes laid end to end, each sized to its
// voice. Pure — the player, the renderer and the Bun scripts all read it, and
// it names no drawing type, so it runs where there is no DOM. A film that does
// not lay out fails as a value naming the scene (and cue) at fault.

import { Array as Arr, Option, Result } from 'effect';
import {
  DuplicateScene,
  type LineError,
  type PointError,
  UnknownCue,
  UnknownScene,
} from './errors.ts';
import { type SceneVoice, voiceFor } from './narration.ts';
import type { Knob, ResolvedCue, ScenePoint, Timed, Timings, Transition } from './schema.ts';
import { CLOCK_EPSILON } from './time.ts';
import { type SceneClock, type TimelineError, pointOn, resolveTimeline } from './timeline.ts';

export interface Placed<S extends Timed = Timed> {
  readonly spec: S;
  readonly index: number;
  readonly start: number;
  readonly dur: number;
  readonly voice: SceneVoice;
  /** Scene-local time the voice starts. */
  readonly speechStart: number;
  /** The scene's named cues, scene-local. */
  readonly cues: ReadonlyMap<string, ResolvedCue>;
  /** The scene's knobs, as its drawing declares them. */
  readonly knobs: ReadonlyMap<string, Knob>;
}

export const transitionDur = (t: Transition | undefined) =>
  t === undefined || t.kind === 'cut' ? 0 : t.dur;

const clockOf = (
  scene: string,
  voice: SceneVoice,
  speechStart: number,
  dur: number,
): SceneClock => ({
  scene,
  marks: voice.marks,
  words: voice.words,
  speechStart,
  speechEnd: speechStart + voice.duration,
  dur,
});

/**
 * The clock a placed scene's timeline resolved on: resolving another timeline
 * on it (the lab's preview of a dragged cue, a timeline read back from source)
 * places each cue exactly as `layout()` would.
 */
export const sceneClock = (p: Placed): SceneClock =>
  clockOf(p.spec.id, p.voice, p.speechStart, p.dur);

/** The shortest lead before a scene's words: a long entrance lengthens it (`enter` × 0.7). */
export const MIN_LEAD = 0.5;

/** The time after a scene's last word, unless it declares a `tail`. */
export const DEFAULT_TAIL = 0.1;

/** Why a film does not lay out: two scenes with one id, a line that does not parse, or a timeline that does not resolve. */
export type LayoutError = DuplicateScene | LineError | TimelineError;

/** Lay scenes end to end. Pure. */
export const layout = <S extends Timed>(
  scenes: ReadonlyArray<S>,
  timings: Timings | undefined,
): Result.Result<Placed<S>[], LayoutError> => {
  const out: Placed<S>[] = [];
  let start = 0;
  const ids = new Set<string>();
  for (const [index, spec] of scenes.entries()) {
    if (ids.has(spec.id)) return Result.fail(DuplicateScene.make({ scene: spec.id }));
    ids.add(spec.id);
    const said = voiceFor(spec.id, spec.say ?? '', timings);
    if (Result.isFailure(said)) return Result.fail(said.failure);
    const voice = said.success;
    const lead = spec.lead ?? Math.max(MIN_LEAD, transitionDur(spec.enter) * 0.7);
    // With the minimum lead, the default seam between two scenes' words is
    // MIN_LEAD + DEFAULT_TAIL = 0.6 s (the film skill's CRAFT rule 9); a meant
    // pause sets `tail`.
    const tail = spec.tail ?? DEFAULT_TAIL;
    const dur = Math.max(spec.min ?? 0, voice.duration > 0 ? lead + voice.duration + tail : 3);
    const speechStart = voice.duration > 0 ? lead : 0;
    const cues = resolveTimeline(spec.timeline, clockOf(spec.id, voice, speechStart, dur));
    if (Result.isFailure(cues)) return Result.fail(cues.failure);
    const knobs = new Map(Object.entries(spec.knobs ?? {}));
    out.push({ spec, index, start, dur, voice, speechStart, cues: cues.success, knobs });
    start += dur;
  }
  return Result.succeed(out);
};

/**
 * Where `point` lands in placed scene `p`, scene-local (`pointOn`): a cue it
 * names is one of the scene's resolved cues. `by` names who asked.
 */
export const pointIn = (
  p: Placed,
  point: ScenePoint,
  by: string,
  edge: 'start' | 'end' = 'start',
): Result.Result<number, PointError> =>
  pointOn(
    sceneClock(p),
    (cue) =>
      Result.fromOption(Option.fromUndefinedOr(p.cues.get(cue)), () =>
        UnknownCue.make({ scene: p.spec.id, cue, by, known: [...p.cues.keys()] }),
      ),
    point,
    by,
    edge,
  );

/** When the film ends: the last placed scene's end, or 0 with no scenes. */
export const filmEnd = (placed: ReadonlyArray<Placed>): number =>
  Option.match(Arr.last(placed), { onNone: () => 0, onSome: (p) => p.start + p.dur });

/** The placed scene `scene` names, or `UnknownScene` listing the scenes there are. */
export const sceneOf = <S extends Timed>(
  placed: ReadonlyArray<Placed<S>>,
  scene: string,
): Result.Result<Placed<S>, UnknownScene> =>
  Result.fromOption(
    Arr.findFirst(placed, (p) => p.spec.id === scene),
    () => UnknownScene.make({ scene, known: placed.map((p) => p.spec.id) }),
  );

/** The placed scenes `ids` name, every one of them checked. */
export const scenesOf = <S extends Timed>(
  placed: ReadonlyArray<Placed<S>>,
  ids: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<Placed<S>>, UnknownScene> =>
  Result.all(ids.map((id) => sceneOf(placed, id)));

/**
 * The index of the placed scene playing at film time `T`: the last to have
 * started by then, so a scene owns its own start (and a transition's frames
 * the incoming scene's), with `CLOCK_EPSILON` of slack for a time computed
 * onto a start (float error, not a frame); the first before the film starts;
 * -1 for a film with no scenes. Allocation-free, so a frame may call it.
 */
export const sceneIndexAt = (
  placed: ReadonlyArray<{ readonly start: number }>,
  T: number,
): number => {
  for (let i = placed.length - 1; i > 0; i--)
    if (T + CLOCK_EPSILON >= Arr.getUnsafe(placed, i).start) return i;
  return Math.min(0, placed.length - 1);
};

/** The placed scene playing at film time `T` (`sceneIndexAt`); none only for a film with no scenes. */
export const sceneAt = <P extends { readonly start: number }>(
  placed: ReadonlyArray<P>,
  T: number,
): Option.Option<P> => Arr.get(placed, sceneIndexAt(placed, T));

/** Whether every scene that speaks has its take recorded: only then is there a mixed track. */
export const everyTakeRecorded = (placed: ReadonlyArray<Placed>): boolean =>
  placed.every((p) => p.voice.duration === 0 || p.voice.recorded);
