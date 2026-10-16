// `film/synth-own-math`: the sound graph (packages/film/src/core/synth/graph)
// makes the same samples on every host by construction. A host's Math.sin,
// exp, log, pow and tanh are approximations its engine chooses, so two hosts
// (Bun on macOS, Bun on Linux) may round them apart; + − × ÷ and sqrt are
// correctly rounded everywhere (IEEE 754), and so are Math's rounding, sign
// and comparison members and its constants. The graph's transcendentals are
// its own (graph/math.ts), built from those alone.
//
// Refused in the files the config governs: a read of the global `Math` other
// than a member it lets through by name (`Math.floor` passes; `Math.sin`,
// `Math[name]`, `Math` handed on or taken apart, and `globalThis.Math` do
// not); `**` and `**=`, the host's pow; and a value imported or re-exported
// from a module of the repo outside the graph's folder but the seeded
// generator (core/random.ts), from a package but `effect`'s `Predicate`,
// `Schema` and `Match` by name, or by a dynamic `import(…)` of one, so no
// helper brings the host's maths in. A type imported from anywhere is no
// code, and passes.

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, memberName, staticName } from './nodes.ts';

/** The members of `Math` every host gives the same: rounding, sign, comparison, sqrt, the constants. */
const EXACT: ReadonlySet<string> = new Set([
  'abs',
  'ceil',
  'floor',
  'round',
  'trunc',
  'sign',
  'min',
  'max',
  'sqrt',
  'fround',
  'imul',
  'clz32',
  'PI',
  'E',
  'LN2',
  'LN10',
  'LOG2E',
  'LOG10E',
  'SQRT1_2',
  'SQRT2',
]);

/** The globals `Math` can be read off: `globalThis.Math`. */
const HOLDERS: ReadonlyArray<string> = ['globalThis', 'window', 'self', 'global'];

/** A module of the graph's folder, and the seeded generator beside it. */
const GRAPH = /\/core\/synth\/graph\//u;
const RANDOM = /\/core\/random(?:\.[jt]s)?$/u;

/** What `effect` gives the graph to run: its guards, its schemas and its matcher, no maths. */
const EFFECT_NAMES: ReadonlySet<string> = new Set(['Match', 'Predicate', 'Schema']);

const MATH_MESSAGE =
  "a host's Math in the sound graph: its sin, exp, log, pow and tanh round apart between hosts. Use the graph's own (packages/film/src/core/synth/graph/math.ts: sinTurn, cosTurn, exp, exp2, log, tanh, dbToGain); of Math, read only abs, ceil, floor, round, trunc, sign, min, max, sqrt, fround, imul, clz32 and the constants, by name.";

const POW_MESSAGE =
  "`**` is the host's pow, which rounds apart between hosts: write the product out, or use exp2, or exp and log, from packages/film/src/core/synth/graph/math.ts.";

const IMPORT_MESSAGE =
  "code from outside the sound graph, which may compute with the host's Math: import values from packages/film/src/core/synth/graph/ or core/random.ts, and from effect only Predicate, Schema and Match by name; a type import passes.";

/** Whether `id` is a name written as a key, not read: `x.Math`, `{ Math: 1 }`, a class's or a type's member. */
const isKey = (id: ESTree.Node): boolean => {
  const parent = id.parent;
  if (parent?.type === 'MemberExpression') return parent.property === id && !parent.computed;
  if (parent?.type === 'Property')
    return parent.key === id && !parent.computed && !parent.shorthand;
  if (
    parent?.type === 'PropertyDefinition' ||
    parent?.type === 'MethodDefinition' ||
    parent?.type === 'TSPropertySignature'
  )
    return parent.key === id && !parent.computed;
  return false;
};

/** Whether `id` is read for a member of `Math` every host gives the same: `Math.floor`, `Math['PI']`. */
const readsExact = (id: ESTree.Node): boolean => {
  const parent = id.parent;
  return (
    parent?.type === 'MemberExpression' &&
    parent.object === id &&
    Option.exists(memberName(parent), (name) => EXACT.has(name))
  );
};

/** Whether `id` reads the global `Math` for anything but an exact member. */
const readsHostMath = (b: Bindings, id: ESTree.Node): boolean =>
  b.isGlobal(id, 'Math') && !isKey(id) && !readsExact(id);

/** Whether a member expression reads `Math` off a global that holds it: `globalThis.Math`. */
const readsHeldMath = (b: Bindings, node: ESTree.MemberExpression): boolean =>
  Option.contains(memberName(node), 'Math') &&
  HOLDERS.some((holder) => b.isGlobal(node.object, holder));

