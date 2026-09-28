// `film/no-hand-timed-seconds`: a time in a film is a cue or a mark, never a
// second written by hand. A literal second in a draw compiles and passes `film
// check`, but the lab cannot reach it and a sound cannot follow it (the
// 2026-09-25 ledger moved sound up to 0.80 s to meet hand-timed picture), and
// a re-take leaves it behind its word. The rule reads the shapes such a time
// takes in the draw path:
//
// 1. `clamp(x / 0.3)` or `clamp(x * 4)` over the scene clock: a progress
//    rolled by hand;
// 2. `(t - cue.start) / 0.5` anywhere: the same, unclamped (a product is a
//    rate, not a length);
// 3. `progress(t, …)` or `envelope(t, …)` with a literal start, length or
//    `± literal` among its times;
// 4. `keys(t, …)`: keyframes on the scene clock (`keys(t - cue.start, …)`,
//    a motion's shape inside a cue, is fine; `f.keys(cue, …)` is better);
// 5. `cue.end + 0.5`, `f.mark('x') - 0.4`: a literal offset from a cue edge
//    or a mark (the outermost sum, once, and not inside a call 1-4 reported);
//
// and, in a timeline, the spans whose offset stands in for a word or a pause:
//
// 6. a span anchored to a `mark`, or to the scene's `start` or `speech`, whose
//    literal `offset` is over 1 s: past a word or two from its anchor. Pin it
//    to the word (`{ mark, word }`), to a nearer mark, to a named cue
//    (`after`/`with`) or to the voice's end (`scene: 'speechEnd'`).
//
// A rate (`Math.sin(t * 7)`), an item's stagger across a cue (`f.stagger`) and
// a small lead-in before a word (`offset: -0.3`) are not times.

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, memberName } from './nodes.ts';

/** The most a span may sit off its mark or scene landmark before it skips words: 1 s. */
const MAX_OFFSET = 1;

/** A number written as a literal: `0.3`, `-0.3`. */
const isNumber = (n: ESTree.Node): boolean =>
  (n.type === 'Literal' && Predicate.isNumber(n.value)) ||
  (n.type === 'UnaryExpression' && n.operator === '-' && isNumber(n.argument));

/** The literal's value, when `n` is a number written as a literal. */
const numberOf = (n: ESTree.Node): Option.Option<number> => {
  if (n.type === 'Literal' && Predicate.isNumber(n.value)) return Option.some(n.value);
  if (n.type === 'UnaryExpression' && n.operator === '-')
    return Option.map(numberOf(n.argument), (v) => -v);
  return Option.none();
};

/** The scene clock: `t`, `f.t`, `frame.t`. */
const isTime = (n: ESTree.Node): boolean =>
  (n.type === 'Identifier' && n.name === 't') ||
  (n.type === 'MemberExpression' && Option.contains(memberName(n), 't'));

/** A cue edge or a mark: `x.start`, `x.end`, `f.cue('c').end`, `f.mark('m')`. */
const isAnchor = (n: ESTree.Node): boolean =>
  (n.type === 'MemberExpression' &&
    Option.exists(memberName(n), (name) => name === 'start' || name === 'end')) ||
  (n.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    Option.contains(memberName(n.callee), 'mark'));

/** Whether `n` or an operand inside its arithmetic satisfies `p`. */
const within = (n: ESTree.Node, p: (x: ESTree.Node) => boolean): boolean => {
  if (p(n)) return true;
  if (n.type === 'BinaryExpression') return within(n.left, p) || within(n.right, p);
  if (n.type === 'UnaryExpression') return within(n.argument, p);
  if (n.type === 'ParenthesizedExpression') return within(n.expression, p);
  return false;
};

/** `a + 0.8`, `x - 0.2 - y`: a sum or difference with a literal among its terms. */
const literalOffset = (n: ESTree.Node): boolean =>
  n.type === 'BinaryExpression' &&
  (n.operator === '+' || n.operator === '-') &&
  (isNumber(n.left) || isNumber(n.right) || literalOffset(n.left) || literalOffset(n.right));

/** `x / 0.3` or `x * 4` (either side literal): a length in seconds, or its rate. */
const scaledByLiteral = (n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type !== 'BinaryExpression' || (n.operator !== '/' && n.operator !== '*'))
    return Option.none();
  if (isNumber(n.right)) return Option.some(n.left);
  if (isNumber(n.left)) return Option.some(n.right);
  return Option.none();
};

