// A note's draft, pure: where the moment noted sits (its scene, time, time
// into the scene and frame, and the cue edge and mark nearest it), what it
// is about beside its frame (its scope: the cue selected and the in and out
// points, shown as a chip the owner can clear), the draft the composer posts
// (the box, the ink and the range only when there are any), and the frame's
// pixels a pointer is over.

import { Option } from 'effect';
import { type Placed, sceneAt } from '../../core/layout.ts';
import { nearestMoment } from '../../core/notes.ts';
import { timecode } from '../../core/time.ts';
import type {
  InkStroke,
  NoteBox,
  NoteCue,
  NoteDraft,
  NoteRange,
  Point,
  ResolvedCue,
} from '../../core/schema.ts';

/** What the composer holds: the frame noted, what is marked on it, and the words. */
interface Composed {
  readonly T: number;
  readonly box: Option.Option<NoteBox>;
  readonly ink: ReadonlyArray<InkStroke>;
  readonly text: string;
}

/** Where a note at `T` sits, as the composer says it; nothing past the film. */
export const whereText = (placed: ReadonlyArray<Placed>, fps: number, T: number): string =>
  Option.match(nearestMoment(placed, T), {
    onNone: () => '',
    onSome: (m) =>
      [
        m.scene,
        timecode(T, fps),
        ...Option.toArray(Option.map(m.cue, (c) => `cue ${c.name}:${c.edge}`)),
        ...Option.toArray(Option.map(m.mark, (k) => `{${k}}`)),
      ].join(' · '),
  });

/**
 * What the page has selected as a note is written, which the note is about
 * beside its frame (its scope): the cue selected, and the in and out points
 * marked (film seconds).
 */
export interface Scope {
  readonly cue: Option.Option<{ readonly scene: string; readonly name: string }>;
  readonly range: Option.Option<{ readonly from: number; readonly to: number }>;
}

/** No scope: a note about its frame alone (its chip's × clears to it). */
export const NO_SCOPE: Scope = { cue: Option.none(), range: Option.none() };

/** A scope as a note at `T` carries it: the cue if it is in the note's scene, the range cut to that scene. */
interface Scoped {
  readonly scene: string;
  readonly cue: Option.Option<NoteCue>;
  readonly range: Option.Option<NoteRange>;
}

/** The edge of `cue` nearest `local`: an instant has one. */
const nearerEdge = (cue: ResolvedCue, local: number): NoteCue['edge'] =>
  Option.getOrElse(
    Option.liftPredicate(
      'end' as const,
      () => cue.dur > 0 && Math.abs(local - cue.end) < Math.abs(local - cue.start),
    ),
    () => 'start' as const,
  );

/** `scope` as a note at `T` carries it, in the scene under `T`; none past the film. */
const scopedAt = (placed: ReadonlyArray<Placed>, scope: Scope, T: number): Option.Option<Scoped> =>
  Option.map(sceneAt(placed, T), (p) => {
    const local = Math.max(0, T - p.start);
    return {
      scene: p.spec.id,
      cue: Option.flatMap(
        Option.filter(scope.cue, (c) => c.scene === p.spec.id),
        (c) =>
          Option.map(Option.fromUndefinedOr(p.cues.get(c.name)), (cue): NoteCue => ({
            name: c.name,
            edge: nearerEdge(cue, local),
          })),
      ),
      range: Option.filter(
        Option.map(scope.range, (r): NoteRange => ({
          from: Math.max(0, r.from - p.start),
          to: Math.min(p.dur, r.to - p.start),
        })),
        (r) => r.to > r.from,
      ),
    };
  });

/**
 * The scope chip a note at `T` shows (`scene · cue · 00:00:03:06–00:00:04:00`, timecode at `fps`), in the
 * place the lab's link to it names (its scene, its cue, its scene-local
 * time); none while the scope holds nothing in the note's scene.
 */
export const scopeText = (
  placed: ReadonlyArray<Placed>,
  scope: Scope,
  fps: number,
  T: number,
): Option.Option<string> =>
  Option.flatMap(
    Option.filter(
      scopedAt(placed, scope, T),
      (s) => Option.isSome(s.cue) || Option.isSome(s.range),
    ),
    (s) =>
      Option.some(
        [
          s.scene,
          ...Option.toArray(Option.map(s.cue, (c) => c.name)),
          ...Option.toArray(
            Option.map(s.range, (r) => `${timecode(r.from, fps)}–${timecode(r.to, fps)}`),
          ),
        ].join(' · '),
      ),
  );

/** The draft `composed` posts, about `scope`: none when it says nothing, or sits past the film. */
export const draftOf = (
  placed: ReadonlyArray<Placed>,
  fps: number,
  composed: Composed,
  scope: Scope = NO_SCOPE,
): Option.Option<NoteDraft> => {
  const text = composed.text.trim();
  if (text === '') return Option.none();
  const { T } = composed;
  const scoped = scopedAt(placed, scope, T);
  const inScope = <A>(f: (s: Scoped) => Option.Option<A>) => Option.flatMap(scoped, f);
  return Option.map(nearestMoment(placed, T), (m): NoteDraft => ({
    scene: m.scene,
    T,
    local: m.local,
    frame: Math.round(T * fps),
    text,
    ...Option.match(
      Option.orElse(
        inScope((s) => s.cue),
        () => m.cue,
      ),
      { onNone: () => ({}), onSome: (cue) => ({ cue }) },
    ),
    ...Option.match(
      inScope((s) => s.range),
      { onNone: () => ({}), onSome: (range) => ({ range }) },
    ),
    ...Option.match(m.mark, { onNone: () => ({}), onSome: (mark) => ({ mark }) }),
    ...Option.match(composed.box, { onNone: () => ({}), onSome: (box) => ({ box }) }),
    ...Option.match(
      Option.liftPredicate(composed.ink, (ink) => ink.length > 0),
      { onNone: () => ({}), onSome: (ink) => ({ ink }) },
    ),
  }));
};

/** Where the frame sits on the page. */
interface FrameRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** The film pixel under a pointer at (`x`, `y`) on the page, to the nearest pixel. */
export const filmPixel = (
  frame: FrameRect,
  film: { readonly width: number; readonly height: number },
  x: number,
  y: number,
): Point => [
  Math.round(((x - frame.left) / frame.width) * film.width),
  Math.round(((y - frame.top) / frame.height) * film.height),
];

/** The box a drag from `from` to `to` draws, whichever way it went. */
export const boxOf = (from: Point, to: Point): NoteBox => ({
  x: Math.min(from[0], to[0]),
  y: Math.min(from[1], to[1]),
  w: Math.abs(to[0] - from[0]),
  h: Math.abs(to[1] - from[1]),
});

/** A pinned point: a box with no size. */
export const pointBox = (at: Point): NoteBox => ({ x: at[0], y: at[1], w: 0, h: 0 });
