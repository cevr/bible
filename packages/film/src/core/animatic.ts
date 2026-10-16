// The animatic: the film's board on its narration's clock. Each panel is
// held from the moment its mark is said (a `start` panel from its beat's
// first frame) until the next panel takes over; a beat's first panel opens
// the beat even when its mark comes later, so a beat never shows the last
// beat's picture. A beat with no panel shows its storyboard card. Pure, and
// the one rule for when a panel shows: the Board page's picture draws what
// `shotAt` names and its column lists the shots, and the studio's Board lane
// (`core/film-timeline.ts`) lays the same shots on its clock.

import { Array as Arr, Boolean as Bool, Data, Option, Order } from 'effect';
import { type BoardFile, PANEL_START, type Panel, panelsOf } from './board.ts';

/** A beat as the animatic times it: where it starts and ends on the film's clock, and where its line says each mark. */
export interface TimedBeat {
  readonly id: string;
  /** Film seconds. */
  readonly start: number;
  readonly end: number;
  /** Film seconds its line says mark `name` at: none for a mark it lacks. */
  readonly markAt: (name: string) => Option.Option<number>;
}

/** What the animatic shows over a stretch of the film. */
export type Shot = Data.TaggedEnum<{
  /** A panel of the board, held from `from` (its mark, or its beat's start for the beat's first). */
  Boarded: {
    readonly beat: string;
    readonly panel: Panel;
    /** Film seconds its mark is said at (its beat's start for `start`, or a mark its line lacks). */
    readonly at: number;
    readonly from: number;
  };
  /** A beat with no panel: its storyboard card. */
  Unboarded: { readonly beat: string; readonly from: number };
}>;
export const Shot = Data.taggedEnum<Shot>();

/** Film seconds panel `panel` of `beat` is said at: its beat's start for `start` or for a mark its line lacks. */
const panelTime = (beat: TimedBeat, panel: Panel): number =>
  Option.getOrElse(
    Option.filter(
      Option.flatMap(
        Option.liftPredicate(panel.at, (at) => at !== PANEL_START),
        beat.markAt,
      ),
      (t) => t >= beat.start,
    ),
    () => beat.start,
  );

const byAt = Order.mapInput(Order.Number, (s: { readonly at: number }) => s.at);

/** The shots of `beats` (in play order) on `board`, in play order. */
export const shotsOf = (beats: ReadonlyArray<TimedBeat>, board: BoardFile): ReadonlyArray<Shot> =>
  beats.flatMap((beat): ReadonlyArray<Shot> => {
    const timed = Arr.sort(
      panelsOf(board, beat.id).map((panel) => ({ panel, at: panelTime(beat, panel) })),
      byAt,
    );
    return Option.match(Arr.head(timed), {
      onNone: () => [Shot.Unboarded({ beat: beat.id, from: beat.start })],
      onSome: () =>
        timed.map(({ panel, at }, i) =>
          Shot.Boarded({
            beat: beat.id,
            panel,
            at,
            from: Bool.match(i === 0, { onTrue: () => beat.start, onFalse: () => at }),
          }),
        ),
    });
  });
