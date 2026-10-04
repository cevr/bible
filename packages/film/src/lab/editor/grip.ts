// What a press on the cue strip grabs, and where a drag of it lands: pure, so
// the editor's machine and its tests share it. On the strip a cue's body moves
// its offset, its left edge its start (offset and dur), its right edge its end
// (dur). A bar too short for two edges and a body (under 3 × EDGE_PX) is all
// body; alt grabs its end. A cue that runs `until` a mark keeps ending on it
// (`dragPatch`). Edges snap to word starts and ends, marks and other cues'
// edges within SNAP_PX, else move by whole frames; shift places them freely.
// The inspector's fields of a cue or a knob (`fieldsOf`) write through the
// same writes as a drag, and refuse as a drag of that part would.

import { Array as Arr, Match, Option, Schema } from 'effect';
import type { SceneEdit, SceneSpec } from '../../canvas/film.ts';
import { applyAffine } from '../../core/affine.ts';
import type { Placed } from '../../core/layout.ts';
import { moved } from '../../command/command.ts';
import type { LabSelection } from '../../command/selection.ts';
import { type Inspected, fieldOf } from '../../core/field.ts';
import {
  CueDur,
  CueOffset,
  CuePatch,
  Knob,
  KnobNumber,
  Knobs,
  type LabWrite,
  Pixel,
  Point,
  ResolvedCue,
  type SceneSource,
  Span,
  Timeline,
} from '../../core/schema.ts';
import { toMs } from '../../core/time.ts';
import { type DragEdge, dragPatch, patchSpan } from '../../core/timeline.ts';
import { StepVerb } from '../api.ts';

