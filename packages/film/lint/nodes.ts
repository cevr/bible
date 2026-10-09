// The AST reads the `film` lint rules share: a node's ancestors, the name a
// member expression reads, a number written out or named by a module const,
// an object literal's property by name, and whether an expression is a cue's
// progress.

import { Effect, Option, Predicate } from 'effect';
import { type ESTree, Scope, SourceCode, type Variable } from 'oxlint-plugin-effect/rule-bindings';

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

/**
 * The name a key written in the source spells: `name` when not computed, a
 * string literal (`'name'`, `['name']`), or a template with no value in it
 * (`` [`name`] ``).
 */
export const staticName = (key: ESTree.Node, computed: boolean): Option.Option<string> => {
  if (!computed && key.type === 'Identifier') return Option.some(key.name);
  if (key.type === 'Literal' && Predicate.isString(key.value)) return Option.some(key.value);
  if (computed && key.type === 'TemplateLiteral' && key.expressions.length === 0)
    return Option.fromNullishOr(key.quasis[0]?.value.cooked);
  return Option.none();
};

/** The name a member expression reads: `a.name`, `a['name']`, or `` a[`name`] ``. */
export const memberName = (node: ESTree.MemberExpression): Option.Option<string> =>
  staticName(node.property, node.computed);

/** The name a property of an object literal or pattern is keyed by: `name`, `'name'`, `['name']`. */
export const keyName = (node: ESTree.Node): Option.Option<string> => {
  if (node.type !== 'Property') return Option.none();
  return staticName(node.key, node.computed);
};

/**
 * The value an expression holds under its parentheses and type wrappers:
 * `(x)`, `x as T`, `x satisfies T`, `x!` and `<T>x` are each `x` at run time.
 */
export const unwrapped = (node: ESTree.Node): ESTree.Node => {
  if (
    node.type === 'ParenthesizedExpression' ||
    node.type === 'TSAsExpression' ||
    node.type === 'TSSatisfiesExpression' ||
    node.type === 'TSNonNullExpression' ||
    node.type === 'TSTypeAssertion'
  )
    return unwrapped(node.expression);
  return node;
};

/** The file a node is in. */
export const programOf = (n: ESTree.Node): ESTree.Node => {
  let at = n;
  while (at.type !== 'Program') at = at.parent;
  return at;
};

/** A top-level statement's declaration: itself, or what an `export` declares. */
export const declared = (statement: ESTree.Node) => {
  if (statement.type === 'ExportNamedDeclaration') return statement.declaration;
  return statement;
};

/** A sign over the number `read` reads: `-x` its negation, `+x` itself. */
const signed = (
  n: ESTree.Node,
  read: (x: ESTree.Node) => Option.Option<number>,
): Option.Option<number> => {
  if (n.type !== 'UnaryExpression') return Option.none();
  if (n.operator === '-') return Option.map(read(n.argument), (v) => -v);
  if (n.operator === '+') return read(n.argument);
  return Option.none();
};

/** A number written out: `0.5`, or signed, `-0.5`, `+0.5`. */
const writtenNumber = (n: ESTree.Node): Option.Option<number> => {
  if (n.type === 'Literal' && Predicate.isNumber(n.value)) return Option.some(n.value);
  return signed(n, writtenNumber);
};

/** The numbers a file names at its top level: `const HOLD = 0.5`, `const BACK = -3`, exported or not. */
const moduleNumbers = (program: ESTree.Node): ReadonlyMap<string, number> => {
  const out = new Map<string, number>();
  if (program.type !== 'Program') return out;
  for (const statement of program.body) {
    const declaration = declared(statement);
    if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') continue;
    for (const d of declaration.declarations) {
      const id = d.id;
      if (id.type === 'Identifier' && d.init)
        Option.map(writtenNumber(d.init), (v) => out.set(id.name, v));
    }
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
 * The value of a number written as a literal (`0.3`, `-0.3`, `+0.3`), or
 * named by a module const holding one (`HOLD` for `const HOLD = 0.5`).
 */
export const numberOf = (n: ESTree.Node): Option.Option<number> => {
  if (n.type === 'Literal' && Predicate.isNumber(n.value)) return Option.some(n.value);
  if (n.type === 'Identifier') return namedNumber(n, n.name);
  return signed(n, numberOf);
};

/** Whether a declarator is a top-level `const`'s, exported or not. */
const topLevelConst = (declarator: ESTree.Node): boolean => {
  const declaration = declarator.parent;
  if (declaration?.type !== 'VariableDeclaration' || declaration.kind !== 'const') return false;
  const owner = declaration.parent;
  return (
    owner.type === 'Program' ||
    (owner.type === 'ExportNamedDeclaration' && owner.parent.type === 'Program')
  );
};

/**
 * The number the name `id` holds where it is read, by its lexical binding:
 * a top-level `const` of a number written out (`HALF_MS` for `const HALF_MS
 * = 0.0005`). A parameter or a local of the same name is its own binding,
 * whose value is not known.
 */
export const boundNumber = (id: ESTree.Node & { readonly name: string }) =>
  Effect.map(SourceCode.getScope(id), (scope) =>
    Option.flatMap(
      Option.flatMap(Scope.findVariableUp(scope, id.name), (v: Variable) =>
        Option.fromUndefinedOr(v.defs[0]),
      ),
      (def) => {
        const node = def.node;
        if (def.type !== 'Variable' || node.type !== 'VariableDeclarator' || !node.init)
          return Option.none();
        if (node.id.type !== 'Identifier' || !topLevelConst(node)) return Option.none();
        return writtenNumber(node.init);
      },
    ),
  );

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

/** `f.at(…)`: a call to a member named `at`. */
const isCueProgress = (n: ESTree.Node): boolean =>
  n.type === 'CallExpression' &&
  n.callee.type === 'MemberExpression' &&
  Option.contains(memberName(n.callee), 'at');

/** Whether `name`, where `node` sits, is a `const` bound to a cue's progress. */
const boundToCue = (node: ESTree.Node, name: string) =>
  Effect.map(SourceCode.getScope(node), (scope) =>
    Option.exists(
      Option.flatMap(Scope.findVariableUp(scope, name), (v: Variable) =>
        Option.fromUndefinedOr(v.defs[0]),
      ),
      (def) =>
        def.node.type === 'VariableDeclarator' &&
        Option.exists(Option.fromNullOr(def.node.init), isCueProgress),
    ),
  );

/**
 * Whether `x` is a cue's progress: `f.at(…)`, or a name bound (by `const`,
 * anywhere in scope) to one. A progress passed in as a parameter is not traced.
 */
export const readsCue = (x: ESTree.Node) => {
  if (isCueProgress(x)) return Effect.succeed(true);
  if (x.type === 'Identifier') return boundToCue(x, x.name);
  return Effect.succeed(false);
};
