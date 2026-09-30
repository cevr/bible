// The AST reads the `film` lint rules share: a node's ancestors, the name a
// member expression reads, a number written out or named by a module const,
// and an object literal's property by name.

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

/** The file a node is in. */
const programOf = (n: ESTree.Node): ESTree.Node => {
  let at = n;
  while (at.type !== 'Program') at = at.parent;
  return at;
};

/** A top-level statement's declaration: itself, or what an `export` declares. */
const declared = (statement: ESTree.Node) => {
  if (statement.type === 'ExportNamedDeclaration') return statement.declaration;
  return statement;
};

/** The numbers a file names at its top level: `const HOLD = 0.5`, exported or not. */
const moduleNumbers = (program: ESTree.Node): ReadonlyMap<string, number> => {
  const out = new Map<string, number>();
  if (program.type !== 'Program') return out;
  for (const statement of program.body) {
    const declaration = declared(statement);
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
    for (const d of declaration.declarations)
      if (
        d.id.type === 'Identifier' &&
        d.init?.type === 'Literal' &&
        Predicate.isNumber(d.init.value)
      )
        out.set(d.id.name, d.init.value);
  }
  return out;
};

/** `moduleNumbers`, read once per file. */
const numbersByFile = new WeakMap<ESTree.Node, ReadonlyMap<string, number>>();
const namedNumber = (n: ESTree.Node, name: string): Option.Option<number> => {
  const program = programOf(n);
  const known = Option.getOrElse(Option.fromUndefinedOr(numbersByFile.get(program)), () => {
    const found = moduleNumbers(program);
    numbersByFile.set(program, found);
    return found;
  });
  return Option.fromUndefinedOr(known.get(name));
};

/**
 * The value of a number written as a literal (`0.3`, `-0.3`), or named by a
 * module const holding one (`HOLD` for `const HOLD = 0.5`).
 */
export const numberOf = (n: ESTree.Node): Option.Option<number> => {
  if (n.type === 'Literal' && Predicate.isNumber(n.value)) return Option.some(n.value);
  if (n.type === 'Identifier') return namedNumber(n, n.name);
  if (n.type === 'UnaryExpression' && n.operator === '-')
    return Option.map(numberOf(n.argument), (v) => -v);
  return Option.none();
};

/** The property `key` of an object literal, by plain name. */
export const property = (
  n: ESTree.ObjectExpression,
  key: string,
): Option.Option<ESTree.ObjectProperty> =>
  Option.fromUndefinedOr(
    n.properties.find(
      (p): p is ESTree.ObjectProperty =>
        p.type === 'Property' && !p.computed && p.key.type === 'Identifier' && p.key.name === key,
    ),
  );
