// What a film's write says as its receipt (`Words`, `format.ts`), in the
// words of the choices shown as it was sent: a pick, an unkeep or a reject
// says what the point plays, before → after (`Score: piano → ensemble`), a
// knob its level before → after (the level that landed, as the write left it),
// a say what was said of which variant, and an Undo or a Redo what it walked. A source write that made a change is undone by Undo, an
// Undo by Redo, a Redo by Undo, each bound to the change it made on its film
// (`Bound`); a say, which writes the catalogue and no source, by none, but
// for a set's approve of a scene's render, whose Undo (`undoApprove`)
// withdraws just the approvals it gave. The
// sound check after a pick says it is hearing the mix, then what it found.

import { Array as Arr, Boolean as Bool, Effect, Match, Option } from 'effect';
import * as AsyncResult from 'effect/reactivity/AsyncResult';
import {
  type Command,
  type CommandId,
  type Receipt,
  type Undoing,
  Unfit,
  boundGave,
  busy,
  refused,
  said,
} from '../../../command/command.ts';
import { type Say, type SetSaid, type SetSayPost, withdrawSay } from '../../../core/api.ts';
import type { OpId, Took } from '../../../core/catalogue.ts';
import type { ChoicePoint, ChoiceVerb, FilmChoices, SoundCheck } from '../../../core/choice.ts';
import type { LabFailure } from '../../api.ts';
import { type Words, failedText, sayText } from '../format.ts';
import type { ChoiceAct, Wrote } from './api.ts';

/** The commands that step the film's source back and on (`section.tsx`). */
export const REVIEW_UNDO: CommandId = 'review.undo';
export const REVIEW_REDO: CommandId = 'review.redo';

const VERB_PAST: Readonly<Record<ChoiceVerb, string>> = {
  pick: 'Picked',
  unpick: 'Unkept',
  reject: 'Rejected',
};

/** What `point` plays: its picked variants' labels, or `nothing`. */
const playsText = (point: ChoicePoint): string => {
  const picked = point.variants.filter((v) => v.picked).map((v) => v.label);
  return Option.getOrElse(
    Option.liftPredicate(picked.join(', '), (s) => s !== ''),
    () => 'nothing',
  );
};

/** The point `id` among `choices`. */
const pointIn = (choices: FilmChoices, id: string): Option.Option<ChoicePoint> =>
  Option.fromUndefinedOr(choices.points.find((p) => p.id === id));

/** The label of variant `id` at point `id` in `choices`, else its id. */
const labelIn = (choices: FilmChoices, point: string, variant: string): string =>
  Option.getOrElse(
    Option.flatMap(pointIn(choices, point), (p) =>
      Option.map(Option.fromUndefinedOr(p.variants.find((v) => v.id === variant)), (v) => v.label),
    ),
    () => variant,
  );

/** `n` findings as a summary says them: `check: clean`, `sound check: 2 findings`. */
const findingsText = (name: string, n: number): string =>
  Match.value(n).pipe(
    Match.when(0, () => `${name}: clean`),
    Match.when(1, () => `${name}: 1 finding`),
    Match.orElse((count) => `${name}: ${count} findings`),
  );

/**
 * The sound check's receipt in `result`: busy while it hears the
 * mix, its findings counted once it has, or why it could not run; none
 * before it first runs.
 */
export const soundReceipt = (
  result: AsyncResult.AsyncResult<SoundCheck, LabFailure>,
): Option.Option<Receipt> => {
  if (result.waiting) return Option.some(busy('sound check: hearing the mix…'));
  return AsyncResult.match(result, {
    onInitial: () => Option.none(),
    onSuccess: (s) => Option.some(said(findingsText('sound check', s.value.findings.length))),
    onFailure: () => Option.some(refused(`sound check: ${failedText(result)}`)),
  });
};

/** A step's target without its verb: what it walked. */
const walked = (wrote: Wrote): string =>
  `${wrote.target.replace(/^(undo|redo) /, '')} in ${wrote.file}`;

/**
 * The receipt of `act`, as the choices `before` show the film as it is sent;
 * a source write's Undo (or Redo) is bound to the change it made, on that film.
 */
export const actWords = (act: ChoiceAct, before: FilmChoices): Words<Wrote> => {
  const titleOf = (point: string) =>
    Option.getOrElse(
      Option.map(pointIn(before, point), (p) => p.title),
      () => point,
    );
  /** Undone by `command`, bound to the change `w` made; none when it made none. */
  const undoneBy = (command: CommandId) => (w: Wrote) =>
    Option.map(w.change, (change) => ({ command, bound: { film: before.film, change } }));
  return Match.value(act).pipe(
    Match.tagsExhaustive({
      Verb: (v): Words<Wrote> => ({
        doing: `${VERB_PAST[v.verb].toLowerCase()} ${labelIn(before, v.point, v.variant)}…`,
        done: (w) => {
          const was = Option.getOrElse(Option.map(pointIn(before, v.point), playsText), () => '?');
          const now = Option.getOrElse(
            Option.map(
              Option.flatMap(w.choices, (c) => pointIn(c, v.point)),
              playsText,
            ),
            () => '?',
          );
          return `${VERB_PAST[v.verb]} ${labelIn(before, v.point, v.variant)} · ${titleOf(v.point)}: ${was} → ${now}`;
        },
        undo: undoneBy(REVIEW_UNDO),
      }),
      Knob: (k): Words<Wrote> => {
        const knob = Option.flatMap(pointIn(before, k.point), (p) => p.knob);
        const unit = Option.getOrElse(
          Option.map(knob, (n) => n.unit),
          () => '',
        );
        const was = Option.getOrElse(
          Option.map(knob, (n) => String(n.value)),
          () => '?',
        );
        return {
          doing: `setting ${titleOf(k.point)}…`,
          // The level that landed, as the choices the write left read it (the server clamps).
          done: (w) => {
            const now = Option.getOrElse(
              Option.map(
                Option.flatMap(
                  Option.flatMap(w.choices, (c) => pointIn(c, k.point)),
                  (p) => p.knob,
                ),
                (n) => String(n.value),
              ),
              () => String(k.value),
            );
            return [`${titleOf(k.point)}: ${was} → ${now}`, unit].filter((s) => s !== '').join(' ');
          },
          undo: undoneBy(REVIEW_UNDO),
        };
      },
      Say: (s): Words<Wrote> => ({
        doing: 'saying…',
        done: () => sayText(s.say, `${labelIn(before, s.point, s.variant)} · ${titleOf(s.point)}`),
      }),
      Undo: (): Words<Wrote> => ({
        doing: 'undoing…',
        done: (w) => `Undid ${walked(w)}`,
        undo: undoneBy(REVIEW_REDO),
      }),
      Redo: (): Words<Wrote> => ({
        doing: 'redoing…',
        done: (w) => `Redid ${walked(w)}`,
        undo: undoneBy(REVIEW_UNDO),
      }),
    }),
  );
};

