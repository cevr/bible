// What a press on the cue strip grabs, and where a drag of it lands: pure, so
// the editor's machine and its tests share it. On the strip a cue's body moves
// its offset, its left edge its start (offset and dur), its right edge its end
// (dur). A bar too short for two edges and a body (under 3 × EDGE_PX) is all
// body; alt grabs its end. A cue that runs `until` a mark keeps following it:
// its end is set as an offset off the mark (`dragPatch`). Edges snap to word starts and ends, marks and other cues'
// edges within SNAP_PX, else move by whole frames; shift inverts the viewer's
// snap (`placesFreely`). The inspector's fields of a cue or a knob
// (`fieldsOf`) write through the same writes as a drag, and refuse as a drag
// of that part would: an `until` cue's end is a field as its right edge is a
// grip, so a bar too short for edges still has its end by touch.

import { Array as Arr, Match, Option, Schema } from 'effect';
import type { SceneEdit, SceneSpec } from '../../canvas/film.ts';
import { applyAffine } from '../../core/affine.ts';
import type { Placed } from '../../core/layout.ts';
import { moved } from '../../command/command.ts';
import type { LabSelection } from '../../command/selection.ts';
import { type Inspected, fieldOf } from '../../core/field.ts';
import {
  ChangeId,
  CueDur,
  CueOffset,
  CuePatch,
  Knob,
  KnobNumber,
  Knobs,
  type LabWrite,
  Pixel,
  Point,
  RequestId,
  ResolvedCue,
  type SceneSource,
  Span,
  Timeline,
} from '../../core/schema.ts';
import { toMs } from '../../core/time.ts';
import {
  type DragEdge,
  dragFields,
  dragPatch,
  patchSpan,
  untilText,
  writtenPatch,
} from '../../core/timeline.ts';
import { StepVerb } from '../api.ts';

/** How near (screen pixels) an edge must come to a word, mark or cue edge to snap to it. */
const SNAP_PX = 8;
/** How wide (screen pixels) a cue's edge is to grab with a mouse or a pen. */
export const EDGE_PX = 6;
/** How wide a cue's edge is to grab with a finger, which covers more than 6 px (LS-5). */
export const EDGE_TOUCH_PX = 14;

/** How wide a cue's edge is to the pointer of `pointerType` (a PointerEvent's). */
export const edgeFor = (pointerType: string): number =>
  Match.value(pointerType).pipe(
    Match.when('touch', () => EDGE_TOUCH_PX),
    Match.orElse(() => EDGE_PX),
  );

/**
 * What a press `x` pixels into a cue's bar `width` wide grabs, its edges
 * `edge` pixels wide. A bar under 3 edges has no room for two edges and a
 * body, so it is all body (its offset), or its end (dur) with alt held.
 */
