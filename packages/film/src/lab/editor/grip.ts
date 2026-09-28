// What a press on the cue strip grabs, and where a drag of it lands: pure, so
// the editor's machine and its tests share it. On the strip a cue's body moves
// its offset, its left edge its start (offset and dur), its right edge its end
// (dur). A bar too short for two edges and a body (under 3 × EDGE_PX) is all
// body; alt grabs its end. A cue that runs `until` a mark keeps ending on it
// (`dragPatch`). Edges snap to word starts and ends, marks and other cues'
// edges within SNAP_PX, else move by whole frames; shift places them freely.

import { Array as Arr, Match, Option, Schema } from 'effect';
import type { SceneEdit, SceneSpec } from '../../canvas/film.ts';
import type { Placed } from '../../core/layout.ts';
import {
  CuePatch,
  Knob,
  Knobs,
  type LabWrite,
  ResolvedCue,
  type SceneSource,
  Span,
  Timeline,
} from '../../core/schema.ts';
import { type DragEdge, dragPatch, patchSpan } from '../../core/timeline.ts';
import { StepVerb } from '../api.ts';

/** How near (screen pixels) an edge must come to a word, mark or cue edge to snap to it. */
export const SNAP_PX = 8;
/** How wide (screen pixels) a cue's edge is to grab. */
export const EDGE_PX = 6;

/**
 * What a press `x` pixels into a cue's bar `width` wide grabs. A bar under
 * 3 × EDGE_PX has no room for two edges and a body, so it is all body (its
 * offset), or its end (dur) with alt held.
 */
export const dragModeAt = (x: number, width: number, alt: boolean): DragEdge => {
  if (width < EDGE_PX * 3) {
    if (alt) return 'end';
    return 'move';
  }
  if (x < EDGE_PX) return 'start';
  if (width - x < EDGE_PX) return 'end';
  return 'move';
};

/** What an edge may snap to: scene-local seconds, and how many pixels a second is on the strip. */
export interface Snap {
  readonly targets: ReadonlyArray<number>;
  readonly perSec: number;
  readonly fps: number;
}

/**
 * Where an edge at `edge` lands when dragged by `dt`: on a word, mark or cue
 * edge within SNAP_PX, else moved by whole frames (so an offset of 0.1 dragged
 * nine frames at 30 fps reads 0.4); `free` (shift) places it where it is.
 */
export const snapEdge = (edge: number, dt: number, near: Snap, free: boolean): number => {
  const t = edge + dt;
  if (free) return t;
  const within = SNAP_PX / near.perSec;
  const nearest = near.targets.reduce<Option.Option<number>>((best, s) => {
    const gap = Math.abs(s - t);
    if (gap >= within) return best;
    return Option.match(best, {
      onNone: () => Option.some(s),
      onSome: (b) => {
        if (gap < Math.abs(b - t)) return Option.some(s);
        return best;
      },
    });
  }, Option.none());
  return Option.getOrElse(nearest, () => edge + Math.round(dt * near.fps) / near.fps);
};

/** Where an edge may snap in `p`: its words, its marks, and its other cues' edges. */
export const snapTargets = (
  p: Placed<SceneSpec>,
  cues: ReadonlyMap<string, ResolvedCue>,
  skip: string,
): ReadonlyArray<number> => [
  ...p.voice.words.flatMap((w) => [p.speechStart + w.start, p.speechStart + w.end]),
  ...[...p.voice.marks.values()].map((m) => p.speechStart + m),
  ...[...cues].filter(([name]) => name !== skip).flatMap(([, c]) => [c.start, c.end]),
];

/** A press on a cue's bar: everything its drag needs, taken at the press. */
export const CueGrip = Schema.TaggedStruct('CueGrip', {
  scene: Schema.String,
  cue: Schema.String,
  edge: Schema.Literals(['move', 'start', 'end']),
  /** The pointer's screen x at the press. */
  x0: Schema.Finite,
  /** Screen pixels per scene second on the strip. */
  perSec: Schema.Finite,
  fps: Schema.Finite,
  /** The cue's span as shown at the press. */
  span: Span,
  /** The scene's timeline as shown at the press. */
  timeline: Timeline,
  /** The cue as resolved at the press. */
  cue0: ResolvedCue,
  targets: Schema.Array(Schema.Finite),
});
export type CueGrip = typeof CueGrip.Type;

/** Where the pointer is: screen x and y, and whether shift is held. */
export const Pointer = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, shift: Schema.Boolean });
export type Pointer = typeof Pointer.Type;