/**
 * The command a set's approve's receipt offers as its Undo: a withdraw of
 * just the approvals it gave.
 */
const UNDO_APPROVE: CommandId = 'project.undo-approve';

/**
 * The Undo of the approve run `op` that approved `scenes` of `film`: a set's
 * approve of a scene's render, which named its own run, offers it.
 */
const approveUndoOf = (
  film: string,
  op: OpId,
  scenes: ReadonlyArray<string>,
  of: Option.Option<SetApproved> = Option.none(),
): Undoing => ({
  command: UNDO_APPROVE,
  bound: {
    film,
    gave: { op, scenes, ...Option.match(of, { onNone: () => ({}), onSome: (o) => ({ of: o }) }) },
  },
});

/** The version a set's approve approved: the point it is of, and the version. */
interface SetApproved {
  readonly point: string;
  readonly version: string;
}

/**
 * What an approve's Undo says it did of `subject`, from what the catalogue
 * says it took (`SetSaid.took`): nothing, when the
 * approve's approvals were withdrawn since.
 */
const tookText = (subject: string, took: Took): string =>
  Match.value(took.scenes.length > 0).pipe(
    Match.when(true, () => `Undid approving ${subject}`),
    Match.orElse(() => `Nothing left to undo: that approval of ${subject} was withdrawn since`),
  );

/**
 * What a set's say did, in the words of its receipt, of the version
 * `subject` names: an Undo's from what the catalogue says it took (nothing,
 * when the approval was withdrawn since), an approve that named its run from
 * what it gave (nothing, when the version was approved already), any other
 * say as it was asked (`sayText`).
 */
export const setSaidText = (asked: SetSayPost, answer: SetSaid, subject: string): string =>
  Option.match(answer.took, {
    onSome: (took) => tookText(subject, took),
    onNone: () =>
      Bool.match(
        asked.say._tag === 'Approve' &&
          Option.isSome(Option.fromUndefinedOr(asked.op)) &&
          Option.isNone(answer.gave),
        {
          onTrue: () => `Approved already: ${subject}`,
          onFalse: () => sayText(asked.say, subject),
        },
      ),
  });

/**
 * A set's approve's Undo, bound to exactly what the catalogue says it gave
 * (`SetSaid.gave`) and to the version it approved; none when it gave none.
 */
export const setApproveUndo = (
  film: Option.Option<string>,
  asked: SetSayPost,
  point: string,
  answer: SetSaid,
): Option.Option<Undoing> =>
  Option.map(
    Option.all({ film, gave: Option.filter(answer.gave, (g) => g.scenes.length > 0) }),
    ({ film: of, gave }) =>
      approveUndoOf(of, gave.op, gave.scenes, Option.some({ point, version: asked.variant })),
  );

/**
 * An approve's Undo as a command (`UNDO_APPROVE`), as its page registers it:
 * one withdraw, given the approve's op, of the scenes it gave, sent by the
 * page's `withdraw` (whose receipt says what it took). The catalogue takes
 * only the approvals that op gave: another's approval since stays, and
 * whether any is left is the catalogue's to say, not the page's.
 */
export const undoApprove = (
  film: string,
  how: {
    readonly waiting: () => boolean;
    /** `of`: the version a set's approve approved, when the receipt names it. */
    readonly withdraw: (
      ids: readonly [string, ...string[]],
      say: Say,
      of: Option.Option<SetApproved>,
    ) => Effect.Effect<Receipt>;
  },
): Command => ({
  id: UNDO_APPROVE,
  label: 'Undo',
  labelIn: () => 'Undo an approve',
  group: 'Edit',
  typed: true,
  touch: "the approve's receipt's Undo",
  when: () => !how.waiting(),
  fits: (bound) =>
    Option.map(
      Option.liftPredicate(bound.film, (f) => f !== film),
      (f) => Unfit.Now({ reason: `that approve was of ${f}` }),
    ),
  run: (_, invoked) =>
    Option.match(Option.flatMap(Option.fromUndefinedOr(invoked.bound), boundGave), {
      onNone: () => Effect.succeed(refused("an approve is undone from its receipt's Undo")),
      onSome: (gave) =>
        Arr.match(gave.scenes, {
          onEmpty: () => Effect.succeed(refused('that approve gave no approval to take back')),
          onNonEmpty: (ids) =>
            how.withdraw(ids, withdrawSay(Option.some(gave.op)), Option.fromUndefinedOr(gave.of)),
        }),
    }),
});
