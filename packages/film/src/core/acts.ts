// Parts of a film: stretches that each begin on a scene and run until the
// next one's. A film's acts (`look.acts`: its colour script, its lights, its
// chapters) and its score's movements are both declared this way, as lists
// in film order, and the first always opens the film. The one rule for which
// scenes an act holds lives here. Pure: it reads only the scenes' order and,
// for times, the placed scenes.

import { Array as Arr, Option, Result } from 'effect';
import { PartOutOfOrder, UnknownScene } from './errors.ts';
import type { Placed } from './layout.ts';

/** What a part declares: the scene it begins on and its name. */
export interface PartOf {
  readonly from: string;
  readonly name: string;
}

/** A part's scenes, by id, in film order. */
export interface Members<P> {
  readonly part: P;
  readonly scenes: ReadonlyArray<string>;
}

/** A part laid over the placed film: its scenes and the seconds they span. */
export interface Stretch<P> extends Members<P> {
  readonly start: number;
  readonly end: number;
}

/** Why parts cannot be laid over a film. */
export type PartError = UnknownScene | PartOutOfOrder;

/** Where each part's scene sits in `ids`, in declared order; fails at the first unknown or out-of-order part. */
const indicesOf = <P extends PartOf>(
  parts: ReadonlyArray<P>,
  ids: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<number>, PartError> => {
  const at: Array<number> = [];
  for (const [i, part] of parts.entries()) {
    const index = ids.indexOf(part.from);
    if (index < 0) return Result.fail(UnknownScene.make({ scene: part.from, known: ids }));
    const ahead = Option.all([Arr.get(parts, i - 1), Arr.get(at, i - 1)]);
    if (Option.isSome(ahead) && index <= ahead.value[1])
      return Result.fail(
        PartOutOfOrder.make({ part: part.name, from: part.from, after: ahead.value[0].name }),
      );
    at.push(index);
  }
  return Result.succeed(at);
};

/**
 * Each part's scenes out of `ids` (the film's scenes, in order): from its
 * scene until the next part's. The first holds every scene before its own.
 * Fails with the first part naming no scene, or starting on or before the
 * part declared ahead of it.
 */
export const membersOf = <P extends PartOf>(
  parts: ReadonlyArray<P>,
  ids: ReadonlyArray<string>,
): Result.Result<ReadonlyArray<Members<P>>, PartError> =>
  Result.map(indicesOf(parts, ids), (at) => {
    // The first part reaches back to the film's first scene.
    const bounds = [0, ...at.slice(1), ids.length];
    return parts.map((part, i) => ({
      part,
      scenes: ids.slice(Arr.getUnsafe(bounds, i), Arr.getUnsafe(bounds, i + 1)),
    }));
  });

/** Each part laid over the placed film: its scenes, from the first one's start to the last one's end. */
export const stretchesOf = <P extends PartOf>(
  parts: ReadonlyArray<P>,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<Stretch<P>>, PartError> => {
  const byId = new Map(placed.map((p) => [p.spec.id, p]));
  const scene = (id: Option.Option<string>) =>
    Option.flatMap(id, (s) => Option.fromUndefinedOr(byId.get(s)));
  return Result.map(
    membersOf(
      parts,
      placed.map((p) => p.spec.id),
    ),
    (members) =>
      members.map(({ part, scenes }) => ({
        part,
        scenes,
        start: Option.match(scene(Arr.head(scenes)), { onNone: () => 0, onSome: (p) => p.start }),
        end: Option.match(scene(Arr.last(scenes)), {
          onNone: () => 0,
          onSome: (p) => p.start + p.dur,
        }),
      })),
  );
};

/**
 * Where each part begins on the film clock: its scene's start, the first at
 * 0. Order is not checked here: a part declared out of order begins before
 * the one ahead of it, and its length says so. Fails with every part naming
 * no scene.
 */
export const partStarts = <P extends PartOf>(
  parts: ReadonlyArray<P>,
  placed: ReadonlyArray<Placed>,
): Result.Result<ReadonlyArray<number>, Arr.NonEmptyReadonlyArray<UnknownScene>> => {
  const known = placed.map((p) => p.spec.id);
  const [unknown, starts] = Arr.partition(parts, (part) =>
    Result.fromOption(
      Option.map(
        Arr.findFirst(placed, (p) => p.spec.id === part.from),
        (p) => p.start,
      ),
      () => UnknownScene.make({ scene: part.from, known }),
    ),
  );
  if (Arr.isReadonlyArrayNonEmpty(unknown)) return Result.fail(unknown);
  // The first part opens the film, wherever it names.
  return Result.succeed(
    Arr.match(starts, { onEmpty: () => [], onNonEmpty: ([, ...rest]) => [0, ...rest] }),
  );
};
