// `film/no-hand-timed-seconds`: a time in a film is a cue or a mark, never a
// second written by hand. A literal second in a draw compiles and passes `film
// check`, but the lab cannot reach it and a sound cannot follow it (the
// 2026-09-25 ledger moved sound up to 0.80 s to meet hand-timed picture), and
// a re-take leaves it behind its word. The rule reads the shapes such a time
// takes in the draw path:
//
// 1. `clamp(x / 0.3)` or `clamp(x * 4)` over the scene clock: a progress
//    rolled by hand;
// 2. `(t - cue.start) / 0.5` or `(t - 3) / 2` anywhere: the same, unclamped;
// 3. `progress(t, …)` or `envelope(t, …)` with a literal start, length or
//    `± literal` among its times;
// 4. `keys(t, …)`: keyframes on the scene clock (`keys(t - cue.start, …)`,
//    a motion's shape inside a cue, is fine; `f.keys(cue, …)` is better);
// 5. `cue.end + 0.5`, `f.mark('x') - 0.4`, `f.dur - 1.5`, `t - 4.2`: a
//    literal offset from a cue edge, a length, a mark or the clock itself (the
//    outermost sum, once, and not inside a call 1-4 reported);
// 7. `t > 3.5`, `t - cue.start > 0.5`: the clock, or a time on it, compared
//    with a literal second (`t > 0`, "has it started", is not a second);
//
// and, in a timeline, the spans whose offset stands in for a word or a pause:
//
// 6. a span anchored to a `mark`, or to the scene's `start` or `speech`
//    (`at`, the one landmark key every point uses), whose literal `offset` is
//    over 1 s: past a word or two from its anchor. Pin it to the word
//    (`{ mark, word }`), to a nearer mark, to a named cue (`after`/`with`)
//    or to the voice's end (`at: 'speechEnd'`). A sound cue's point is the
//    same shape and is read the same way. A span's end is read the same way
//    off its `until` point (a mark, a landmark, a cue's edge): a literal
//    `untilOffset` over 1 s, unless the point is the voice's end, after which
//    no word is left to pin it to.
//
// The clock is `t` or `T` (`f.t`, `f.T`). A literal is a number written out,
// or a top-level `const` holding one (`const HOLD = 0.5`), by the name's
// binding where it is read: a parameter `HOLD` is not the const.
//
// A rate (`Math.sin(t * 7)`, a phase `t * 2 + 1.3`), an item's stagger across
// a cue (`f.stagger`) and a small lead-in before a word (`offset: -0.3`) are
// not times.
//
// Limits, read by syntax alone: a product is taken for a rate, so
// `Math.min(1, (t - c.start) * 2)` (a 0.5 s length as its reciprocal) passes
// unless `clamp` wraps it alone; and these need scope or type information the
// rule does not use, so pass: a local alias of the clock (`const now = f.t`),
// a const declared inside a function, an offset spread in (`{ mark, ...LATE }`),
// a helper that hides the subtraction (`since(t, c.start) / 0.5`), and any
// member named `start`, `end` or `dur` read as a time (geometry such as
// `seg.end + 20` is flagged, though none is in a film today).

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, memberName, type NumberOf, property, topLevel } from './nodes.ts';

/** The most a span may sit off its mark or scene landmark before it skips words: 1 s. */
const MAX_OFFSET = 1;

/** Whether a number is written as a literal, or named by a top-level const holding one. */
const isNumber =
  (numberOf: NumberOf) =>
  (n: ESTree.Node): boolean =>
    Option.isSome(numberOf(n));

/** The clocks: the scene's `t` (`t`, `f.t`) and the film's `T` (`f.T`). */
const CLOCKS: ReadonlySet<string> = new Set(['t', 'T']);

const isTime = (n: ESTree.Node): boolean =>
  (n.type === 'Identifier' && CLOCKS.has(n.name)) ||
  (n.type === 'MemberExpression' && Option.exists(memberName(n), (name) => CLOCKS.has(name)));

/** A cue edge, a length or a mark: `x.start`, `x.end`, `f.dur`, `f.cue('c').end`, `f.mark('m')`. */
const isAnchor = (n: ESTree.Node): boolean =>
  (n.type === 'MemberExpression' &&
    Option.exists(memberName(n), (name) => name === 'start' || name === 'end' || name === 'dur')) ||
  (n.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    Option.contains(memberName(n.callee), 'mark'));

/** The terms of a sum or difference, through parentheses: `t - 3 + x` is `t`, `3`, `x`. */
const terms = (n: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  if (n.type === 'ParenthesizedExpression') return terms(n.expression);
  if (n.type === 'BinaryExpression' && (n.operator === '+' || n.operator === '-'))
    return [...terms(n.left), ...terms(n.right)];
  return [n];
};

