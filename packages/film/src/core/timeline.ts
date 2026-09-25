// Named cues: a scene's moments, declared once as data beside its drawing.
// Each span anchors to a narration mark, another cue or a scene landmark —
// never to an absolute second — so a re-recorded take carries every cue with
// it. Resolved once per layout; the picture and the sound both read the result.
// Pure and DOM-free.

import type { EaseName, Span, Timeline } from './schema.ts';
import { type Ease, ease, progress } from './time.ts';

/** The ease a cue declares none of: the same curve `progress` defaults to. */
export const DEFAULT_EASE: EaseName = 'inOutCubic';

/** A cue on the scene clock, in scene-local seconds, with the ease `f.at` applies across it. */
export interface ResolvedCue {
  readonly start: number;
  readonly end: number;
  readonly dur: number;
  readonly ease: EaseName;
}

/** 0→1 across a cue at scene time `t`: eased by `e` when given, else by the cue's own ease. */
export const cueProgress = (cue: ResolvedCue, t: number, e?: Ease): number =>
  progress(t, cue.start, cue.dur, e ?? ease[cue.ease]);

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
    const dur = span.dur ?? 0;
    const cue = { start, end: start + dur, dur, ease: span.ease ?? DEFAULT_EASE };
    out.set(name, cue);
    return cue;
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
