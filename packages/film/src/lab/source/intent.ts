// The Source face's intent: the selection a phone's face was opened for before
// the line that writes it was known, and where that stands now. The view
// settles on the line once a read names it, while the view still follows the
// same selection; a hand that took the view, a held line, a Close or another
// selection drops it. Before the view is first seen following for it, an open
// still landing (the URL may answer a microtask later) or a hand's hold from an
// earlier opening still being reset reads as Opening, not as moved on. Pure.

import { Boolean as Bool, Data, Option } from 'effect';
import type { LabSelection } from '../../command/selection.ts';

/** The selection a face was opened for, and whether the view has been seen following for it since. */
export interface Asked {
  readonly selection: LabSelection;
  readonly seen: boolean;
}

/** Where a face's intent stands. */
export type FaceIntent = Data.TaggedEnum<{
  /** Nothing asked. */
  Idle: {};
  /** The open still landing. */
  Opening: {};
  /** Following, the line not named by any read yet. */
  Waiting: {};
  /** Moved on: another selection, or the view no longer follows. */
  Gone: {};
  /** The line known, to settle on. */
  Ready: { readonly line: number };
}>;
export const FaceIntent = Data.taggedEnum<FaceIntent>();

/** What the intent reads of the page now. */
interface Now {
  readonly selection: Option.Option<LabSelection>;
  /** Whether the view follows: `?code=follow` and no hand holds it. */
  readonly following: boolean;
  /** The line that writes `s`, once a read names it. */
  readonly lineOf: (s: LabSelection) => Option.Option<number>;
}

const same = (a: LabSelection, b: LabSelection) =>
  a._tag === b._tag && a.scene === b.scene && a.name === b.name;

/** Where `asked` stands at `now`. */
export const intentOf = (asked: Option.Option<Asked>, now: Now): FaceIntent =>
  Option.match(asked, {
    onNone: () => FaceIntent.Idle(),
    onSome: ({ selection, seen }) =>
      Bool.match(
        Option.exists(now.selection, (s) => same(s, selection)),
        {
          onFalse: () => FaceIntent.Gone(),
          onTrue: () =>
            Bool.match(now.following, {
              onFalse: () =>
                Bool.match(seen, {
                  onTrue: () => FaceIntent.Gone(),
                  onFalse: () => FaceIntent.Opening(),
                }),
              onTrue: () =>
                Option.match(now.lineOf(selection), {
                  onNone: () => FaceIntent.Waiting(),
                  onSome: (line) => FaceIntent.Ready({ line }),
                }),
            }),
        },
      ),
  });
