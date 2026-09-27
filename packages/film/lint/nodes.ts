// The AST reads the `film` lint rules share: a node's ancestors, and the
// name a call is made under.

import { Option } from 'effect';
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

/** The Program `node` sits in. */
export const programOf = (node: ESTree.Node): Option.Option<ESTree.Program> =>
  Option.flatMap(Option.fromUndefinedOr(ancestors(node).at(-1)), (root) => {
    if (root.type === 'Program') return Option.some(root);
    return Option.none();
  });

/** `name(...)`: a call whose callee is the bare identifier `name`. */
export const callsNamed = (node: ESTree.Node, name: string): boolean =>
  node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === name;

/** A property's key, when it is a plain identifier (`timeline: …`). */
export const keyName = (property: ESTree.ObjectPropertyKind): Option.Option<string> => {
  if (property.type !== 'Property' || property.computed || property.key.type !== 'Identifier')
    return Option.none();
  return Option.some(property.key.name);
};
