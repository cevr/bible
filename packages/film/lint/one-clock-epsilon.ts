// `film/one-clock-epsilon`: a time is put on its grid, and two times are
// judged one, by one owner, `core/time.ts`: `frameAtOrAfter` and
// `frameAtOrBefore` (a frame, or a millisecond at 1000), `onTheMs` and
// `offTheMs` (an in point up, an out point down), `heardAtOrAfter` (a word
// heard at or after a mark), `justBefore` (the last instant before a time),
// and `CLOCK_EPSILON` (two sums of seconds that are one time). A nudge
// written out beside a time (`Math.ceil(t * fps - 1e-6)`) is a second owner
// of that rule, with a tolerance of its own, and a time rounded by two owners
// creeps a frame.
//
// Refused, in the film's clock code:
// - a number written out above 0 and below `1e-4` (float noise, not a length
//   any file keeps, the millisecond being the finest);
// - a millisecond (or less) added to or taken from a value (`w.start >= m -
//   1e-3`, `near + 0.001`, `1e-3 + near`, `near - 1 / 1000`, or a module const
//   holding one: `near + HALF_MS`): a step by hand, which `core/time.ts` owns;
// - `CLOCK_EPSILON` added to or taken from the argument of `Math.ceil`,
//   `floor`, `round` or `trunc`: it judges two times one, and is no grid
//   nudge (`frameAtOrAfter` and `frameAtOrBefore` are).
// The config turns it on over the code that computes times and off where a
// tiny number is no time: `core/time.ts` (the owner), the draw path's
// geometry (`canvas/`), the mix's and the synth's sample arithmetic, the
// affine maths and the test doubles; a line elsewhere that writes pixel noise
// says so (`oxlint-disable-next-line`, with why).

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { memberName, numberOf } from './nodes.ts';

/** The largest number a bare nudge is: below it is float noise, at it a tenth of a millisecond. */
const NOISE = 1e-4;

/** The largest step by hand: a millisecond, the finest time a file keeps. */
const MILLISECOND = 1e-3;

const MESSAGE =
  'a nudge written beside a time: put the time on its grid through packages/film/src/core/time.ts (frameAtOrAfter, frameAtOrBefore, onTheMs, offTheMs, heardAtOrAfter, justBefore), or judge two times one with CLOCK_EPSILON, so one owner rounds every time.';

/** Whether `node` writes a nudge out: a number above 0 and below `NOISE`. */
const isNudge = (node: ESTree.Node) =>
  node.type === 'Literal' && Predicate.isNumber(node.value) && node.value > 0 && node.value < NOISE;

/**
 * The value of a number written out (`1e-3`), named by a module const
 * (`HALF_MS`), or folded from a product or quotient of such (`1 / 1000`).
 */
const valueOf = (node: ESTree.Node): Option.Option<number> => {
  if (node.type === 'BinaryExpression' && node.operator === '/')
    return Option.flatMap(valueOf(node.left), (left) =>
      Option.map(valueOf(node.right), (right) => left / right),
    );
  if (node.type === 'BinaryExpression' && node.operator === '*')
    return Option.flatMap(valueOf(node.left), (left) =>
      Option.map(valueOf(node.right), (right) => left * right),
    );
  return numberOf(node);
};

/** Whether `node` is a millisecond or less, but not float noise. */
const isStep = (node: ESTree.Node) =>
  Option.exists(valueOf(node), (v) => v >= NOISE && v <= MILLISECOND);

/**
 * Whether `node` adds or takes a millisecond, or less, written out: on the
 * right of `+` or `-`, or on the left of `+` (`1e-3 - t` is no step).
 */
const stepsByHand = (node: ESTree.BinaryExpression) =>
  (node.operator === '+' || node.operator === '-') &&
  (isStep(node.right) || (node.operator === '+' && isStep(node.left)));

/** Whether `node` is `CLOCK_EPSILON`. */
const isEpsilon = (node: ESTree.Node) =>
  node.type === 'Identifier' && node.name === 'CLOCK_EPSILON';

/** Whether `call` rounds a value that has `CLOCK_EPSILON` added or taken: `Math.ceil(x - CLOCK_EPSILON)`. */
const roundsWithEpsilon = (call: ESTree.CallExpression) => {
  const { callee } = call;
  if (callee.type !== 'MemberExpression') return false;
  const on = callee.object;
  const rounds = Option.exists(memberName(callee), (n) =>
    ['ceil', 'floor', 'round', 'trunc'].includes(n),
  );
  if (!(rounds && on.type === 'Identifier' && on.name === 'Math')) return false;
  return Option.exists(
    Option.fromUndefinedOr(call.arguments[0]),
    (first) =>
      first.type === 'BinaryExpression' &&
      (first.operator === '+' || first.operator === '-') &&
      (isEpsilon(first.left) || isEpsilon(first.right)),
  );
};

export const oneClockEpsilon = Rule.define({
  name: 'one-clock-epsilon',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A time is put on its grid, and two times judged one, through core/time.ts alone: no nudge written beside a time.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, when: boolean) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(when),
        ),
      );
    return Visitor.merge(
      Visitor.on('Literal', (node) => report(node, isNudge(node))),
      Visitor.merge(
        Visitor.on('BinaryExpression', (node) => report(node, stepsByHand(node))),
        Visitor.on('CallExpression', (node) => report(node, roundsWithEpsilon(node))),
      ),
    );
  },
});
