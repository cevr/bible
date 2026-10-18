// The two edits the studio writes into a version's script itself, as the
// page, the lab's routes and the MCP tools all judge them: a beat moved
// before another (or to the end), and a beat's hold (`lead`, the time before
// its words; `tail`, the time after them) set. A move keeps every act and
// score movement on the beat it begins on (`membersOf`), so one that would
// put a part before the part declared ahead of it is refused in words. A
// hold snaps to a tenth of a second and stays inside the layout's floors
// (`MIN_LEAD`, `DEFAULT_TAIL`) unless the beat already holds less; a tail
// on the floor is the default and is written as none. What each edit says to
// the owner is said in his words (`movedWords`, `heldWords`), never a file.
// Pure.

import { Boolean as Bool, Option, Result } from 'effect';
import { membersOf } from './acts.ts';
import { DEFAULT_TAIL, MIN_LEAD } from './layout.ts';
import { onTheMs } from './time.ts';

/** A beat's two holds: the time before its words, and the time after them. */
export type HoldEdge = 'lead' | 'tail';

/** A hold snaps to this step, film seconds. */
const HOLD_STEP = 0.1;

/** The longest hold the studio writes: past it a beat is no longer a hold but a scene of its own. */
const MAX_HOLD = 30;

/** Where a beat goes: before another beat, or to the end (none). */
export type MovedBefore = Option.Option<string>;

/** A part laid on the beats (an act, a score movement): the beat it begins on, and its name. */
interface PartOn {
  readonly from: string;
  readonly name: string;
}

/**
 * `ids` with `beat` moved before `before` (to the end when none); refused,
 * in words, when either is not one of `ids`, when the move is no move (onto
 * itself, or just before the beat already after it), or when a part of one
 * of `parts` (the acts, the movements: each list in its declared order)
 * would no longer play in that order.
 */
export const movedOrder = (
  ids: ReadonlyArray<string>,
  beat: string,
  before: MovedBefore,
  parts: ReadonlyArray<ReadonlyArray<PartOn>> = [],
): Result.Result<ReadonlyArray<string>, string> => {
  const at = ids.indexOf(beat);
  if (at < 0) return Result.fail(`the script has no beat "${beat}"`);
  const rest = ids.filter((id) => id !== beat);
  const to = Option.match(before, {
    onNone: () => Result.succeed(rest.length),
    onSome: (b) =>
      Bool.match(b === beat, {
        onTrue: () => Result.fail(`"${beat}" cannot go before itself`),
        onFalse: () =>
          Bool.match(rest.includes(b), {
            onTrue: () => Result.succeed(rest.indexOf(b)),
            onFalse: () => Result.fail(`the script has no beat "${b}"`),
          }),
      }),
  });
  return Result.flatMap(to, (index) => {
    if (index === at) return Result.fail(`"${beat}" is already there`);
    const moved = [...rest.slice(0, index), beat, ...rest.slice(index)];
    return Result.mapBoth(Result.all(parts.map((list) => membersOf(list, moved))), {
      onFailure: (e) => `the move would break the film's parts: ${e.message}`,
      onSuccess: () => moved,
    });
  });
};

/** Each edge's floor in the layout. */
const FLOOR = { lead: MIN_LEAD, tail: DEFAULT_TAIL } satisfies Record<HoldEdge, number>;

/** Where each edge's hold stands against the beat's words. */
const SIDE = { lead: 'before', tail: 'after' } satisfies Record<HoldEdge, string>;

/** A hold's floor: the layout's (`MIN_LEAD`, `DEFAULT_TAIL`), or the beat's own when it already holds less. */
const holdFloor = (edge: HoldEdge, now: number): number => Math.min(FLOOR[edge], onTheMs(now));

/**
 * The hold a trim asks for, as it is written: snapped to `HOLD_STEP`, held
 * between its floor (`holdFloor` of `now`, the beat's hold now) and
 * `MAX_HOLD`.
 */
export const heldWithin = (edge: HoldEdge, asked: number, now: number): number => {
  const snapped = onTheMs(Math.round(asked / HOLD_STEP) * HOLD_STEP);
  return onTheMs(Math.min(MAX_HOLD, Math.max(holdFloor(edge, now), snapped)));
};

/**
 * The value a hold is written as in the script: none for a tail on the
 * default (`DEFAULT_TAIL`: the field is taken away), else the seconds. A
 * lead is always written: its default follows the beat's entrance.
 */
export const holdWritten = (edge: HoldEdge, value: number): Option.Option<number> =>
  Option.liftPredicate(onTheMs(value), (v) => edge === 'lead' || v !== DEFAULT_TAIL);

/** What a move says to the owner. */
export const movedWords = (beat: string, before: MovedBefore): string =>
  Option.match(before, {
    onNone: () => `Moved ${beat} to the end.`,
    onSome: (b) => `Moved ${beat} before ${b}.`,
  });

/** A signed span of seconds as a trim's readout says it: `+3.0 s`, `−0.4 s`. */
const signedSeconds = (s: number): string => {
  const shown = Math.abs(s).toFixed(1);
  return Bool.match(s < 0, { onTrue: () => `−${shown} s`, onFalse: () => `+${shown} s` });
};

/** What a hold set says to the owner. */
export const heldWords = (beat: string, edge: HoldEdge, from: number, to: number): string =>
  `Held ${beat} ${signedSeconds(to - from)} ${SIDE[edge]} its words.`;

/** What a hold already where it is asked says to the owner. */
export const heldAlready = (beat: string, edge: HoldEdge, value: number): string =>
  `${beat} already holds ${value.toFixed(1)} s ${SIDE[edge]} its words.`;

/** What every edit of the script tells the owner comes next: the agents' part. */
export const AGENTS_AFTER = 'Agents re-time and re-check.';

/** The work an edit files for the agents on the production's ledger. */
export const workFiled = (said: string): string => `${said} Re-time, re-check seams, re-render.`;
