// The film clock, without the canvas: scenes laid end to end, each sized to its
// voice. Pure — the player, the renderer and the Bun scripts all read it, and
// it names no drawing type, so it runs where there is no DOM.

import { Array as Arr, Result } from 'effect';
import { UnknownScene } from './errors.ts';
import { type SceneVoice, voiceFor } from './narration.ts';
import type { Knob, ResolvedCue, Timed, Timings, Transition, Word } from './schema.ts';
import { type SceneClock, resolveTimeline } from './timeline.ts';

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

/** Lay scenes end to end. Pure. */
export const layout = <S extends Timed>(
  scenes: ReadonlyArray<S>,
  timings: Timings | undefined,
): Placed<S>[] => {
  const out: Placed<S>[] = [];
  let start = 0;
  const ids = new Set<string>();
  scenes.forEach((spec, index) => {
    if (ids.has(spec.id)) throw new Error(`duplicate scene id ${spec.id}`);
    ids.add(spec.id);
    const voice = voiceFor(spec.id, spec.say ?? '', timings);
    const lead = spec.lead ?? Math.max(MIN_LEAD, transitionDur(spec.enter) * 0.7);
    // With the minimum lead, the default seam between two scenes' words is
    // MIN_LEAD + DEFAULT_TAIL = 0.6 s (the film skill's CRAFT rule 9); a meant
    // pause sets `tail`.
    const tail = spec.tail ?? DEFAULT_TAIL;
    const dur = Math.max(spec.min ?? 0, voice.duration > 0 ? lead + voice.duration + tail : 3);
    const speechStart = voice.duration > 0 ? lead : 0;
    const cues = resolveTimeline(spec.timeline, clockOf(spec.id, voice, speechStart, dur));
    const knobs = new Map(Object.entries(spec.knobs ?? {}));
    out.push({ spec, index, start, dur, voice, speechStart, cues, knobs });
    start += dur;
  });
  return out;
};

/**
 * Group words into short caption lines, breaking at punctuation and before
 * each word in `turns`, where another voice takes over.
 */
export const captionLines = (
  words: ReadonlyArray<Word>,
  turns: ReadonlySet<number> = new Set(),
  max = 7,
): Word[][] => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const [i, w] of words.entries()) {
    if (turns.has(i) && cur.length > 0) {
      out.push(cur);
      cur = [];
    }
    cur.push(w);
    if (cur.length >= max || /[.!?;:,—]["”’)]*$/.test(w.text)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
};

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

/** Whether every scene that speaks has its take recorded: only then is there a mixed track. */
export const everyTakeRecorded = (placed: ReadonlyArray<Placed>): boolean =>
  placed.every((p) => p.voice.duration === 0 || p.voice.recorded);
