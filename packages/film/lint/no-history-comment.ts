// `film/no-history-comment`: a comment says what the code does today and why.
// How it got here (the loop pass that found a defect, the batch that made a
// change, the commit that fixed it, what the code did before) is history: it
// lives in the ledger and in `git log`, and a comment that tells it goes stale
// while the code it sits on stays true.
//
// Refused in a comment: a pass number (the word pass or passes and a number,
// or pass, a dash and a number), a batch id (`p`, a number, a dash and a
// word), a ledger id (a finding's or a decision's: one of the ledger's
// prefixes, a dash and a number; a guard's `G` and a number with no dash), a
// commit hash (7 to 40 hex digits holding a digit and a
// letter, not a `#` colour) and "used to" after a word that is not a form of
// `be` or `get` ("is used to rank" passes, and so does a sentence that opens
// with it). A ledger id points into a ledger whose ids repeat across passes:
// the sentence beside it already says what holds. Only these forms are seen:
// a comment that tells history in other words is the sweep's to find.

import { Effect } from 'effect';
import { Diagnostic, Rule, RuleContext, Visitor } from 'oxlint-plugin-effect/rule-bindings';

/** A form of words that tells history, and what to call it in the report. */
interface Tell {
  readonly what: string;
  readonly pattern: RegExp;
}

/**
 * The ledger's id prefixes: the sweeps' findings (a sweep's capitals, with its
 * pass's digit or none), the reviews' (`R`, the pass's digit, and the area's
 * words), the prior art's and the action audit's, each a prefix, a dash and
 * a number; and the guards, `G` and one or two digits, written without one.
 * The fixture holds one of each.
 */
const LEDGER_ID =
  /\b(?:GR|G|UR[23]?|DL3?|RS3?|SU3?|ST3?|US[23]?|SV[23]?|PSH?3?|ET3?|HC|H|PA|AA|UI3?|LS|PL|EA|NS|MC|OG3?|T|R[123](?:-[a-z]+)*)-\d+[a-z]?\b|\bG\d{1,2}\b/gu;

const TELLS: ReadonlyArray<Tell> = [
  { what: 'a pass number', pattern: /\bpass(?:es)?[ -]\d+\b/giu },
  { what: 'a batch id', pattern: /\bp\d+-[a-z][a-z0-9]*\b/gu },
  { what: 'a ledger id', pattern: LEDGER_ID },
  {
    what: 'a commit hash',
    pattern: /(?<![#\w-])(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}(?![\w-])/gu,
  },
  {
    what: '"used to"',
    pattern:
      /(?<=\b[A-Za-z][\w']*\s)(?<!\b(?:is|are|was|were|be|been|being|get|gets|got)\s)used to\b/gu,
  },
];

/** Each tell in a comment's text: where it starts in the text, how long it is, and what it is. */
const tellsIn = (
  text: string,
): ReadonlyArray<{ readonly at: number; readonly length: number; readonly what: string }> =>
  TELLS.flatMap(({ what, pattern }) =>
    Array.from(text.matchAll(pattern), (m) => ({ at: m.index, length: m[0].length, what })),
  );

/** Where a comment's text starts in the file: past its `//` or `/*`. */
const OPENER = 2;

export const noHistoryComment = Rule.define({
  name: 'no-history-comment',
  meta: Rule.meta({
    type: 'suggestion',
    description:
      "A comment says today's behaviour and its reason; the history of how the code got here (a pass, a batch, a commit, what it used to do) lives in the ledger and git log.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('Program', () =>
      Effect.forEach(
        context.sourceCode.getAllComments().filter((c) => c.type !== 'Shebang'),
        (comment) =>
          Effect.forEach(
            tellsIn(comment.value),
            ({ at, length, what }) => {
              const start = comment.range[0] + OPENER + at;
              return context.report(
                Diagnostic.make({
                  node: { range: [start, start + length] },
                  message: `${what} in a comment tells history: say what the code does today and why; how it got here lives in the ledger and git log.`,
                }),
              );
            },
            { discard: true },
          ),
        { discard: true },
      ),
    );
  },
});
