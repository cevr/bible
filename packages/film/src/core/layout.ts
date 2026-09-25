// The film clock, without the canvas: scenes laid end to end, each sized to its
// voice. Pure — the player, the renderer and the Bun scripts all read it, and
// it names no drawing type, so it runs where there is no DOM.

import { type SceneVoice, voiceFor } from './narration.ts';
import type { Timed, Timings, Transition, Word } from './schema.ts';
import { type ResolvedCue, resolveTimeline } from './timeline.ts';

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
}

export const transitionDur = (t: Transition | undefined) =>
  t === undefined || t.kind === 'cut' ? 0 : t.dur;

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
    const lead = spec.lead ?? Math.max(0.5, transitionDur(spec.enter) * 0.7);
    const tail = spec.tail ?? 0.9;
    const dur = Math.max(spec.min ?? 0, voice.duration > 0 ? lead + voice.duration + tail : 3);
    const speechStart = voice.duration > 0 ? lead : 0;
    const cues = resolveTimeline(spec.timeline, {
      scene: spec.id,
      marks: voice.marks,
      speechStart,
      speechEnd: speechStart + voice.duration,
      dur,
    });
    out.push({ spec, index, start, dur, voice, speechStart, cues });
    start += dur;
  });
  return out;
};

/** Group words into short caption lines, breaking at punctuation. */
export const captionLines = (words: ReadonlyArray<Word>, max = 7): Word[][] => {
  const out: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= max || /[.!?;:,—]["”’)]*$/.test(w.text)) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length > 0) out.push(cur);
  return out;
};
