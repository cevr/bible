// The AST reads the `film` lint rules share: a node's ancestors, the name a
// member expression reads, what a name is bound to (a definition, an import, a
// top-level const), a number written out or named by a top-level const, an
// object literal's property by name, and whether an expression is a cue's
// progress.

import { Effect, Option, Predicate } from 'effect';
import {
  type Definition,
  type ESTree,
  type OxlintSourceCode,
  type RuleContext,
  Scope,
  sourceCode,
  type Variable,
} from 'oxlint-plugin-effect/rule-bindings';

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

// Bindings. Every name a rule reads a meaning into (a const's value, an
// import, a type) is resolved by the file's scope tree where it is read, so a
// parameter, a local or a type parameter of the same name is its own binding.

/** A name, where it is read. */
export type Named = ESTree.Node & { readonly name: string };

/** How `id` is bound where it is read: its first definition, none for a global the file does not bind. */
const definitionIn = (code: OxlintSourceCode, id: Named): Option.Option<Definition> =>
  Option.flatMap(Scope.findVariableUp(code.getScope(id), id.name), (v: Variable) =>
    Option.fromUndefinedOr(v.defs[0]),
  );

/** `definitionIn`, through the rule's context. */
export const definitionOf = (id: Named) => Effect.map(sourceCode, (code) => definitionIn(code, id));

/** What an import binds: the module it is from, and the name it takes there (`*` the module whole, `default`). */
interface Imported {
  readonly from: string;
  readonly name: string;
}

/** The import `id` is bound to where it is read, when it is one. */
const importIn = (code: OxlintSourceCode, id: Named): Option.Option<Imported> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const declaration = def.parent;
    if (def.type !== 'ImportBinding' || declaration?.type !== 'ImportDeclaration')
      return Option.none();
    const from = String(declaration.source.value);
    const s = def.node;
    if (s.type === 'ImportNamespaceSpecifier') return Option.some({ from, name: '*' });
    if (s.type === 'ImportDefaultSpecifier') return Option.some({ from, name: 'default' });
    if (s.type !== 'ImportSpecifier') return Option.none();
    return Option.map(staticName(s.imported, false), (name) => ({ from, name }));
  });

/** `importIn`, through the rule's context. */
const importOf = (id: Named) => Effect.map(sourceCode, (code) => importIn(code, id));

/** Whether `node` is a name bound to the import of `name` from a module `from` accepts. */
export const importsAs = (
  node: ESTree.Node,
  from: (module: string) => boolean,
  name: string,
): Effect.Effect<boolean, never, RuleContext> => {
  if (node.type !== 'Identifier') return Effect.succeed(false);
  return Effect.map(importOf(node), (i) =>
    Option.exists(i, (x) => from(x.from) && x.name === name),
  );
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
 * The value `id` holds where it is read when its binding is a top-level
 * `const` (`HOLD` for `const HOLD = 0.5`), under its type wrappers (`as
 * const`). A parameter or a local of the same name is its own binding, whose
 * value is not known.
 */
const topLevelValueIn = (code: OxlintSourceCode, id: Named): Option.Option<ESTree.Node> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const node = def.node;
    if (def.type !== 'Variable' || node.type !== 'VariableDeclarator' || !node.init)
      return Option.none();
    if (node.id.type !== 'Identifier' || !topLevelConst(node)) return Option.none();
    return Option.some(unwrapped(node.init));
  });

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

/**
 * The value of a number in one file: written as a literal (`0.3`, `-0.3`,
 * `+0.3`), or named by a top-level const holding one written out, by the
 * name's binding where it is read (`HOLD` for `const HOLD = 0.5`, not a
 * parameter `HOLD`).
 */
export type NumberOf = (n: ESTree.Node) => Option.Option<number>;

/** What a file's top-level consts give a rule, read by each name's binding. */
export interface TopLevel {
  /** The value a name holds where it is read, when its binding is a top-level const. */
  readonly valueOf: (id: Named) => Option.Option<ESTree.Node>;
  /** A number written out, or named by a top-level const holding one. */
  readonly numberOf: NumberOf;
}

/** `TopLevel` over the file `code` reads. */
const topLevelIn = (code: OxlintSourceCode): TopLevel => {
  const numberOf: NumberOf = (n) => {
    if (n.type === 'Literal' && Predicate.isNumber(n.value)) return Option.some(n.value);
    if (n.type === 'Identifier') return Option.flatMap(topLevelValueIn(code, n), writtenNumber);
    return signed(n, numberOf);
  };
  return { valueOf: (id) => topLevelValueIn(code, id), numberOf };
};

/** The linted file's `TopLevel`, for a rule's visitors: `const { numberOf } = yield* topLevel`. */
export const topLevel: Effect.Effect<TopLevel, never, RuleContext> = Effect.map(
  sourceCode,
  topLevelIn,
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

/** Whether `id`, where it is read, is a `const` bound to a cue's progress. */
const boundToCue = (id: Named) =>
  Effect.map(definitionOf(id), (def) =>
    Option.exists(
      def,
      (d) =>
        d.node.type === 'VariableDeclarator' &&
        Option.exists(Option.fromNullOr(d.node.init), isCueProgress),
    ),
  );

/**
 * Whether `x` is a cue's progress: `f.at(…)`, or a name bound (by `const`,
 * anywhere in scope) to one. A progress passed in as a parameter is not traced.
 */
export const readsCue = (x: ESTree.Node) => {
  if (isCueProgress(x)) return Effect.succeed(true);
  if (x.type === 'Identifier') return boundToCue(x);
  return Effect.succeed(false);
};