/** How near (screen pixels) an edge must come to a word, mark or cue edge to snap to it. */
const SNAP_PX = 8;
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
interface Snap {
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

export const StepWrite = Schema.TaggedStruct('StepWrite', {
  verb: StepVerb,
  /**
   * The id this page gave the request, unique to it: the lab records it on
   * the step once it lands, so a step with no answer is known by it, never
   * by a name another change may share.
   */
  request: Schema.String,
});
export type StepWrite = typeof StepWrite.Type;

/** One write to a scene file: a cue's fields, a knob's value, or an undo or redo. */
export const Write = Schema.Union([CueWrite, KnobWrite, StepWrite]);
export type Write = typeof Write.Type;

/** Where a drag has got to: the write its release makes (none when back where it began) and the edit it shows. */
interface Dragged {
  readonly write: Option.Option<CueWrite | KnobWrite>;
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

const AffineSchema = Schema.Tuple([
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
  Schema.Finite,
]);

/**
 * A press on a point knob's handle: everything its drag needs, taken at the
 * press. `point` follows the pointer: the knob moves by the pointer's move
 * taken back through the transform it lands on the frame through. `picture`
 * is a camera's target the camera sits on: the handle cannot leave the
 * frame's centre, so the drag moves the picture with the pointer, and the
 * target by the same move taken back, the other way.
 */
export const KnobGrip = Schema.TaggedStruct('KnobGrip', {
  scene: Schema.String,
  knob: Schema.String,
  mode: Schema.Literals(['point', 'picture']),
  /** The knob's value at the press. */
  from: Point,
  /** From the knob's space onto the frame, and back. */
  m: AffineSchema,
  inv: AffineSchema,
  /** The overlay's screen box: its top-left, and film pixels per screen pixel. */
  frame: Schema.Struct({
    left: Schema.Finite,
    top: Schema.Finite,
    sx: Schema.Finite,
    sy: Schema.Finite,
  }),
  /** The pointer at the press, in film pixels. */
  start: Point,
  /** The scene's knobs as shown at the press. */
  knobs: Knobs,
});
export type KnobGrip = typeof KnobGrip.Type;

/** A press on the strip or on the frame. */
export const Grip = Schema.Union([CueGrip, KnobGrip]);
export type Grip = typeof Grip.Type;

/** Where `pointer` is on the overlay `frame`, in film pixels. */
export const filmPoint = (frame: KnobGrip['frame'], pointer: Pointer): Point => [
  (pointer.x - frame.left) * frame.sx,
  (pointer.y - frame.top) * frame.sy,
];

/** Where the knob grabbed by `grip` lies with the pointer at `pointer`, to whole units. */
const knobAt = (grip: KnobGrip, pointer: Pointer): Point => {
  const now = filmPoint(grip.frame, pointer);
  const d: Point = [now[0] - grip.start[0], now[1] - grip.start[1]];
  const [a, b, c, e] = grip.inv;
  if (grip.mode === 'picture')
    return [
      Math.round(grip.from[0] - (a * d[0] + c * d[1])),
      Math.round(grip.from[1] - (b * d[0] + e * d[1])),
    ];
  const grab = applyAffine(grip.m, grip.from);
  const [x, y] = applyAffine(grip.inv, [grab[0] + d[0], grab[1] + d[1]]);
  return [Math.round(x), Math.round(y)];
};

/** A knob grabbed by `grip`, dragged to `pointer`. */
export const dragKnob = (grip: KnobGrip, pointer: Pointer): Dragged => {
  const value = knobAt(grip, pointer);
  const moved = value[0] !== grip.from[0] || value[1] !== grip.from[1];
  return {
    write: Option.map(
      Option.liftPredicate(value, () => moved),
      (v) => KnobWrite.make({ scene: grip.scene, knob: grip.knob, value: v }),
    ),
    scene: grip.scene,
    edit: { knobs: { ...grip.knobs, [grip.knob]: value } },
  };
};

/** Whatever `grip` grabbed, dragged to `pointer`. */
export const drag = (grip: Grip, pointer: Pointer): Dragged =>
  Match.value(grip).pipe(
    Match.tagsExhaustive({
      CueGrip: (g) => dragCue(g, pointer),
      KnobGrip: (g) => dragKnob(g, pointer),
    }),
  );

/**
 * Why knob `knob` cannot be written, when it cannot: the scene has no source
 * the lab can read (`error`, as the server said), its knobs object is one the
 * lab will not rewrite, or the knob's value is computed in source.
 */
export const knobRefusal = (
  source: Option.Option<SceneSource>,
  error: string,
  knob: string,
): Option.Option<string> =>
  Option.match(source, {
    onNone: () => Option.some(`cannot edit: ${error || 'no source for this scene'}`),
    onSome: (s) => {
      const refused = Arr.findFirst(s.refused, (r) => r.field === 'knobs');
      if (Option.isSome(refused))
        return Option.some(`cannot move ${knob}: ${refused.value.reason}`);
      const literal = Option.exists(
        Arr.findFirst(s.knobs, (k) => k.name === knob),
        (k) => k.state === 'literal',
      );
      if (literal) return Option.none();
      return Option.some(`cannot move ${knob}: it is computed in the source`);
    },
  });

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

/**
 * What the inspector's fields of a cue or knob read: its scene as the lab
 * holds it (shown edits included), what the lab knows of the scene's source
 * (or why it could not read it), the film's rate, and the editor's commit,
 * which writes a write and shows its edit until the reload.
 */
interface FieldsIn {
  readonly timeline: Timeline;
  readonly cues: ReadonlyMap<string, ResolvedCue>;
  readonly knobs: Knobs;
  readonly source: Option.Option<SceneSource>;
  readonly error: string;
  readonly fps: number;
  readonly commit: (write: Write, edit: SceneEdit) => void;
}

/** Seconds or a number as a receipt prints it: to the thousandth. */
const printed = (v: number): string => String(toMs(v));

/**
 * Cue `name`'s fields: its offset and, unless it ends on a mark, its dur
 * (seconds, stepped by frames). Each refuses as a drag of that part would.
 */
const cueFields = (scene: string, name: string, at: FieldsIn): ReadonlyArray<Inspected> =>
  Option.match(
    Option.all({
      span: Option.fromUndefinedOr(at.timeline[name]),
      cue: Option.fromUndefinedOr(at.cues.get(name)),
    }),
    {
      onNone: () => [],
      onSome: ({ span, cue }) => {
        const write = (patch: CueWrite['patch'], edited: Span) =>
          at.commit(CueWrite.make({ scene, cue: name, patch }), {
            timeline: { ...at.timeline, [name]: edited },
          });
        const moves = (field: string, before: number) => (next: number) =>
          moved(`cue ${name} ${field}`, printed(before), printed(next), 's');
        const offset = Option.getOrElse(Option.fromUndefinedOr(span.offset), () => 0);
        const offsetField: Inspected = {
          id: 'offset',
          label: 'offset',
          spec: fieldOf(CueOffset, at.fps),
          value: offset,
          refusal: cueRefusal(at.source, at.error, name, 'move'),
          write: (v) => write({ offset: toMs(v) }, { ...span, offset: v }),
          moved: moves('offset', offset),
        };
        const durField: Inspected = {
          id: 'dur',
          label: 'dur',
          spec: fieldOf(CueDur, at.fps),
          value: cue.dur,
          refusal: cueRefusal(at.source, at.error, name, 'end'),
          write: (v) =>
            write({ dur: toMs(Math.max(0, v)) }, patchSpan(span, { dur: Math.max(0, v) })),
          moved: moves('dur', cue.dur),
        };
        // A cue that runs `until` a mark has no dur of its own to write.
        return [
          offsetField,
          ...Option.match(Option.fromUndefinedOr(span.until), {
            onNone: () => [durField],
            onSome: () => [],
          }),
        ];
      },
    },
  );

/** A knob's value as a receipt prints it: a number, or a point as `[x, y]`. */
const knobText = (value: Knob): string =>
  Option.match(Option.liftPredicate(value, Schema.is(Point)), {
    onNone: () => printed(Number(value)),
    onSome: ([x, y]) => `[${printed(x)}, ${printed(y)}]`,
  });

/** Knob `name`'s fields: its number, or its point's x and y (canvas pixels). */
const knobFields = (scene: string, name: string, at: FieldsIn): ReadonlyArray<Inspected> => {
  const refusal = knobRefusal(at.source, at.error, name);
  const write = (value: Knob) =>
    at.commit(KnobWrite.make({ scene, knob: name, value }), {
      knobs: { ...at.knobs, [name]: value },
    });
  const moves = (before: Knob, after: Knob) =>
    moved(`knob ${name}`, knobText(before), knobText(after));
  return Option.match(Option.fromUndefinedOr(at.knobs[name]), {
    onNone: () => [],
    onSome: (value): ReadonlyArray<Inspected> =>
      Option.match(Option.liftPredicate(value, Schema.is(Point)), {
        onNone: () => [
          {
            id: 'value',
            label: name,
            spec: fieldOf(KnobNumber, at.fps),
            value: Number(value),
            refusal,
            write: (v) => write(toMs(v)),
            moved: (v) => moves(value, toMs(v)),
          },
        ],
        onSome: ([x, y]) => {
          const axis = (id: 'x' | 'y', now: number, to: (v: number) => Point): Inspected => ({
            id,
            label: `${name} ${id}`,
            spec: fieldOf(Pixel, at.fps),
            value: now,
            refusal,
            write: (v) => write(to(v)),
            moved: (v) => moves(value, to(v)),
          });
          return [axis('x', x, (v) => [toMs(v), y]), axis('y', y, (v) => [x, toMs(v)])];
        },
      }),
  });
};

/** The inspector's fields of a cue or a knob, read from `at`. */
export const fieldsOf = (selection: LabSelection, at: FieldsIn): ReadonlyArray<Inspected> =>
  Match.value(selection).pipe(
    Match.tag('Cue', (s) => cueFields(s.scene, s.name, at)),
    Match.tag('Knob', (s) => knobFields(s.scene, s.name, at)),
    Match.exhaustive,
  );
