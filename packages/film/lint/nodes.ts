// The AST reads the `film` lint rules share: a node's ancestors, and the
// name a member expression reads.

import { Option, Predicate } from 'effect';
import type { ESTree } from 'oxlint-plugin-effect/rule-bindings';

/** Every ancestor of `node`, nearest first, the Program last. */
export const ancestors = (node: ESTree.Node): ReadonlyArray<ESTree.Node> => {
  const out: Array<ESTree.Node> = [];
  let at = node;
  while (at.type !== 'Program') {
    at = at.parent;
    out.push(at);
  }
  return out;
};

/** The name a member expression reads: `a.name`, or `a['name']` with a string literal. */
export const memberName = (node: ESTree.MemberExpression): Option.Option<string> => {
  if (!node.computed && node.property.type === 'Identifier') return Option.some(node.property.name);
  if (node.computed && node.property.type === 'Literal' && Predicate.isString(node.property.value))
    return Option.some(node.property.value);
  return Option.none();
};
