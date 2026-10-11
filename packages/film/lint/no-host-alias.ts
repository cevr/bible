// `film/no-host-alias`: a page reaches the host under the host's own name, so
// the bans on its members (`performance.now`, `document.location`,
// `window.history`) and the rule on its events can read every use of it. A
// host global held under a name of the page's own (`const perf = performance`,
// `const { now } = performance`, `later = window`, `{ w: window }`) is a use
// no ban can follow: `perf.now()` passes every one.
//
// Refused: the host's global objects (`window`, `document`, `navigator`,
// `performance`, `location`, `history`, `globalThis`, `self`) held by a name
// or a place of the page's own: the value of a declaration or an assignment,
// a property of an object literal, an element of an array, a parameter's
// default, and what a function answers (an arrow's body, a `return`); bare,
// under a type wrapper (`performance satisfies Performance`, `window as
// Window`, `navigator!`, `<Document>document`), or as a branch of a
// conditional or a logical (`own ?? window`), none of which changes the
// value. Handing the host to a call stays legitimate: that is how its
// adapters are built. A name the file declares itself (a parameter called
// `self`) is no host global (`nodes.ts`). The config turns the rule on over
// the pages that reach the host through its adapters and off in the tests
// and the fixtures.

import { Effect } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { bindings } from './nodes.ts';

/** The host's global objects. */
const HOSTS: ReadonlyArray<string> = [
  'window',
  'document',
  'navigator',
  'performance',
  'location',
  'history',
  'globalThis',
  'self',
];

const MESSAGE =
  'a host global held under a name of the page\'s own: the host bans read it only under its name, so reach it as itself, or through its adapter (packages/film/README.md, "The purity rule": The host).';

/** Nodes that hand on the value they wrap unchanged: parentheses, type wrappers. */
const WRAPS: ReadonlySet<string> = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

/**
 * Where a value `n` (a child of `up`) is held, when it is held under a name or
 * place of the page's own; it goes on up through a wrapper, a conditional's
 * branch or a logical's operand.
 */
const heldAt = (n: ESTree.Node): boolean => {
  const up = n.parent;
  if (!up) return false;
  if (WRAPS.has(up.type)) return heldAt(up);
  switch (up.type) {
    case 'ConditionalExpression':
      return up.test !== n && heldAt(up);
    case 'LogicalExpression':
      return heldAt(up);
    case 'VariableDeclarator':
      return up.init === n;
    case 'AssignmentExpression':
      return up.right === n && up.operator === '=';
    case 'AssignmentPattern':
      return up.right === n;
    case 'Property':
      return up.value === n && up.parent.type === 'ObjectExpression';
    case 'ArrayExpression':
      return true;
    case 'ArrowFunctionExpression':
      return up.body === n;
    case 'ReturnStatement':
      return true;
    default:
      return false;
  }
};

export const noHostAlias = Rule.define({
  name: 'no-host-alias',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A host global is never held under a name of the page's own: the host bans read it only under its name.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return Visitor.on('Identifier', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node: heldBy(node), message: MESSAGE })),
          Effect.succeed(HOSTS.some((name) => b.isGlobal(node, name)) && heldAt(node)),
        ),
      ),
    );
  },
});

/** The node a report stands on: the declaration or assignment that holds the host, else the host itself. */
const heldBy = (n: ESTree.Node): ESTree.Node => {
  let at = n;
  while (
    at.parent &&
    (WRAPS.has(at.parent.type) ||
      at.parent.type === 'LogicalExpression' ||
      at.parent.type === 'ConditionalExpression')
  )
    at = at.parent;
  const up = at.parent;
  if (up?.type === 'VariableDeclarator' || up?.type === 'AssignmentExpression') return up;
  return at;
};
