// What a set's approve and its Undo say as their receipts (`Words`,
// `format.ts`): an approve that named its run says what it gave (nothing,
// when the version was approved already), and its Undo (`undoApprove`)
// withdraws just the approvals it gave, saying what the catalogue took
// (nothing, when they were withdrawn since); any other say says what was
// asked.

import { Array as Arr, Boolean as Bool, Effect, Match, Option } from 'effect';
import {
  type Command,
  type CommandId,
  type Receipt,
  type Undoing,
  Unfit,
  boundGave,
  refused,
} from '../../../command/command.ts';
import { type Say, type SetSaid, type SetSayPost, withdrawSay } from '../../../core/api.ts';
import type { OpId, Took } from '../../../core/catalogue.ts';
import { sayText } from '../format.ts';

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
