// The AST reads the `film` lint rules share: a node's ancestors, the name a
// member expression reads, and the one binding reader: what a name is bound
// to where it is read (a definition, an import, a global, a top-level const,
// the frame a draw is handed), a number written out or named by a top-level
// const, an object literal's property by name, and whether an expression is
// a cue's progress. No rule reads a file's scope tree but through this module
// (`.oxlintrc.json` refuses `Scope`, `SourceCode` and `Variable`, and the
// context's `getScope` and `getDeclaredVariables`, to the others).

import { Effect, Option, Predicate } from 'effect';
import {
  type Definition,
  type ESTree,
  filename,
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

// Bindings. Every name a rule reads a meaning into (a const's value, an
// import, a global, a type, the frame) is resolved by the file's scope tree
// where it is read, so a parameter, a local or a type parameter of the same
// name is its own binding.

/** A name, where it is read. */
export type Named = ESTree.Node & { readonly name: string };

/**
 * A module a rule reads names from, told by what an import names: a package's
 * specifier as written (`@bible/film/core`, `effect/process`), or a relative
 * one resolved against the file that writes it (`./time.ts` in
 * `src/core/x.ts` is `…/src/core/time.ts`), so a module is the same however
 * the importing file reaches it.
 */
export type Module = (from: string) => boolean;

/** The file a rule reads: its scope tree, and its path (forward slashes). */
interface Source {
  readonly sourceCode: OxlintSourceCode;
  readonly file: string;
}

/** What a specifier names, seen from `file`: a relative one resolved against the file's folder, any other as written. */
const resolvedFrom = (file: string, from: string): string => {
  if (!from.startsWith('./') && !from.startsWith('../')) return from;
  const folder = file.split('/').slice(0, -1);
  for (const piece of from.split('/')) {
    if (piece === '..') folder.pop();
    else if (piece !== '.') folder.push(piece);
  }
  return folder.join('/');
};

/** How `id` is bound where it is read: its first definition, none for a name the file does not bind. */
const definitionIn = (code: Source, id: Named): Option.Option<Definition> =>
  Option.flatMap(Scope.findVariableUp(code.sourceCode.getScope(id), id.name), (v: Variable) =>
    Option.fromUndefinedOr(v.defs[0]),
  );

/** What an import binds: the module it is from, and the name it takes there (`*` the module whole, `default`). */
interface Imported {
  readonly from: string;
  readonly name: string;
}

/** The import `id` is bound to where it is read, when it is one. */
const importIn = (code: Source, id: Named): Option.Option<Imported> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const declaration = def.parent;
    if (def.type !== 'ImportBinding' || declaration?.type !== 'ImportDeclaration')
      return Option.none();
    const from = resolvedFrom(code.file, String(declaration.source.value));
    const s = def.node;
    if (s.type === 'ImportNamespaceSpecifier') return Option.some({ from, name: '*' });
    if (s.type === 'ImportDefaultSpecifier') return Option.some({ from, name: 'default' });
    if (s.type !== 'ImportSpecifier') return Option.none();
    return Option.map(staticName(s.imported, false), (name) => ({ from, name }));
  });

/** Whether `node` is a name bound to the import of `name` (`*`: the module whole) from a module `from` accepts. */
const importsAsIn = (code: Source, node: ESTree.Node, from: Module, name: string) => {
  if (node.type !== 'Identifier') return false;
  return Option.exists(importIn(code, node), (i) => from(i.from) && i.name === name);
};

/**
 * Whether `node` reads the export `name` of a module `from` accepts: the name
 * imported (`clamp`), under an alias (`clamp as cap`), or read off the module
 * imported whole (`Core.clamp`, `Core['clamp']`), under any type wrapper.
 */
const readsImportIn = (code: Source, node: ESTree.Node, from: Module, name: string) => {
  const n = unwrapped(node);
  if (n.type === 'Identifier') return importsAsIn(code, n, from, name);
  if (n.type !== 'MemberExpression' || !Option.contains(memberName(n), name)) return false;
  return importsAsIn(code, unwrapped(n.object), from, '*');
};