/** `t - 3`: the clock itself, a term of a sum with a literal (`t * 2 + 1.3`, a phase, is not). */
const clockOffset = (numberOf: NumberOf, n: ESTree.Node): boolean => {
  const all = terms(n);
  return all.some(isTime) && all.some(isNumber(numberOf));
};

/** Whether `n` or an operand inside its arithmetic satisfies `p`. */
const within = (n: ESTree.Node, p: (x: ESTree.Node) => boolean): boolean => {
  if (p(n)) return true;
  if (n.type === 'BinaryExpression') return within(n.left, p) || within(n.right, p);
  if (n.type === 'UnaryExpression') return within(n.argument, p);
  if (n.type === 'ParenthesizedExpression') return within(n.expression, p);
  return false;
};

/** `a + 0.8`, `x - 0.2 - y`: a sum or difference with a literal among its terms. */
const literalOffset = (numberOf: NumberOf, n: ESTree.Node): boolean =>
  n.type === 'BinaryExpression' &&
  (n.operator === '+' || n.operator === '-') &&
  (isNumber(numberOf)(n.left) ||
    isNumber(numberOf)(n.right) ||
    literalOffset(numberOf, n.left) ||
    literalOffset(numberOf, n.right));

/** `x / 0.3` or `x * 4` (either side literal): a length in seconds, or its rate. */
const scaledByLiteral = (numberOf: NumberOf, n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type !== 'BinaryExpression' || (n.operator !== '/' && n.operator !== '*'))
    return Option.none();
  if (isNumber(numberOf)(n.right)) return Option.some(n.left);
  if (isNumber(numberOf)(n.left)) return Option.some(n.right);
  return Option.none();
};

/** The name a call is made by: `clamp(…)`, `Core.clamp(…)`. */
const calleeName = (n: ESTree.CallExpression): Option.Option<string> => {
  if (n.callee.type === 'Identifier') return Option.some(n.callee.name);
  if (n.callee.type === 'MemberExpression') return memberName(n.callee);
  return Option.none();
};

/** Why a call keeps a hand-timed second, when it does (shapes 1, 3 and 4). */
const handTimedCall = (numberOf: NumberOf, n: ESTree.CallExpression): Option.Option<string> =>
  Option.flatMap(
    Option.filter(Option.fromUndefinedOr(n.arguments[0]), (a) => a.type !== 'SpreadElement'),
    (first) => handTimedArgs(numberOf, n, first),
  );

/** `handTimedCall` once the call has a first argument that is not a spread. */
const handTimedArgs = (
  numberOf: NumberOf,
  n: ESTree.CallExpression,
  first: ESTree.Node,
): Option.Option<string> => {
  const name = calleeName(n);
  const rest = n.arguments.slice(1);
  if (Option.contains(name, 'clamp') && n.arguments.length === 1)
    return Option.map(
      Option.filter(scaledByLiteral(numberOf, first), (x) => within(x, isTime)),
      () => 'clamp over a literal length',
    );
  if (Option.exists(name, (c) => c === 'progress' || c === 'envelope') && isTime(first))
    return Option.map(
      Option.liftPredicate(rest.slice(0, 3), (times) =>
        times.some(
          (x) =>
            x.type !== 'SpreadElement' && (isNumber(numberOf)(x) || literalOffset(numberOf, x)),
        ),
      ),
      () => `${Option.getOrElse(name, () => 'progress')} with a literal start or length`,
    );
  if (Option.contains(name, 'keys') && isTime(first)) return Option.some('keys on the scene clock');
  return Option.none();
};

/**
 * Shape 2: `(t - cue.start) / 0.5`, a progress over a literal length from a
 * cue or mark. Only a division: `(t - cue.start) * 7` is a rate (a step, a
 * wobble), not a length.
 */
const handTimedRate = (numberOf: NumberOf, n: ESTree.Node): boolean =>
  n.type === 'BinaryExpression' &&
  n.operator === '/' &&
  Option.exists(
    scaledByLiteral(numberOf, n),
    (x) => within(x, isTime) && (within(x, isAnchor) || clockOffset(numberOf, x)),
  );

/** The comparisons: `<`, `<=`, `>`, `>=`. */
const COMPARE: ReadonlySet<string> = new Set(['<', '<=', '>', '>=']);

/** A number other than 0: `t > 0` asks whether the clock has started, not when. */
const isSecond = (numberOf: NumberOf, n: ESTree.Node): boolean =>
  Option.exists(numberOf(n), (v) => v !== 0);

/** Shape 7: `t > 3.5`, `t - cue.start > 0.5`: the clock, or a time on it, compared with a literal second. */
const comparedToSecond = (numberOf: NumberOf, n: ESTree.BinaryExpression): boolean =>
  COMPARE.has(n.operator) &&
  ((within(n.left, isTime) && isSecond(numberOf, n.right)) ||
    (within(n.right, isTime) && isSecond(numberOf, n.left)));

