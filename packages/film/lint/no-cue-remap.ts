// `film/no-cue-remap`: a part of a cue is a cue of its own. `clamp(f.at('answer')
// * 4)` runs a fade over the first quarter of `answer`, and `clamp((into - 2/3)
// * 3)` over its last third: the fraction is written in the draw, where the
// lab cannot reach it and a sound cannot follow it. Declare the part in the
// timeline instead, `{ with: 'answer', dur: 0.4 }` or `{ after: 'into', dur:
// 0.1, ends: true }`, and read it with `f.at`. A step part way through a cue,
// `f.at('sit') >= 0.3`, hides a moment the same way: declare it as a cue of
// no length at that instant, `{ with: 'sit', offset: 0.056, dur: 0 }`, and
// read whether it has come with `f.at('colour') > 0`. An instant the drawing's
// own shape makes (a card that flips shows its other side once edge on) is
// read from that shape, `Math.cos(f.at('flip') * Math.PI) < 0`, so it stays
// where the shape puts it however the cue is dragged.
//
// The rule reads `clamp(e)`, and `Math.min(1, e)` either way round, where `e`
// rescales a cue's progress by a number: `x * k`, `k * x`, `x / k`, each
// `± c`, and `(x - a) / b`; and a comparison `x < k` (`<=`, `>`, `>=`,
// either way round) with `k` inside `STEP` (a comparison within `STEP`'s
// margin of 0 or 1 asks whether the cue has begun, is seen at all, or is
// done: the cue's own edges). `x` is a call to `.at(…)` or a name bound (by
// `const`, anywhere in scope) to one, and `k`, `a`, `b`, `c` are numbers
// written out or module consts. A progress passed in as a parameter or kept
// on scratch is not traced. A part that runs to the cue's end, `(x - a) / (1 -
// a)` or `(x - a) * k` with k = 1 / (1 - a), is told to land on that end
// (`{ after: cue, dur, ends: true }`), so a drag of the cue carries it.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { numberOf, readsCue } from './nodes.ts';

/** Whether an expression is a remapped cue, read through the linted file's scopes. */
type Reads = Effect.Effect<boolean, never, RuleContext>;

/** A number written as a literal, or a module const naming one. */
const isNumber = (n: ESTree.Node): boolean => Option.isSome(numberOf(n));

/** `n` without the parentheses round it. */
const bare = (n: ESTree.Node): ESTree.Node => {
  if (n.type === 'ParenthesizedExpression') return bare(n.expression);
  return n;
};

/** `x - a`: a cue's progress shifted by a number. */
const shifted = (n: ESTree.Node) => {
  if (n.type === 'BinaryExpression' && n.operator === '-' && isNumber(n.right))
    return readsCue(bare(n.left));
  return Effect.succeed(false);
};

/** `x * k`, `k * x`, `x / k`, `(x - a) * k` or `(x - a) / b`: a cue's progress rescaled by a number. */
const scaled = (n: ESTree.Node): Reads => {
  if (n.type !== 'BinaryExpression') return Effect.succeed(false);
  const left = bare(n.left);
  const right = bare(n.right);
  if (n.operator === '*' && isNumber(left)) return readsCue(right);
  if ((n.operator === '*' || n.operator === '/') && isNumber(right))
    return Effect.map(Effect.all([readsCue(left), shifted(left)]), ([a, b]) => a || b);
  return Effect.succeed(false);
};

/** A rescaled progress, with or without a number added or taken: `x * k - c`, `c + x * k`. */
const remapped = (n: ESTree.Node): Reads => {
  const e = bare(n);
  if (e.type === 'BinaryExpression' && (e.operator === '+' || e.operator === '-')) {
    if (isNumber(e.right)) return scaled(bare(e.left));
    if (e.operator === '+' && isNumber(e.left)) return scaled(bare(e.right));
  }
  return scaled(e);
};

/** The shares of a cue a comparison marks a moment inside: past its first and short of its last 2 %. */
const STEP = [0.02, 0.98] as const;

const COMPARES: ReadonlySet<string> = new Set(['<', '<=', '>', '>=']);

/** A number strictly inside `STEP`. */
const inside = (n: ESTree.Node) => Option.exists(numberOf(n), (k) => k > STEP[0] && k < STEP[1]);