/** Whether `node` is a call of the export `name` of a module `from` accepts: `clamp(…)`, `cap(…)`, `Core.clamp(…)`. */
const callsImportIn = (code: Source, node: ESTree.Node, from: Module, name: string) =>
  node.type === 'CallExpression' && readsImportIn(code, node.callee, from, name);

/** Whether `node` is the global `name`: that name, which the file binds nowhere it is read. */
const isGlobalIn = (code: Source, node: ESTree.Node, name: string) =>
  node.type === 'Identifier' && node.name === name && Option.isNone(definitionIn(code, node));

/** Whether a declarator is a `const`'s. */
const isConst = (declarator: ESTree.Node): declarator is ESTree.VariableDeclarator =>
  declarator.type === 'VariableDeclarator' &&
  declarator.parent.type === 'VariableDeclaration' &&
  declarator.parent.kind === 'const';

/** Whether a declarator is a top-level `const`'s, exported or not. */
const topLevelConst = (declarator: ESTree.Node): boolean => {
  if (!isConst(declarator)) return false;
  const owner = declarator.parent.parent;
  return (
    owner?.type === 'Program' ||
    (owner?.type === 'ExportNamedDeclaration' && owner.parent.type === 'Program')
  );
};

/**
 * The value `id` holds where it is read when its binding is a top-level
 * `const` (`HOLD` for `const HOLD = 0.5`), under its type wrappers (`as
 * const`). A parameter or a local of the same name is its own binding, whose
 * value is not known.
 */
const topLevelValueIn = (code: Source, id: Named): Option.Option<ESTree.Node> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const node = def.node;
    if (def.type !== 'Variable' || node.type !== 'VariableDeclarator' || !node.init)
      return Option.none();
    if (node.id.type !== 'Identifier' || !topLevelConst(node)) return Option.none();
    return Option.some(unwrapped(node.init));
  });

/** The value a `const` binds `id` to, when `id`'s binding is a plain `const x = …` anywhere in scope. */
const constValueIn = (code: Source, id: Named): Option.Option<ESTree.Node> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const node = def.node;
    if (def.type !== 'Variable' || !isConst(node) || !node.init) return Option.none();
    if (node.id.type !== 'Identifier') return Option.none();
    return Option.some(node.init);
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

// The frame. A draw is handed one instant of its scene, a `Frame`
// (`canvas/film.ts`): the first parameter of a callback of the spec handed
// to `drawing(…)` that takes the frame (`draw: (f) => …`, `light: (f) =>
// …`), or a parameter whose type is film's `Frame` (imported, read off the canvas
// module imported whole, or a local alias of one: `type RoofFrame =
// Frame<…>`). Its members (`t`, `T`, `at`) are read off it (`f.t`), taken
// apart from it (`const { t } = f`, `({ t }: Frame) => …`), or named by a
// `const` holding such a read (`const now = f.t`).

/** The module film's `Frame` and `drawing` are exported from. */
export const isCanvas: Module = (from) =>
  from === '@bible/film/canvas' || /(?:^|\/)canvas\/(?:index|film)(?:\.[jt]s)?$/u.test(from);

/** The callbacks of a drawing's spec that film hands the frame (`canvas/film.ts`: `draw`, and `light` when a function). */
const FRAME_TAKERS: ReadonlyArray<string> = ['draw', 'light'];

/** How far a type or a value is followed through aliases before the reader gives up. */
const ALIAS_DEPTH = 8;

/** Whether a type as written is film's `Frame`: `Frame<…>`, `Canvas.Frame<…>`, or a local alias of one. */
const isFrameTypeIn = (code: Source, t: ESTree.Node, depth: number): boolean => {
  if (depth > ALIAS_DEPTH || t.type !== 'TSTypeReference') return false;
  const name = t.typeName;
  if (name.type === 'TSQualifiedName')
    return name.right.name === 'Frame' && importsAsIn(code, name.left, isCanvas, '*');
  if (name.type !== 'Identifier') return false;
  if (importsAsIn(code, name, isCanvas, 'Frame')) return true;
  return Option.exists(
    definitionIn(code, name),
    (def) =>
      def.node.type === 'TSTypeAliasDeclaration' &&
      isFrameTypeIn(code, def.node.typeAnnotation, depth + 1),
  );
};