/** The name a call is made by: `clamp(…)`, `Core.clamp(…)`. */
const calleeName = (n: ESTree.CallExpression): Option.Option<string> => {
  if (n.callee.type === 'Identifier') return Option.some(n.callee.name);
  if (n.callee.type === 'MemberExpression') return memberName(n.callee);
  return Option.none();
};

/** Why a call keeps a hand-timed second, when it does (shapes 1, 3 and 4). */
const handTimedCall = (n: ESTree.CallExpression): Option.Option<string> =>
  Option.flatMap(
    Option.filter(Option.fromUndefinedOr(n.arguments[0]), (a) => a.type !== 'SpreadElement'),
    (first) => handTimedArgs(n, first),
  );

/** `handTimedCall` once the call has a first argument that is not a spread. */
const handTimedArgs = (n: ESTree.CallExpression, first: ESTree.Node): Option.Option<string> => {
  const name = calleeName(n);
  const rest = n.arguments.slice(1);
  if (Option.contains(name, 'clamp') && n.arguments.length === 1)
    return Option.map(
      Option.filter(scaledByLiteral(first), (x) => within(x, isTime)),
      () => 'clamp over a literal length',
    );
  if (Option.exists(name, (c) => c === 'progress' || c === 'envelope') && isTime(first))
    return Option.map(
      Option.liftPredicate(rest.slice(0, 3), (times) =>
        times.some((x) => x.type !== 'SpreadElement' && (isNumber(x) || literalOffset(x))),
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
const handTimedRate = (n: ESTree.Node): boolean =>
  n.type === 'BinaryExpression' &&
  n.operator === '/' &&
  Option.exists(scaledByLiteral(n), (x) => within(x, isTime) && within(x, isAnchor));

/** Whether an ancestor already reports this time (shapes 1-4), so shape 5 stays quiet. */
const reportedAbove = (n: ESTree.Node): boolean =>
  ancestors(n).some(
    (a) =>
      (a.type === 'CallExpression' && Option.isSome(handTimedCall(a))) ||
      (a.type === 'BinaryExpression' && handTimedRate(a)),
  );

/** The string a property holds, when it is a string literal. */
const stringOf = (p: ESTree.ObjectProperty): Option.Option<string> => {
  if (p.value.type === 'Literal' && Predicate.isString(p.value.value))
    return Option.some(p.value.value);
  return Option.none();
};

/** The property `key` of an object literal, by plain name. */
const property = (n: ESTree.ObjectExpression, key: string): Option.Option<ESTree.ObjectProperty> =>
  Option.fromUndefinedOr(
    n.properties.find(
      (p): p is ESTree.ObjectProperty =>
        p.type === 'Property' && !p.computed && p.key.type === 'Identifier' && p.key.name === key,
    ),
  );

/** Shape 6: a span's literal offset over `MAX_OFFSET` from a mark or the scene's start or voice. */
const farOffset = (n: ESTree.ObjectExpression): Option.Option<ESTree.ObjectProperty> => {
  const anchored =
    Option.isSome(Option.flatMap(property(n, 'mark'), stringOf)) ||
    Option.exists(
      Option.flatMap(property(n, 'scene'), stringOf),
      (s) => s === 'start' || s === 'speech',
    );
  if (!anchored) return Option.none();
  return Option.filter(property(n, 'offset'), (p) =>
    Option.exists(numberOf(p.value), (v) => Math.abs(v) > MAX_OFFSET),
  );
};

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
    const report = (node: ESTree.Node, what: string) =>
      context.report(Diagnostic.make({ node, message: `${what}: ${advice}` }));
    return Visitor.merge(
      Visitor.on('CallExpression', (node) =>
        Option.match(handTimedCall(node), {
          onNone: () => Effect.void,
          onSome: (what) => report(node, what),
        }),
      ),
      Visitor.on('BinaryExpression', (node) => {
        if (handTimedRate(node) && !reportedAbove(node))
          return report(node, 'a progress over a literal length');
        if (node.operator !== '+' && node.operator !== '-') return Effect.void;
        // The outermost sum only, once.
        if (
          node.parent.type === 'BinaryExpression' &&
          (node.parent.operator === '+' || node.parent.operator === '-')
        )
          return Effect.void;
        if (!literalOffset(node) || !within(node, isAnchor) || reportedAbove(node))
          return Effect.void;
        return report(node, 'a literal offset from a cue edge or mark');
      }),
      Visitor.on('ObjectExpression', (node) =>
        Option.match(farOffset(node), {
          onNone: () => Effect.void,
          onSome: (offset) =>
            report(offset, `an offset over ${MAX_OFFSET} s from its mark or scene landmark`),
        }),
      ),
    );
  },
});
