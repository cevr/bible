// The two edits the studio writes into a version's script itself, as the
// page, the lab's routes and the MCP tools all judge them: a beat moved
// before another (or to the end), and a beat's hold (`lead`, the time before
// its words; `tail`, the time after them) set. A move keeps every act and
// score movement on the beat it begins on (`membersOf`), so one that would
// put a part before the part declared ahead of it is refused in words. A
// hold snaps to a tenth of a second and stays inside the layout's floors
// (`MIN_LEAD`, `DEFAULT_TAIL`) unless the beat already holds less; a tail
// on the floor is the default and is written as none. A hold lays its beat
// by the layout's own rule (`heldTo`, over `beatLength`), so the studio's
// preview, its readout and the lab agree; one that would change nothing (a
// beat with no words, a tail its `min` absorbs) is refused in words
// (`holdUnchanged`). What each edit says to the owner is said in his words
// (`movedWords`, `heldWords`), never a file. Pure.

import { Array as Arr, Boolean as Bool, Option, Result } from 'effect';
import { membersOf } from './acts.ts';
import { DEFAULT_TAIL, MIN_LEAD, beatLength } from './layout.ts';
import { onTheMs } from './time.ts';
import type { BeatHold } from './timeline-schema.ts';

/** A beat's two holds: the time before its words, and the time after them. */
export type HoldEdge = 'lead' | 'tail';

/** A hold snaps to this step, film seconds. */
const HOLD_STEP = 0.1;

/** The longest hold the studio writes: past it a beat is no longer a hold but a scene of its own. */
const MAX_HOLD = 30;

/** Where a beat goes: before another beat, or to the end (none). */
export type MovedBefore = Option.Option<string>;