export const CueWrite = Schema.TaggedStruct('CueWrite', {
  scene: Schema.String,
  cue: Schema.String,
  patch: CuePatch,
});
export type CueWrite = typeof CueWrite.Type;

export const KnobWrite = Schema.TaggedStruct('KnobWrite', {
  scene: Schema.String,
  knob: Schema.String,
  value: Knob,
});
export type KnobWrite = typeof KnobWrite.Type;

export const StepWrite = Schema.TaggedStruct('StepWrite', { verb: StepVerb });
export type StepWrite = typeof StepWrite.Type;

/** One write to a scene file: a cue's fields, a knob's value, or an undo or redo. */
export const Write = Schema.Union([CueWrite, KnobWrite, StepWrite]);
export type Write = typeof Write.Type;

/** An edit shown in memory: a scene's timeline, or its knobs, standing in for the drawing's. */
export const Edit = Schema.Struct({
  timeline: Schema.optionalKey(Timeline),
  knobs: Schema.optionalKey(Knobs),
});

/** Where a drag has got to: the write its release makes (none when back where it began) and the edit it shows. */
export interface Dragged {
  readonly write: Option.Option<CueWrite>;
  readonly scene: string;
  readonly edit: SceneEdit;
}

/** Where the bar of a cue grabbed by `grip` sits with the pointer at `pointer`. */
const barAt = (grip: CueGrip, pointer: Pointer) => {
  const dt = (pointer.x - grip.x0) / grip.perSec;
  const c0 = grip.cue0;
  const near: Snap = grip;
  if (grip.edge === 'move') {
    const start = snapEdge(c0.start, dt, near, pointer.shift);
    return { start, end: start + c0.dur };
  }
  if (grip.edge === 'start')
    return { start: Math.min(snapEdge(c0.start, dt, near, pointer.shift), c0.end), end: c0.end };
  return { start: c0.start, end: Math.max(snapEdge(c0.end, dt, near, pointer.shift), c0.start) };
};

/** A cue grabbed by `grip`, dragged to `pointer`. */
export const dragCue = (grip: CueGrip, pointer: Pointer): Dragged => {
  const patch = dragPatch(grip.span, grip.cue0, grip.edge, barAt(grip, pointer), 1 / grip.fps);
  const span = Option.match(patch, {
    onNone: () => grip.span,
    onSome: (q) => patchSpan(grip.span, q),
  });
  return {
    write: Option.map(patch, (q) => CueWrite.make({ scene: grip.scene, cue: grip.cue, patch: q })),
    scene: grip.scene,
    edit: { timeline: { ...grip.timeline, [grip.cue]: span } },
  };
};

const NEEDS = {
  move: ['offset'],
  end: ['dur'],
  start: ['offset', 'dur'],
} as const satisfies Record<DragEdge, ReadonlyArray<'offset' | 'dur'>>;

const PAST = { undo: 'undid', redo: 'redid' } as const;

/**
 * Why a drag of `cue` at `edge` cannot write, when it cannot: the scene has no
 * source the lab can read (`error`, as the server said), its timeline is one
 * the lab will not rewrite, or a field the drag sets is computed in source.
 */
export const cueRefusal = (
  source: Option.Option<SceneSource>,
  error: string,
  cue: string,
  edge: DragEdge,
): Option.Option<string> =>
  Option.match(source, {
    onNone: () => Option.some(`cannot edit: ${error || 'no source for this scene'}`),
    onSome: (s) => {
      const needs: ReadonlyArray<'offset' | 'dur'> = NEEDS[edge];
      const refused = Arr.findFirst(s.refused, (r) => r.field === 'timeline');
      if (Option.isSome(refused)) return Option.some(`cannot drag ${cue}: ${refused.value.reason}`);
      const writable = Option.exists(
        Arr.findFirst(s.cues, (c) => c.name === cue),
        (found) => needs.every((f) => found[f] !== 'computed'),
      );
      if (writable) return Option.none();
      return Option.some(
        `cannot drag ${cue}: its ${needs.join(' and ')} is computed in the source`,
      );
    },
  });

/** What the status line says once `write` has landed as `result`. */
export const wroteNote = (write: Write, result: LabWrite): string =>
  Match.value(write).pipe(
    Match.tag(
      'StepWrite',
      (s) => `${PAST[s.verb]} ${result.target.replace(/^(undo|redo) /, '')} in ${result.file}`,
    ),
    Match.orElse(() => {
      const unresolved = Option.match(Option.fromUndefinedOr(result.unresolved), {
        onNone: () => '',
        onSome: (why) => ` (not resolved: ${why})`,
      });
      return `wrote ${result.file}: ${result.target}${unresolved}`;
    }),
  );
