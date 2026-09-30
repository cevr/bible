// `film/no-point-free-log`: a logger is called, never handed over point-free
// to a call that passes its callback an index. `Console.log` and the
// `Effect.log*` family are variadic, so `Effect.forEach(lines, Console.log)`
// prints each line followed by its index (`… text="tighter" 0`), and a reader
// of the output (a Monitor on `film notes --watch`) gets a field that is not
// there. Write `(line) => Console.log(line)`.
//
// Callbacks passed an index: an array's `forEach`, `map`, `flatMap`,
// `filter`, `some`, `every`, `find`, `findIndex` and `reduce` (and effect's
// `Array` module's, under any name), and `Effect.forEach`, `Effect.filter` and
// `Effect.partition`. The other members of `Effect`, `Stream`, `Option`,
// `Result` and `Layer` pass one value, so `Effect.flatMap(x, Console.log)`
// passes.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

/** Methods that pass their callback the element's index after it. */
const INDEXED = new Set([
  'forEach',
  'map',
  'flatMap',
  'filter',
  'some',
  'every',
  'find',
  'findIndex',
  'reduce',
]);

/** Effect modules whose callbacks take one value, but for the members in `indexedIn`. */
const ONE_VALUE = new Set(['Effect', 'Stream', 'Option', 'Result', 'Layer']);
const indexedIn = new Set(['forEach', 'filter', 'partition']);

/** `Console.log`, `console.error`, `Effect.logInfo`: the logger an argument names, when it is one. */
const loggerOf = (n: ESTree.Node): Option.Option<string> => {
  if (n.type !== 'MemberExpression' || n.object.type !== 'Identifier') return Option.none();
  const owner = n.object.name;
  return Option.flatMap(memberName(n), (name) => {
    if (owner === 'Console' || owner === 'console') return Option.some(`${owner}.${name}`);
    if (owner === 'Effect' && name.startsWith('log')) return Option.some(`Effect.${name}`);
    return Option.none();
  });
};

/** Whether a call passes its callback an index: `xs.forEach(f)`, `Effect.forEach(xs, f)`, not `Effect.flatMap(x, f)`. */
const passesIndex = (call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return false;
  return Option.exists(memberName(callee), (name) => {
    if (callee.object.type === 'Identifier' && ONE_VALUE.has(callee.object.name))
      return indexedIn.has(name);
    return INDEXED.has(name);
  });
};

export const noPointFreeLog = Rule.define({
  name: 'no-point-free-log',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A variadic logger (Console.*, console.*, Effect.log*) handed point-free to a callback that is passed an index prints the index after each line.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          Effect.forEach(
            node.arguments.flatMap((a) => Option.toArray(loggerOf(a)).map((name) => ({ a, name }))),
            ({ a, name }) =>
              context.report(
                Diagnostic.make({
                  node: a,
                  message: `${name} passed point-free: it is variadic, and this call passes the index too, which it prints after each line. Write (line) => ${name}(line).`,
                }),
              ),
          ),
          Effect.succeed(passesIndex(node)),
        ),
      ),
    );
  },
});