/** A part laid on the beats (an act, a score movement): the beat it begins on, and its name. */
export interface PartOn {
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

/** Whether a drop of `beat` at gap `gap` (the index of the beat it would go before; `ids.length` for the end) moves it. */
export const dropMoves = (ids: ReadonlyArray<string>, beat: string, gap: number): boolean => {
  const at = ids.indexOf(beat);
  return at >= 0 && gap !== at && gap !== at + 1;
};

/** The beat a drop at gap `gap` goes before: none at the end. */
export const beforeGap = (ids: ReadonlyArray<string>, gap: number): MovedBefore =>
  Arr.get(ids, gap);

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

/** A beat as a hold reads it: its id, its length, where its words are heard (none when silent), and its holds. */
interface HeldBeat {
  readonly beat: string;
  readonly dur: number;
  readonly speech?: { readonly start: number; readonly end: number };
  readonly hold: BeatHold;
}

/** The seconds a beat's words take: 0 for a silent beat. */
const wordsOf = (b: HeldBeat): number =>
  Option.match(Option.fromUndefinedOr(b.speech), {
    onNone: () => 0,
    onSome: (s) => onTheMs(s.end - s.start),
  });

/** A beat once a hold is written: its length, and its holds as the layout lays them. */
export interface Held {
  readonly dur: number;
  readonly hold: BeatHold;
}

/**
 * `b` once its `edge` hold is `to`, laid by the layout's own rule
 * (`beatLength`): a lead moves its words, a tail what follows them, and its
 * `min` holds it to its length at least; a silent beat keeps its length.
 */
export const heldTo = (b: HeldBeat, edge: HoldEdge, to: number): Held => {
  const words = wordsOf(b);
  const lead = Bool.match(edge === 'lead' && words > 0, {
    onTrue: () => to,
    onFalse: () => b.hold.lead,
  });
  const asked = Bool.match(edge === 'tail', { onTrue: () => to, onFalse: () => b.hold.asked });
  const dur = onTheMs(beatLength({ words, lead, tail: asked, min: b.hold.min }));
  return {
    dur,
    hold: {
      ...b.hold,
      lead,
      asked,
      tail: Bool.match(words > 0, {
        onTrue: () => onTheMs(dur - lead - words),
        onFalse: () => dur,
      }),
    },
  };
};

/**
 * Why `b`'s `edge` held at `to` would change nothing the film plays: it has
 * no words for a hold to stand before or after, or its `min` holds it at its
 * length whatever a tail up to `to` asks. None when the hold changes it.
 */
export const holdUnchanged = (b: HeldBeat, edge: HoldEdge, to: number): Option.Option<string> => {
  const words = wordsOf(b);
  if (words === 0)
    return Option.some(
      `${b.beat} has no words to hold: it lasts ${b.dur.toFixed(1)} s, ${Bool.match(
        b.hold.min > 0,
        {
          onTrue: () => 'as its min holds it',
          onFalse: () => 'as a beat with no words does',
        },
      )}`,
    );
  const absorbed =
    edge === 'tail' &&
    b.hold.min > 0 &&
    onTheMs(b.dur) === onTheMs(b.hold.min) &&
    heldTo(b, edge, to).dur === onTheMs(b.dur);
  const over = onTheMs(b.hold.min - b.hold.lead - words).toFixed(1);
  return Option.liftPredicate(
    `${b.beat} is held at ${b.hold.min.toFixed(1)} s by its min: only a tail over ${over} s lengthens it`,
    () => absorbed,
  );
};

/** The pause between two beats' words, film seconds: from where one's words end to where the next's begin. */
interface Seam {
  readonly from: string;
  readonly to: string;
  readonly seconds: number;
}

/**
 * The seams on either side of `beat` among `beats` (the script's, in film
 * order), as the clock times the words: the one into it and the one out of
 * it, each where both beats have words. A take's trailing silence counts as
 * words here; `film check` measures its seams from the last voiced word.
 */
export const seamsAround = (beats: ReadonlyArray<HeldBeat>, beat: string): ReadonlyArray<Seam> => {
  const at = beats.findIndex((b) => b.beat === beat);
  if (at < 0) return [];
  return [at - 1, at].flatMap((i) =>
    Option.match(
      Option.all([Arr.get(beats, i), Arr.get(beats, i + 1)]).pipe(
        Option.flatMap(([p, q]) =>
          Option.map(
            Option.all([Option.fromUndefinedOr(p.speech), Option.fromUndefinedOr(q.speech)]),
            ([ps, qs]) => ({ from: p.beat, to: q.beat, seconds: onTheMs(qs.start - ps.end) }),
          ),
        ),
      ),
      { onNone: () => [], onSome: (seam) => [seam] },
    ),
  );
};

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

/** A trim's live readout: the hold's change, and the beat's length after it (`hold +3.0 s · 41.5 s long`). */
export const trimReadout = (change: number, length: number): string =>
  `hold ${signedSeconds(change)} · ${length.toFixed(1)} s long`;

/** What a hold set says to the owner. */
export const heldWords = (beat: string, edge: HoldEdge, from: number, to: number): string =>
  `Held ${beat} ${signedSeconds(to - from)} ${SIDE[edge]} its words.`;

/** What a hold already where it is asked says to the owner. */
export const heldAlready = (beat: string, edge: HoldEdge, value: number): string =>
  `${beat} already holds ${value.toFixed(1)} s ${SIDE[edge]} its words.`;

/** How a step's words begin. */
const STEPPED = { undo: 'Undone', redo: 'Redone' } as const;

/** A step's change as the owner's words name it (`Undone: Moved look to the end.`): the words its edit said, or what it set. */
export const stepped = (verb: 'undo' | 'redo', words: string): string =>
  `${STEPPED[verb]}: ${words}`;

/** What every edit of the script tells the owner comes next: the agents' part. */
export const AGENTS_AFTER = 'Agents re-time and re-check.';

/** The work an edit files for the agents on the production's ledger. */
export const workFiled = (said: string): string => `${said} Re-time, re-check seams, re-render.`;