/** The type a parameter is annotated with, through a default (`f: Frame = …`). */
const annotationOf = (param: ESTree.Node): Option.Option<ESTree.Node> => {
  if (param.type === 'AssignmentPattern') return annotationOf(param.left);
  if (param.type !== 'Identifier' && param.type !== 'ObjectPattern') return Option.none();
  return Option.map(Option.fromNullishOr(param.typeAnnotation), (a) => a.typeAnnotation);
};

/** Whether `fn` is the `draw` or `light` of an object literal handed to film's `drawing(…)`. */
const takesFrameOfDrawing = (code: Source, fn: ESTree.Node): boolean => {
  const property = fn.parent;
  if (property?.type !== 'Property' || property.value !== fn) return false;
  if (!Option.exists(keyName(property), (key) => FRAME_TAKERS.includes(key))) return false;
  const spec = property.parent;
  const call = spec.parent;
  return (
    call?.type === 'CallExpression' &&
    call.arguments[0] === spec &&
    callsImportIn(code, call, isCanvas, 'drawing')
  );
};

/** Whether `param`, a parameter of `fn`, is handed the frame: typed as one, or the first of a drawing's `draw` or `light`. */
const isFrameParamIn = (code: Source, fn: ESTree.Node, param: ESTree.Node): boolean =>
  Option.match(annotationOf(param), {
    onSome: (t) => isFrameTypeIn(code, t, 0),
    onNone: () =>
      (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') &&
      fn.params[0] === param &&
      takesFrameOfDrawing(code, fn),
  });

/** The parameter of `fn` that is, or defaults, the pattern or name `bound`. */
const paramHolding = (fn: ESTree.Node, bound: ESTree.Node): Option.Option<ESTree.Node> => {
  if (
    fn.type !== 'ArrowFunctionExpression' &&
    fn.type !== 'FunctionExpression' &&
    fn.type !== 'FunctionDeclaration'
  )
    return Option.none();
  return Option.fromUndefinedOr(
    fn.params.find((p) => p === bound || (p.type === 'AssignmentPattern' && p.left === bound)),
  );
};

/** Whether `node` holds the frame where it is read: a parameter handed it, or a `const` alias of one. */
const isFrameIn = (code: Source, node: ESTree.Node, depth: number): boolean => {
  const n = unwrapped(node);
  if (depth > ALIAS_DEPTH || n.type !== 'Identifier') return false;
  return Option.exists(definitionIn(code, n), (def) => {
    if (def.type === 'Parameter')
      return Option.exists(paramHolding(def.node, def.name), (p) =>
        isFrameParamIn(code, def.node, p),
      );
    return Option.exists(constValueIn(code, n), (init) => isFrameIn(code, init, depth + 1));
  });
};

/**
 * The key a name is taken apart under, and the pattern it is taken from:
 * `t` in `{ t }` or `{ t: now }` (through a default, `{ t = 0 }`).
 */
const takenApart = (
  bound: ESTree.Node,
): Option.Option<{ readonly key: string; readonly pattern: ESTree.Node }> => {
  if (bound.parent?.type === 'AssignmentPattern' && bound.parent.left === bound)
    return takenApartAs(bound.parent);
  return takenApartAs(bound);
};

/** `takenApart` for the node that stands as a property's value: the name, or its default. */
const takenApartAs = (
  holder: ESTree.Node,
): Option.Option<{ readonly key: string; readonly pattern: ESTree.Node }> => {
  const property = holder.parent;
  if (property?.type !== 'Property' || property.value !== holder) return Option.none();
  if (property.parent.type !== 'ObjectPattern') return Option.none();
  return Option.map(keyName(property), (key) => ({ key, pattern: property.parent }));
};

/**
 * The member of the frame `node` reads: `t` for `f.t`, for a `t` taken
 * apart from the frame, or for a `const` bound to such a read.
 */
const framePartIn = (code: Source, node: ESTree.Node, depth: number): Option.Option<string> => {
  const n = unwrapped(node);
  if (depth > ALIAS_DEPTH) return Option.none();
  if (n.type === 'MemberExpression')
    return Option.filter(memberName(n), () => isFrameIn(code, n.object, 0));
  if (n.type !== 'Identifier') return Option.none();
  return Option.flatMap(definitionIn(code, n), (def) => {
    if (def.type === 'Parameter')
      return Option.flatMap(takenApart(def.name), ({ key, pattern }) =>
        Option.filter(Option.some(key), () =>
          Option.exists(paramHolding(def.node, pattern), (p) => isFrameParamIn(code, def.node, p)),
        ),
      );
    const declarator = def.node;
    if (def.type !== 'Variable' || !isConst(declarator) || !declarator.init) return Option.none();
    const init = declarator.init;
    if (declarator.id.type === 'Identifier') return framePartIn(code, init, depth + 1);
    return Option.flatMap(takenApart(def.name), ({ key, pattern }) =>
      Option.filter(Option.some(key), () => pattern === declarator.id && isFrameIn(code, init, 0)),
    );
  });
};

/** `f.at(…)`: a call of the frame's `at`, read off it or taken apart from it. */
const isCueProgressIn = (code: Source, n: ESTree.Node): boolean =>
  n.type === 'CallExpression' && Option.contains(framePartIn(code, n.callee, 0), 'at');

/**
 * Whether `x` is a cue's progress: `f.at(…)`, or a name bound by `const`
 * (anywhere in scope) to one. A progress passed in as a parameter is not
 * traced.
 */
const readsCueIn = (code: Source, x: ESTree.Node): boolean => {
  const n = unwrapped(x);
  if (isCueProgressIn(code, n)) return true;
  if (n.type !== 'Identifier') return false;
  return Option.exists(constValueIn(code, n), (init) => isCueProgressIn(code, unwrapped(init)));
};

/**
 * The key `id` is taken apart under and the value it is taken from, when its
 * binding is a `const` pattern: `spawnSync` and `Bun` for `const { spawnSync }
 * = Bun`, `go` and `url` for `const { navigate: go } = url`.
 */
const takenFromIn = (
  code: Source,
  id: Named,
): Option.Option<{ readonly key: string; readonly value: ESTree.Node }> =>
  Option.flatMap(definitionIn(code, id), (def) => {
    const declarator = def.node;
    if (def.type !== 'Variable' || !isConst(declarator) || !declarator.init) return Option.none();
    const value = declarator.init;
    return Option.flatMap(
      Option.filter(takenApart(def.name), ({ pattern }) => pattern === declarator.id),
      ({ key }) => Option.some({ key, value }),
    );
  });

/** Every read of a name `node` declares (a declarator's, a function's), where it is read. */
const readsOfIn = (code: Source, node: ESTree.Node): ReadonlyArray<ESTree.Node> =>
  code.sourceCode
    .getDeclaredVariables(node)
    .flatMap((v) => v.references)
    .filter((ref) => ref.isRead())
    .map((ref): ESTree.Node => ref.identifier);

/** The modules a test is run with: `it`, `test`, `describe` and `expect` are theirs. */
const isRunner: Module = (from) => from === 'bun:test' || from === 'effect-bun-test';

/** Whether `node` is the test runner's `name`: imported from it (or an alias), or bun's global of that name. */
const isRunnerIn = (code: Source, node: ESTree.Node, name: string) =>
  importsAsIn(code, node, isRunner, name) || isGlobalIn(code, node, name);

/** What a file's bindings give a rule, each read where the name is written. */
export interface Bindings {
  /** How a name is bound: its first definition, none for a name the file binds nowhere. */
  readonly definitionOf: (id: Named) => Option.Option<Definition>;
  /** Whether a name is bound to the import of `name` (`*` the module whole, `default`) from a module `from` accepts. */
  readonly importsAs: (node: ESTree.Node, from: Module, name: string) => boolean;
  /** Whether an expression reads an export: the name imported, an alias, or `ns.name` off the module whole. */
  readonly readsImport: (node: ESTree.Node, from: Module, name: string) => boolean;
  /** Whether a call calls an export: `name(…)`, an alias, or `ns.name(…)`. */
  readonly callsImport: (node: ESTree.Node, from: Module, name: string) => boolean;
  /** Whether a name is the global `name`: written so, and bound nowhere where it is read. */
  readonly isGlobal: (node: ESTree.Node, name: string) => boolean;
  /** The member of the frame an expression reads: `t` for `f.t`, `const { t } = f` or `const now = f.t`. */
  readonly framePart: (node: ESTree.Node) => Option.Option<string>;
  /** Whether an expression is a cue's progress: `f.at(…)`, or a `const` bound to one. */
  readonly readsCue: (node: ESTree.Node) => boolean;
  /** The key a name is taken apart under and the value it is taken from: `const { key: id } = value`. */
  readonly takenFrom: (
    id: Named,
  ) => Option.Option<{ readonly key: string; readonly value: ESTree.Node }>;
  /** Every read of a name a declaration declares, where it is read. */
  readonly readsOf: (declaration: ESTree.Node) => ReadonlyArray<ESTree.Node>;
  /** Whether a name is the test runner's `name` (`it`, `test`, `expect`): its import, an alias, or bun's global. */
  readonly isRunner: (node: ESTree.Node, name: string) => boolean;
  /** The value a name holds where it is read, when its binding is a top-level const. */
  readonly valueOf: (id: Named) => Option.Option<ESTree.Node>;
  /** A number written out, or named by a top-level const holding one. */
  readonly numberOf: NumberOf;
}

/** `Bindings` over the file `code` reads. */
const bindingsIn = (code: Source): Bindings => {
  const numberOf: NumberOf = (n) => {
    if (n.type === 'Literal' && Predicate.isNumber(n.value)) return Option.some(n.value);
    if (n.type === 'Identifier') return Option.flatMap(topLevelValueIn(code, n), writtenNumber);
    return signed(n, numberOf);
  };
  return {
    definitionOf: (id) => definitionIn(code, id),
    importsAs: (node, from, name) => importsAsIn(code, node, from, name),
    readsImport: (node, from, name) => readsImportIn(code, node, from, name),
    callsImport: (node, from, name) => callsImportIn(code, node, from, name),
    isGlobal: (node, name) => isGlobalIn(code, node, name),
    framePart: (node) => framePartIn(code, node, 0),
    readsCue: (node) => readsCueIn(code, node),
    takenFrom: (id) => takenFromIn(code, id),
    readsOf: (declaration) => readsOfIn(code, declaration),
    isRunner: (node, name) => isRunnerIn(code, node, name),
    valueOf: (id) => topLevelValueIn(code, id),
    numberOf,
  };
};

/** The linted file's `Bindings`, for a rule's visitors: `const { numberOf, callsImport } = yield* bindings`. */
export const bindings: Effect.Effect<Bindings, never, RuleContext> = Effect.map(
  Effect.all([sourceCode, filename]),
  ([code, file]) => bindingsIn({ sourceCode: code, file: file.replaceAll('\\', '/') }),
);

/** `Bindings.definitionOf`, as an answer read through the rule's context. */
export const definitionOf = (id: Named) => Effect.map(bindings, (b) => b.definitionOf(id));

/** `Bindings.importsAs`, as an answer read through the rule's context. */
export const importsAs = (node: ESTree.Node, from: Module, name: string) =>
  Effect.map(bindings, (b) => b.importsAs(node, from, name));

/** `Bindings.isGlobal`, as an answer read through the rule's context. */
export const isGlobal = (node: ESTree.Node, name: string) =>
  Effect.map(bindings, (b) => b.isGlobal(node, name));

/** The module of film's clock and easing helpers: `lerp`, `clamp`, `ease`, `CLOCK_EPSILON` (`core/time.ts`). */
export const isFilmTime: Module = (from) =>
  from === '@bible/film/core' || /(?:^|\/)core\/(?:time|index)(?:\.[jt]s)?$/u.test(from);

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
