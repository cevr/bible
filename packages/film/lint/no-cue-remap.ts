// `film/no-cue-remap`: a part of a cue is a cue of its own. `clamp(f.at('answer')
// * 4)` runs a fade over the first quarter of `answer`, and `clamp((into - 2/3)
// * 3)` over its last third: the fraction is written in the draw, where the
// lab cannot reach it and a sound cannot follow it. Declare the part in the
// timeline instead, `{ with: 'answer', dur: 0.4 }` or `{ after: 'into', dur:
// 0.1, ends: true }`, and read it with `f.at`.
//
// The rule reads `clamp(e)` where `e` rescales a cue's progress by a number:
// `x * k`, `k * x`, `x / k`, each `± c`, and `(x - a) / b`, where `x` is a
// call to `.at(…)` or a name bound (by `const`, anywhere in scope) to one,
// and `k`, `a`, `b`, `c` are numbers written out or module consts. A progress
// passed in as a parameter or kept on scratch is not traced.

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

/** `clamp(e, …)`: its first argument, when it is one. */
const clamped = (n: ESTree.CallExpression): Option.Option<ESTree.Node> => {
  if (n.callee.type !== 'Identifier' || n.callee.name !== 'clamp') return Option.none();
  return Option.filter(Option.fromUndefinedOr(n.arguments[0]), (a) => a.type !== 'SpreadElement');
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
    return Visitor.on('CallExpression', (node) =>
      Option.match(clamped(node), {
        onNone: () => Effect.void,
        onSome: (e) =>
          Effect.asVoid(
            Effect.when(
              context.report(
                Diagnostic.make({
                  node,
                  message:
                    'a cue split by a fraction written in the draw: declare the part as its own cue ({ with: cue, dur } or { after: cue, dur, ends: true }) and read it with f.at, where the lab can reach it.',
                }),
              ),
              remapped(e),
            ),
          ),
      }),
    );
  },
});