export const dragModeAt = (x: number, width: number, alt: boolean, edge = EDGE_PX): DragEdge => {
  if (width < edge * 3) {
    if (alt) return 'end';
    return 'move';
  }
  if (x < edge) return 'start';
  if (width - x < edge) return 'end';
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

/** Where the pointer is: screen x and y, and whether it places edges freely (`placesFreely`). */
export const Pointer = Schema.Struct({ x: Schema.Finite, y: Schema.Finite, free: Schema.Boolean });
export type Pointer = typeof Pointer.Type;

/**
 * Whether a drag places edges freely: Shift held inverts the viewer's snap
 * (the editor's Snap toggle, on by default), as an editor's snapping key
 * does. With snapping on, Shift frees an edge; with it off, edges go freely
 * and Shift snaps them.
 */
export const placesFreely = (shift: boolean, snap: boolean): boolean => shift === snap;

/**
 * What a knob write moves, before → after (`knob face [400, 200] → [380,
 * 200]`): its receipt once it lands. The page's own words, never sent.
 */
const Said = Schema.optionalKey(Schema.String);

/** One field a cue write moves: what it read before and after, and its unit (`s`, or none). */
const Moved = Schema.Struct({ before: Schema.String, after: Schema.String, unit: Schema.String });

/**
 * What a cue write moves, field by field (`offset: 0.4 → 0.367 s`), kept as
 * a record so two writes of one cue join field by field (`joined`): its
 * receipt's words once it lands (`cueSaidText`). The page's own, never sent.
 */
const CueSaid = Schema.Record(Schema.String, Moved);
type CueSaid = typeof CueSaid.Type;

export const CueWrite = Schema.TaggedStruct('CueWrite', {
  scene: Schema.String,
  cue: Schema.String,
  patch: CuePatch,
  said: Schema.optionalKey(CueSaid),
});
export type CueWrite = typeof CueWrite.Type;

export const KnobWrite = Schema.TaggedStruct('KnobWrite', {
  scene: Schema.String,
  knob: Schema.String,
  value: Knob,
  said: Said,
});
export type KnobWrite = typeof KnobWrite.Type;

export const StepWrite = Schema.TaggedStruct('StepWrite', {
  verb: StepVerb,
  /**
   * The id this page gave the request, unique to it: the lab records it on
   * the step once it lands, so a step with no answer is known by it, never
   * by a name another change may share.
   */
  request: RequestId,
  /** The one change it steps, by its id, when a receipt's button asked for it; none: the newest. */
  change: Schema.Option(ChangeId),
});
export type StepWrite = typeof StepWrite.Type;

/** One write to a scene file: a cue's fields, a knob's value, or an undo or redo. */
export const Write = Schema.Union([CueWrite, KnobWrite, StepWrite]);
export type Write = typeof Write.Type;

/** The fields that set a span's whole end: a dur replaces an until and an until a dur. */
const RESETS: ReadonlyArray<string> = ['dur', 'until'];
/** The fields a span's end is: its dur, or its until and the offset off it. */
const ENDS: ReadonlyArray<string> = ['dur', 'until', 'untilOffset'];

/**
 * `b`'s fields over `a`'s: a dur replaces an until and an until a dur, each
 * with the until's offset, as a span ends one way (`patchSpan`).
 */
const patchOver = (a: CuePatch, b: CuePatch): CuePatch => {
  if (!RESETS.some((f) => f in b)) return { ...a, ...b };
  const { dur: _dur, until: _until, untilOffset: _untilOffset, ...fields } = a;
  return { ...fields, ...b };
};

/** A cue write's moves, none when it carries none. */
const movesOf = (write: Pick<CueWrite, 'said'>): CueSaid =>
  Option.getOrElse(Option.fromUndefinedOr(write.said), (): CueSaid => ({}));

/**
 * What cue write `write` moved, in words, a part per field: `cue rise
 * offset 0 → 0.033 s; cue rise dur 0.6 → 1 s`.
 */
export const cueSaidText = (write: Pick<CueWrite, 'cue' | 'said'>): string =>
  Object.entries(movesOf(write))
    .map(([field, m]) => moved(`cue ${write.cue} ${field}`, m.before, m.after, m.unit))
    .join('; ');

/**
 * `b`'s moves over `a`'s, field by field: a field both move goes from `a`'s
 * before to `b`'s after; one only `a` moves stays, unless `b` ends the span
 * the other way (`patchOver` drops it too); one only `b` moves is `b`'s.
 */
const saidOver = (a: Pick<CueWrite, 'said'>, b: Pick<CueWrite, 'said'>) => {
  const earlier = movesOf(a);
  const later = movesOf(b);
  const ends = Object.keys(later).some((f) => RESETS.includes(f));
  // In the order first said: `a`'s fields (each moved on by `b`'s, or kept), then `b`'s new ones.
  const kept = Object.entries(earlier)
    .filter(([field]) => field in later || !(ends && ENDS.includes(field)))
    .map(([field, e]): [string, CueSaid[string]] => [
      field,
      Option.match(Option.fromUndefinedOr(later[field]), {
        onNone: () => e,
        onSome: (m) => ({ ...m, before: e.before }),
      }),
    ]);
  const added = Object.entries(later).filter(([field]) => !(field in earlier));
  const said: CueSaid = Object.fromEntries([...kept, ...added]);
  return Option.match(
    Option.liftPredicate(said, (s) => Object.keys(s).length > 0),
    {
      onNone: () => ({}),
      onSome: (s) => ({ said: s }),
    },
  );
};

/**
 * `later` joined onto `earlier` when both write the same thing, as one
 * write: a cue's fields merged, the later value of a field winning, its
 * words a part per field; a knob's later value. None for two different
 * things (another cue, a knob, a step), which are written each in turn.
 */
export const joined = (earlier: Write, later: Write): Option.Option<Write> =>
  Match.value([earlier, later] as const).pipe(
    // The same cue first, then the merge: two cues' fields never make one patch.
    Match.when([{ _tag: 'CueWrite' }, { _tag: 'CueWrite' }], ([a, b]): Option.Option<Write> =>
      Option.map(
        Option.liftPredicate(b, () => a.scene === b.scene && a.cue === b.cue),
        (same) =>
          CueWrite.make({
            scene: same.scene,
            cue: same.cue,
            patch: patchOver(a.patch, same.patch),
            ...saidOver(a, same),
          }),
      ),
    ),
    Match.when([{ _tag: 'KnobWrite' }, { _tag: 'KnobWrite' }], ([a, b]): Option.Option<Write> =>
      Option.liftPredicate(b, () => a.scene === b.scene && a.knob === b.knob),
    ),
    Match.orElse(() => Option.none()),
  );

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
    const start = snapEdge(c0.start, dt, near, pointer.free);
    return { start, end: start + c0.dur };
  }
  if (grip.edge === 'start')
    return { start: Math.min(snapEdge(c0.start, dt, near, pointer.free), c0.end), end: c0.end };
  return { start: c0.start, end: Math.max(snapEdge(c0.end, dt, near, pointer.free), c0.start) };
};