/** `x < k` or `k < x` (any of `<`, `<=`, `>`, `>=`): a step at a share `k` of a cue's progress. */
const stepped = (n: ESTree.BinaryExpression): Reads => {
  if (!COMPARES.has(n.operator)) return Effect.succeed(false);
  const left = bare(n.left);
  const right = bare(n.right);
  if (inside(right)) return readsCue(left);
  if (inside(left)) return readsCue(right);
  return Effect.succeed(false);
};

/** How far a tail's shift and length may miss 1 and still be the cue's last part. */
const WHOLE = 1e-6;

/**
 * Whether `n` is `(x - a) / (1 - a)` or `(x - a) * k` with k = 1 / (1 - a),
 * read from its numbers: a part that ends where its cue does.
 */
const isTail = (n: ESTree.Node): boolean => {
  const e = bare(n);
  if (e.type !== 'BinaryExpression' || (e.operator !== '/' && e.operator !== '*')) return false;
  const left = bare(e.left);
  if (left.type !== 'BinaryExpression' || left.operator !== '-') return false;
  const operator = e.operator;
  return Option.exists(Option.all([numberOf(left.right), numberOf(bare(e.right))]), ([a, k]) =>
    restIsWhole(operator, a, k),
  );
};

/** Whether the rest of a cue after share `a`, divided by `k` (`/`) or scaled by it (`*`), is the whole 0→1. */
const restIsWhole = (operator: '/' | '*', a: number, k: number): boolean => {
  if (operator === '/') return Math.abs(1 - a - k) < WHOLE;
  return Math.abs((1 - a) * k - 1) < WHOLE;
};

/** What the rule says of a part of a cue: a tail is landed on the cue's end, any other part runs with it. */
const partMessage = (e: ESTree.Node): string => {
  if (isTail(e))
    return "a cue's last part split by a fraction written in the draw: declare it as its own cue that lands on the cue's end ({ after: cue, dur, ends: true }) and read it with f.at, so a drag of the cue carries it.";
  return 'a cue split by a fraction written in the draw: declare the part as its own cue ({ with: cue, dur }, or { after: cue, dur, ends: true } for its last part) and read it with f.at, where the lab can reach it.';
};

/** A call's argument, when it is an expression. */
const argument = (n: ESTree.CallExpression, i: number): Option.Option<ESTree.Node> =>
  Option.filter(Option.fromUndefinedOr(n.arguments[i]), (a) => a.type !== 'SpreadElement');

/** Whether `n` is the number 1, written out or a module const. */
const isOne = (n: ESTree.Node) => Option.contains(numberOf(n), 1);

/** `Math.min(1, e)` or `Math.min(e, 1)`: `e`, capped at the cue's end as `clamp` caps it. */
const capped = (n: ESTree.CallExpression): Option.Option<ESTree.Node> => {
  const callee = n.callee;
  const isMin =
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    callee.object.name === 'Math' &&
    callee.property.type === 'Identifier' &&
    callee.property.name === 'min';
  if (!isMin || n.arguments.length !== 2) return Option.none();
  const [a, b] = [argument(n, 0), argument(n, 1)];
  if (Option.exists(a, isOne)) return b;
  if (Option.exists(b, isOne)) return a;
  return Option.none();
};

/** `clamp(e, …)`, `Math.min(1, e)` or `Math.min(e, 1)`: `e`, when it is one. */
const clamped = (n: ESTree.CallExpression): Option.Option<ESTree.Node> => {
  if (n.callee.type === 'Identifier' && n.callee.name === 'clamp') return argument(n, 0);
  return capped(n);
};

export const noCueRemap = Rule.define({
  name: 'no-cue-remap',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A part of a cue is a cue of its own: clamp(f.at(cue) * k) splits it by a fraction the lab cannot reach.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, message: string, when: Reads) =>
      Effect.asVoid(Effect.when(context.report(Diagnostic.make({ node, message })), when));
    return Visitor.merge(
      Visitor.on('CallExpression', (node) =>
        Option.match(clamped(node), {
          onNone: () => Effect.void,
          onSome: (e) => report(node, partMessage(e), remapped(e)),
        }),
      ),
      Visitor.on('BinaryExpression', (node) =>
        report(
          node,
          "a step part way through a cue, written in the draw: declare the instant as its own cue ({ with: cue, offset, dur: 0 }) and read f.at(instant) > 0, where the lab can reach it and a sound can follow it; an instant the drawing's own shape makes is read from that shape (Math.cos(f.at('flip') * Math.PI) < 0).",
          stepped(node),
        ),
      ),
    );
  },
});
