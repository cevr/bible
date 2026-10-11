// The live lanes the strip's rows follow, as the key `lab/follow.ts` reads: the
// scene and its cues the playhead is inside, in the strip's order, written as
// JSON, so a cue name of any spelling keeps its identity and the same lanes of
// another scene are another key; `''` when none is live. Pure.

import { Array as Arr, Option, Schema } from 'effect';

const Lanes = Schema.fromJsonString(
  Schema.Struct({ scene: Schema.String, names: Schema.NonEmptyArray(Schema.String) }),
);
const encode = Schema.encodeSync(Lanes);
const decode = Schema.decodeUnknownOption(Lanes);

/** The key of `scene`'s cues `order` (the strip's order) that `live` holds: `''` when it holds none. */
export const lanesKey = (
  scene: string,
  order: ReadonlyArray<string>,
  live: ReadonlySet<string>,
): string =>
  Arr.match(
    order.filter((name) => live.has(name)),
    { onEmpty: () => '', onNonEmpty: (names) => encode({ scene, names }) },
  );

/** The scene and the first and last live cue `key` names; none for `''`. */
export const lanesOf = (
  key: string,
): Option.Option<{ readonly scene: string; readonly first: string; readonly last: string }> =>
  Option.map(decode(key), ({ scene, names }) => ({
    scene,
    first: Arr.headNonEmpty(names),
    last: Arr.lastNonEmpty(names),
  }));