/** A cue write, and the span the page shows while it is on its way. */
interface CueCommit {
  readonly write: CueWrite;
  readonly span: Span;
}

/**
 * One commit of `patch` to cue `name` of `scene` (its span `span`, resolved as
 * `cue`): the write it sends, the patch as a scene file holds it
 * (`writtenPatch`), and the span the page shows meanwhile, made of that same
 * patch. Every cue write the editor makes (a drag, a field, an ease) is one.
 */
export const cueCommit = (
  scene: string,
  name: string,
  span: Span,
  cue: ResolvedCue,
  patch: CuePatch,
): CueCommit => {
  const written = writtenPatch(patch);
  return {
    write: CueWrite.make({ scene, cue: name, patch: written, said: cueSaid(span, cue, written) }),
    span: patchSpan(span, written),
  };
};

/** A cue grabbed by `grip`, dragged to `pointer`. */
export const dragCue = (grip: CueGrip, pointer: Pointer): Dragged => {
  const commit = Option.map(
    dragPatch(grip.span, grip.cue0, grip.edge, barAt(grip, pointer), 1 / grip.fps),
    (patch) => cueCommit(grip.scene, grip.cue, grip.span, grip.cue0, patch),
  );
  const span = Option.match(commit, { onNone: () => grip.span, onSome: (c) => c.span });
  return {
    write: Option.map(commit, (c) => c.write),
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
  const went = value[0] !== grip.from[0] || value[1] !== grip.from[1];
  return {
    write: Option.map(
      Option.liftPredicate(value, () => went),
      (v) =>
        KnobWrite.make({
          scene: grip.scene,
          knob: grip.knob,
          value: v,
          said: moved(`knob ${grip.knob}`, knobText(grip.from), knobText(v)),
        }),
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

/** What the lab knows of a scene's source: it, or that it is still being read, or why it could not be. */
export interface SourceKnown {
  readonly source: Option.Option<SceneSource>;
  /** Whether its read is still out: no answer yet is pending, never a refusal. */
  readonly reading: boolean;
  /** The server's reason, when the source could not be read. */
  readonly error: string;
}

/** What a write says while `known` has no source: that it is still being read, or why there is none. */
const unsourced = (known: SourceKnown): string =>
  Match.value(known.reading).pipe(
    Match.when(true, () => 'reading the source…'),
    Match.orElse(() => `cannot edit: ${known.error || 'no source for this scene'}`),
  );

/**
 * Why knob `knob` cannot be written, when it cannot: the scene's source is
 * still being read, or there is none the lab can read (`error`, as the server
 * said), its knobs object is one the lab will not rewrite, or the knob's
 * value is computed in source.
 */
export const knobRefusal = (known: SourceKnown, knob: string): Option.Option<string> =>
  Option.match(known.source, {
    onNone: () => Option.some(unsourced(known)),
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

const PAST = { undo: 'undid', redo: 'redid' } as const;

/**
 * Why a write of `fields` to `cue` cannot land, when it cannot: the scene's
 * source is still being read, or there is none the lab can read (`error`, as
 * the server said), its timeline is one the lab will not rewrite, the cue is
 * not in it, or a field it sets is computed in source (named). A drag writes
 * `dragFields` of its edge.
 */
export const cueRefusal = (
  known: SourceKnown,
  cue: string,
  fields: ReadonlyArray<keyof CuePatch>,
): Option.Option<string> =>
  Option.match(known.source, {
    onNone: () => Option.some(unsourced(known)),
    onSome: (s) => {
      const refused = Arr.findFirst(s.refused, (r) => r.field === 'timeline');
      if (Option.isSome(refused)) return Option.some(`cannot drag ${cue}: ${refused.value.reason}`);
      return Option.match(
        Arr.findFirst(s.cues, (c) => c.name === cue),
        {
          onNone: () => Option.some(`cannot drag ${cue}: its span is computed in the source`),
          onSome: (found) => {
            const computed = fields.filter((f) => found[f] === 'computed');
            if (computed.length === 0) return Option.none();
            return Option.some(
              `cannot drag ${cue}: its ${computed.join(' and ')} is computed in the source`,
            );
          },
        },
      );
    },
  });

/** What a cue or knob write moved, in words: none when the page did not say. */
const writeSaid = (w: CueWrite | KnobWrite): string =>
  Match.value(w).pipe(
    Match.tag('CueWrite', cueSaidText),
    Match.tag('KnobWrite', (k) => Option.getOrElse(Option.fromUndefinedOr(k.said), () => '')),
    Match.exhaustive,
  );

/**
 * What the receipt says once `write` has landed as `result`: what it moved,
 * before → after, when the page knew (else what the lab wrote), or what an
 * Undo or Redo walked.
 */
export const wroteNote = (write: Write, result: LabWrite): string =>
  Match.value(write).pipe(
    Match.tag(
      'StepWrite',
      (s) => `${PAST[s.verb]} ${result.target.replace(/^(undo|redo) /, '')} in ${result.file}`,
    ),
    Match.orElse((w) => {
      const unresolved = Option.match(Option.fromUndefinedOr(result.unresolved), {
        onNone: () => '',
        onSome: (why) => ` (not resolved: ${why})`,
      });
      const said = Option.getOrElse(
        Option.filter(Option.some(writeSaid(w)), (s) => s !== ''),
        () => `wrote ${result.file}: ${result.target}`,
      );
      return `${said}${unresolved}`;
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
  readonly known: SourceKnown;
  readonly fps: number;
  readonly commit: (write: Write, edit: SceneEdit) => void;
}

/** Seconds or a number as a receipt prints it: to the thousandth. */
const printed = (v: number): string => String(toMs(v));

/**
 * What `patch` moves of a cue (its span `span`, resolved as `cue`), before
 * → after, for each field it sets: `{ offset: 0.4 → 0.367 s, dur: 1 →
 * 1.033 s }` (`cueSaidText` words it).
 */
const cueSaid = (span: Span, cue: ResolvedCue, patch: CuePatch): CueSaid => {
  const part = (field: string, before: string, after: Option.Option<string>, unit = '') =>
    Option.toArray(
      Option.map(after, (a): [string, CueSaid[string]] => [field, { before, after: a, unit }]),
    );
  const has = Option.fromUndefinedOr;
  const offset = Option.getOrElse(has(span.offset), () => 0);
  const until = Option.match(has(span.until), { onNone: () => 'its dur', onSome: untilText });
  const parts = [
    ...part('offset', printed(offset), Option.map(has(patch.offset), printed), 's'),
    ...part('dur', printed(cue.dur), Option.map(has(patch.dur), printed), 's'),
    ...part('until', until, Option.map(has(patch.until), untilText)),
    ...part(
      'untilOffset',
      printed(Option.getOrElse(has(span.untilOffset), () => 0)),
      Option.map(has(patch.untilOffset), printed),
      's',
    ),
    ...part('ease', cue.ease, has(patch.ease)),
    ...part('stagger', printed(cue.stagger), Option.map(has(patch.stagger), printed)),
  ];
  return Object.fromEntries(parts);
};

/**
 * Cue `name`'s fields: its offset, and its dur or, when it runs `until` a
 * mark, its end (scene seconds, stepped by frames, never before its start).
 * The end writes as its right edge's drag to that time does (`dragPatch`):
 * off the mark, as its offset off it, so it keeps following the mark. Each
 * refuses as a drag of that part would.
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
        const write = (patch: CuePatch) => {
          const commit = cueCommit(scene, name, span, cue, patch);
          at.commit(commit.write, { timeline: { ...at.timeline, [name]: commit.span } });
        };
        const offset = Option.getOrElse(Option.fromUndefinedOr(span.offset), () => 0);
        const offsetField: Inspected = {
          id: 'offset',
          label: 'offset',
          spec: fieldOf(CueOffset, at.fps),
          value: offset,
          refusal: cueRefusal(at.known, name, ['offset']),
          write: (v) => write({ offset: v }),
        };
        const durField: Inspected = {
          id: 'dur',
          label: 'dur',
          spec: fieldOf(CueDur, at.fps),
          value: cue.dur,
          refusal: cueRefusal(at.known, name, ['dur']),
          write: (v) => write({ dur: Math.max(0, v) }),
        };
        const durSpec = fieldOf(CueDur, at.fps);
        const endField: Inspected = {
          id: 'end',
          label: 'end',
          spec: { ...durSpec, min: Option.some(cue.start) },
          value: cue.end,
          refusal: cueRefusal(at.known, name, dragFields(span, 'end')),
          write: (v) => {
            const bar = { start: cue.start, end: Math.max(cue.start, v) };
            Option.map(dragPatch(span, cue, 'end', bar, 1 / at.fps), write);
          },
        };
        // A cue that runs `until` a mark has no dur of its own: its end is where it is moved.
        return [
          offsetField,
          ...Option.match(Option.fromUndefinedOr(span.until), {
            onNone: () => [durField],
            onSome: () => [endField],
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
  const refusal = knobRefusal(at.known, name);
  const write = (before: Knob, value: Knob) =>
    at.commit(
      KnobWrite.make({
        scene,
        knob: name,
        value,
        said: moved(`knob ${name}`, knobText(before), knobText(value)),
      }),
      { knobs: { ...at.knobs, [name]: value } },
    );
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
            write: (v) => write(value, toMs(v)),
          },
        ],
        onSome: ([x, y]) => {
          const axis = (id: 'x' | 'y', now: number, to: (v: number) => Point): Inspected => ({
            id,
            label: `${name} ${id}`,
            spec: fieldOf(Pixel, at.fps),
            value: now,
            refusal,
            write: (v) => write(value, to(v)),
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
