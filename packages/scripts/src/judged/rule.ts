// A judged rule is data: which text it reads (its selector), one classify
// decision a model answers for each item of that text, the label that
// reports, how sure the model must be, and what the report says. The
// runner (`run.ts`) asks the model, caches the answers and reports; a rule
// carries no code of its own.

import { Decision } from 'effect/ai';

/** The text a judged rule reads; `changedComments` is `comments.ts`'s selector. */
type Selector = 'changedComments';

export interface JudgedRule<Label extends string> {
  /** The rule's name in its reports and its cache key. */
  readonly id: string;
  /** Raised when the decision's words change, so no cached answer outlives them. */
  readonly version: number;
  readonly selector: Selector;
  /** What one item is, as each item's instructions name it ("code comment"). */
  readonly subject: string;
  readonly decision: Decision.Classify<Label>;
  /** The label whose probability reports. */
  readonly reports: Label;
  /** The probability of `reports` at and above which an item reports. */
  readonly threshold: number;
  readonly message: string;
}

/**
 * A comment that narrates the code's past (what it used to do, which change
 * or pass altered it) instead of what it does today and why. The words are
 * those measured on TypeSafe's Jev, all 182 corpus cases in one request
 * (`pass6/judged-lint-spike/ts-batch.ts`).
 */
export const historyComment: JudgedRule<'today' | 'history'> = {
  id: 'historyComment',
  version: 1,
  selector: 'changedComments',
  subject: 'code comment',
  decision: Decision.classify({
    instructions:
      "HISTORY means the comment narrates the code's own past: an earlier behaviour that no longer holds ('this used to retry', 'before X this read argv', 'we switched to Y'), or which change, review, pass or person altered it. TODAY means anything else: what the code does, why, a constraint, or a noun phrase naming a purpose. 'X used to <verb>' meaning 'X that is used for <verb>ing' is TODAY.",
    criteria: {
      today: 'states what the code does now, or why, or a purpose, or shows data',
      history: "tells the code's past: what it used to do, what changed it, when or by whom",
    },
  }),
  reports: 'history',
  threshold: 0.9,
  message:
    "the comment tells the code's history: say what it does today and why; how it got here lives in git log",
};
