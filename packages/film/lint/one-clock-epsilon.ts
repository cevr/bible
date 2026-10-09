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
// - a millisecond or less, down to any fraction of it, added to or taken from
//   a value (`w.start >= m - 1e-3`, `near + 0.001`, `1e-3 + near`, `near - 1
//   / 1000`, `near - 1 / 1_000_000`, `near + -0.001`, or a top-level const
//   holding one, by the name's own binding: `near + HALF_MS`, but not a
//   parameter called `HALF_MS`): a step by hand, which `core/time.ts` owns;
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
  type SourceCode,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { boundNumber, memberName } from './nodes.ts';

/** The largest number a bare nudge is: below it is float noise, at it a tenth of a millisecond. */
const NOISE = 1e-4;

/** The largest step by hand: a millisecond, the finest time a file keeps. */
const MILLISECOND = 1e-3;

const MESSAGE =
  'a nudge written beside a time: put the time on its grid through packages/film/src/core/time.ts (frameAtOrAfter, frameAtOrBefore, onTheMs, offTheMs, heardAtOrAfter, justBefore), or judge two times one with CLOCK_EPSILON, so one owner rounds every time.';

/** Whether `node` writes a nudge out: a number above 0 and below `NOISE`. */
const isNudge = (node: ESTree.Node) =>
  node.type === 'Literal' && Predicate.isNumber(node.value) && node.value > 0 && node.value < NOISE;

/** A value read from the scope tree. */
type Reads<A> = Effect.Effect<A, never, Effect.Services<ReturnType<typeof SourceCode.getScope>>>;

/** The value of `x op y`, when both are known. */
const folded = (
  node: ESTree.BinaryExpression,
  op: (x: number, y: number) => number,
): Reads<Option.Option<number>> =>
  Effect.map(Effect.all([valueOf(node.left), valueOf(node.right)]), ([x, y]) =>
    Option.map(Option.all([x, y]), ([a, b]) => op(a, b)),
  );

/**
 * The value of a number written out (`1e-3`, `-1e-3`), named by a top-level
 * const by its lexical binding (`HALF_MS`, not a parameter of that name), or
 * folded from a product or quotient of such (`1 / 1000`). A const holding a
 * nudge (`const NUDGE = 5e-5`) has no value here: its literal is judged where
 * it is written, refused or said there to be no time.
 */
const valueOf = (node: ESTree.Node): Reads<Option.Option<number>> => {
  if (node.type === 'BinaryExpression' && node.operator === '/')
    return folded(node, (x, y) => x / y);
  if (node.type === 'BinaryExpression' && node.operator === '*')
    return folded(node, (x, y) => x * y);
  if (node.type === 'ParenthesizedExpression') return valueOf(node.expression);
  if (node.type === 'UnaryExpression' && node.operator === '-')
    return Effect.map(
      valueOf(node.argument),
      Option.map((v) => -v),
    );
  if (node.type === 'UnaryExpression' && node.operator === '+') return valueOf(node.argument);
  if (node.type === 'Literal' && Predicate.isNumber(node.value))
    return Effect.succeedSome(node.value);
  if (node.type === 'Identifier')
    return Effect.map(
      boundNumber(node),
      Option.filter((v) => Math.abs(v) >= NOISE),
    );
  return Effect.succeedNone;
};

/** Whether `node` writes a nudge out anywhere in it: the `Literal` visit reports that one. */
const holdsNudge = (node: ESTree.Node): boolean => {
  if (isNudge(node)) return true;
  if (node.type === 'ParenthesizedExpression') return holdsNudge(node.expression);
  if (node.type === 'UnaryExpression') return holdsNudge(node.argument);
  if (node.type === 'BinaryExpression') return holdsNudge(node.left) || holdsNudge(node.right);
  return false;
};

/** Whether `node` is a step of a millisecond or less, either way, that no nudge written in it already reports. */
const isStep = (node: ESTree.Node): Reads<boolean> => {
  if (holdsNudge(node)) return Effect.succeed(false);
  return Effect.map(
    valueOf(node),
    Option.exists((v) => Math.abs(v) > 0 && Math.abs(v) <= MILLISECOND),
  );
};

/**
 * Whether `node` adds or takes a millisecond, or less, written out: on the
 * right of `+` or `-`, or on the left of `+` (`1e-3 - t` is no step).
 */
const stepsByHand = (node: ESTree.BinaryExpression): Reads<boolean> => {
  if (node.operator !== '+' && node.operator !== '-') return Effect.succeed(false);
  if (node.operator === '-') return isStep(node.right);
  return Effect.map(Effect.all([isStep(node.right), isStep(node.left)]), ([r, l]) => r || l);
};

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
    const report = (node: ESTree.Node, when: Reads<boolean>) =>
      Effect.asVoid(Effect.when(context.report(Diagnostic.make({ node, message: MESSAGE })), when));
    return Visitor.merge(
      Visitor.on('Literal', (node) => report(node, Effect.succeed(isNudge(node)))),
      Visitor.merge(
        Visitor.on('BinaryExpression', (node) => report(node, stepsByHand(node))),
        Visitor.on('CallExpression', (node) =>
          report(node, Effect.succeed(roundsWithEpsilon(node))),
        ),
      ),
    );
  },
});