/** Whether `from` may give the graph code to run: the graph's own modules, the seeded generator, or effect's `names`. */
const mayRun = (
  b: Bindings,
  from: string,
  names: Option.Option<ReadonlyArray<string>>,
): boolean => {
  if (from.startsWith('./') || from.startsWith('../')) {
    const module = b.moduleOf(from);
    return GRAPH.test(module) || RANDOM.test(module);
  }
  return (
    from === 'effect' &&
    Option.exists(names, (given) => given.length > 0 && given.every((n) => EFFECT_NAMES.has(n)))
  );
};

/** The names of the values an import takes by name; none when it takes the module whole or its default. */
const importedValues = (node: ESTree.ImportDeclaration): Option.Option<ReadonlyArray<string>> => {
  const names: Array<string> = [];
  for (const s of node.specifiers) {
    if (s.type !== 'ImportSpecifier') return Option.none();
    if (s.importKind !== 'type') names.push(...Option.toArray(staticName(s.imported, false)));
  }
  return Option.some(names);
};

/** Whether an import runs code: it takes a value, or nothing (an import for its effects). */
const importRuns = (node: ESTree.ImportDeclaration): boolean =>
  node.importKind !== 'type' &&
  (node.specifiers.length === 0 ||
    node.specifiers.some((s) => s.type !== 'ImportSpecifier' || s.importKind !== 'type'));

/** The values a re-export hands on, by the name it reads them under. */
const exportedValues = (node: ESTree.ExportNamedDeclaration): ReadonlyArray<string> =>
  node.specifiers
    .filter((s) => s.exportKind !== 'type')
    .flatMap((s) => Option.toArray(staticName(s.local, false)));

/** The text of a module specifier written as a string. */
const specifier = (source: ESTree.Node): Option.Option<string> => {
  if (source.type !== 'Literal') return Option.none();
  return Option.liftPredicate(source.value, Predicate.isString);
};

export const synthOwnMath = Rule.define({
  name: 'synth-own-math',
  meta: Rule.meta({
    type: 'problem',
    description:
      "The sound graph computes with its own transcendentals (graph/math.ts), never the host's Math, `**` or a helper from outside it, so its samples are the same on every host.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    const report = (node: ESTree.Node, message: string, refused: boolean) =>
      Effect.asVoid(
        Effect.when(context.report(Diagnostic.make({ node, message })), Effect.succeed(refused)),
      );
    /** `node` refused when it runs code that `from` may not give the graph. */
    const runsFrom = (
      node: ESTree.Node,
      runs: boolean,
      from: Option.Option<string>,
      names: Option.Option<ReadonlyArray<string>>,
    ) => report(node, IMPORT_MESSAGE, runs && !Option.exists(from, (f) => mayRun(b, f, names)));
    return Visitor.merge(
      Visitor.merge(
        Visitor.on('Identifier', (id) => report(id, MATH_MESSAGE, readsHostMath(b, id))),
        Visitor.on('MemberExpression', (node) =>
          report(node, MATH_MESSAGE, readsHeldMath(b, node)),
        ),
      ),
      Visitor.merge(
        Visitor.merge(
          Visitor.on('BinaryExpression', (node) =>
            report(node, POW_MESSAGE, node.operator === '**'),
          ),
          Visitor.on('AssignmentExpression', (node) =>
            report(node, POW_MESSAGE, node.operator === '**='),
          ),
        ),
        Visitor.merge(
          Visitor.merge(
            Visitor.on('ImportDeclaration', (node) =>
              runsFrom(node, importRuns(node), specifier(node.source), importedValues(node)),
            ),
            Visitor.on('ImportExpression', (node) =>
              runsFrom(node, true, specifier(node.source), Option.none()),
            ),
          ),
          Visitor.merge(
            Visitor.on('ExportNamedDeclaration', (node) => {
              const from = Option.flatMap(Option.fromNullOr(node.source), specifier);
              const names = exportedValues(node);
              const runs = Option.isSome(from) && node.exportKind !== 'type' && names.length > 0;
              return runsFrom(node, runs, from, Option.some(names));
            }),
            Visitor.on('ExportAllDeclaration', (node) =>
              runsFrom(node, node.exportKind !== 'type', specifier(node.source), Option.none()),
            ),
          ),
        ),
      ),
    );
  },
});