/** Whether an ancestor already reports this time (shapes 1-4), so shape 5 stays quiet. */
const reportedAbove = (numberOf: NumberOf, n: ESTree.Node): boolean =>
  ancestors(n).some(
    (a) =>
      (a.type === 'CallExpression' && Option.isSome(handTimedCall(numberOf, a))) ||
      (a.type === 'BinaryExpression' && handTimedRate(numberOf, a)),
  );

/** The string a property holds, when it is a string literal. */
const stringOf = (p: ESTree.ObjectProperty): Option.Option<string> => {
  if (p.value.type === 'Literal' && Predicate.isString(p.value.value))
    return Option.some(p.value.value);
  return Option.none();
};

/** Whether a property holds a literal second over `MAX_OFFSET` either way. */
const far =
  (numberOf: NumberOf) =>
  (p: ESTree.ObjectProperty): boolean =>
    Option.exists(numberOf(p.value), (v) => Math.abs(v) > MAX_OFFSET);

/** Shape 6: a span's literal offset over `MAX_OFFSET` from a mark or the scene's start or voice. */
const farOffset = (
  numberOf: NumberOf,
  n: ESTree.ObjectExpression,
): Option.Option<ESTree.ObjectProperty> => {
  const anchored =
    Option.isSome(Option.flatMap(property(n, 'mark'), stringOf)) ||
    Option.exists(
      Option.flatMap(property(n, 'at'), stringOf),
      (s) => s === 'start' || s === 'speech',
    );
  if (!anchored) return Option.none();
  return Option.filter(property(n, 'offset'), far(numberOf));
};

/** `until: { at: 'speechEnd' }`: a span that ends off the voice's end. */
const untilVoiceEnd = (p: ESTree.ObjectProperty): boolean =>
  p.value.type === 'ObjectExpression' &&
  Option.contains(Option.flatMap(property(p.value, 'at'), stringOf), 'speechEnd');

/** Shape 6, the end: a span's literal `untilOffset` over `MAX_OFFSET` from its `until` point, but the voice's end. */
const farUntilOffset = (
  numberOf: NumberOf,
  n: ESTree.ObjectExpression,
): Option.Option<ESTree.ObjectProperty> =>
  Option.flatMap(
    Option.filter(property(n, 'until'), (until) => !untilVoiceEnd(until)),
    () => Option.filter(property(n, 'untilOffset'), far(numberOf)),
  );

const advice =
  "a hand-timed second. Declare a cue in the drawing's timeline and read f.at / f.keys / f.stagger / f.cue, anchored to a mark, a word ({ mark, word }), another cue or the voice's end.";

export const noHandTimedSeconds = Rule.define({
  name: 'no-hand-timed-seconds',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A time in a film is a cue or a mark: a literal second in a draw, or a span offset over 1 s from its mark, is one the lab cannot reach, sound cannot follow and a re-take leaves behind.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const { numberOf } = yield* topLevel;
    const report = (node: ESTree.Node, what: string) =>
      context.report(Diagnostic.make({ node, message: `${what}: ${advice}` }));
    return Visitor.merge(
      Visitor.on('CallExpression', (node) =>
        Option.match(handTimedCall(numberOf, node), {
          onNone: () => Effect.void,
          onSome: (what) => report(node, what),
        }),
      ),
      Visitor.on('BinaryExpression', (node) => {
        if (comparedToSecond(numberOf, node))
          return report(node, 'the clock compared with a literal second');
        if (handTimedRate(numberOf, node) && !reportedAbove(numberOf, node))
          return report(node, 'a progress over a literal length');
        if (node.operator !== '+' && node.operator !== '-') return Effect.void;
        // The outermost sum only, once.
        if (
          node.parent.type === 'BinaryExpression' &&
          (node.parent.operator === '+' || node.parent.operator === '-')
        )
          return Effect.void;
        if (
          !literalOffset(numberOf, node) ||
          !(within(node, isAnchor) || clockOffset(numberOf, node)) ||
          reportedAbove(numberOf, node)
        )
          return Effect.void;
        return report(node, 'a literal offset from a cue edge or mark');
      }),
      Visitor.on('ObjectExpression', (node) =>
        Effect.andThen(
          Option.match(farOffset(numberOf, node), {
            onNone: () => Effect.void,
            onSome: (offset) =>
              report(offset, `an offset over ${MAX_OFFSET} s from its mark or scene landmark`),
          }),
          Option.match(farUntilOffset(numberOf, node), {
            onNone: () => Effect.void,
            onSome: (offset) =>
              report(offset, `an untilOffset over ${MAX_OFFSET} s from its until point`),
          }),
        ),
      ),
    );
  },
});
