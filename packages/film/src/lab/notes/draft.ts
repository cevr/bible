// A note's draft, pure: where the moment noted sits (its scene, time, time
// into the scene and frame, and the cue edge and mark nearest it), the draft the composer posts
// (the box and the ink only when there are any), and the frame's pixels a
// pointer is over.

import { Option } from 'effect';
import type { Placed } from '../../core/layout.ts';
import { nearestMoment } from '../../core/notes.ts';
import type { InkStroke, NoteBox, NoteDraft, Point } from '../../core/schema.ts';

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
        `${T.toFixed(2)}s`,
        `f${Math.round(T * fps)}`,
        ...Option.toArray(Option.map(m.cue, (c) => `cue ${c.name}:${c.edge}`)),
        ...Option.toArray(Option.map(m.mark, (k) => `{${k}}`)),
      ].join(' · '),
  });

/** The draft `composed` posts: none when it says nothing, or sits past the film. */
export const draftOf = (
  placed: ReadonlyArray<Placed>,
  fps: number,
  composed: Composed,
): Option.Option<NoteDraft> => {
  const text = composed.text.trim();
  if (text === '') return Option.none();
  const { T } = composed;
  return Option.map(nearestMoment(placed, T), (m): NoteDraft => ({
    scene: m.scene,
    T,
    local: m.local,
    frame: Math.round(T * fps),
    text,
    ...Option.match(m.cue, { onNone: () => ({}), onSome: (cue) => ({ cue }) }),
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
