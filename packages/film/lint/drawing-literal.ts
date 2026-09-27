// `film/drawing-literal`: the lab edits a scene's cues and knobs by writing
// the literal in its source, so it must be able to find that literal. The rule
// holds the lab locator's accept rules (tools/scene-source.ts) where the scene
// is written, instead of in a test that lists the films by hand:
//
// - `drawing(…)` takes an object literal, with no spread in it;
// - its `timeline` and `knobs` are object literals, inline or a module-level
//   `const X = {…}` (seen through `as const` and `satisfies`) in the same file;
// - an object with a `timeline` and a `draw` goes through `drawing()`, or its
//   cues are untyped (`Frame<C = string>`) and the lab never sees it.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { callsNamed, keyName, programOf } from './nodes.ts';

/** The slots of a drawing the lab writes to. */
const SLOTS: ReadonlySet<string> = new Set(['timeline', 'knobs']);

/** An object literal, seen through `as const` and `satisfies`. */
const isObjectLiteral = (e: ESTree.Expression): boolean => {
  if (e.type === 'ObjectExpression') return true;
  if (e.type === 'TSAsExpression' || e.type === 'TSSatisfiesExpression')
    return isObjectLiteral(e.expression);
  return false;
};

/** A module-level statement's `const` declaration, exported or not. */
const constDeclaration = (
  s: ESTree.Program['body'][number],
): ReadonlyArray<ESTree.VariableDeclaration> => {
  if (s.type === 'VariableDeclaration' && s.kind === 'const') return [s];
  if (s.type !== 'ExportNamedDeclaration') return [];
  return Option.toArray(Option.fromNullishOr(s.declaration)).flatMap((d) => {
    if (d.type === 'VariableDeclaration' && d.kind === 'const') return [d];
    return [];
  });
};

/** Module-level `const name = {…}` bindings in `program`. */
const constObjects = (program: ESTree.Program): ReadonlySet<string> =>
  new Set(
    program.body.flatMap(constDeclaration).flatMap((decl) =>
      decl.declarations.flatMap((d) => {
        if (d.id.type !== 'Identifier') return [];
        const name = d.id.name;
        return Option.toArray(Option.fromNullishOr(d.init)).flatMap((init) => {
          if (!isObjectLiteral(init)) return [];
          return [name];
        });
      }),
    ),
  );

/** A slot's value the lab can locate: a literal, or a same-file const literal. */
const locatable = (value: ESTree.Expression): boolean => {
  if (isObjectLiteral(value)) return true;
  if (value.type !== 'Identifier') return false;
  return Option.exists(programOf(value), (program) => constObjects(program).has(value.name));
};

/** What the lab cannot locate in `drawing`'s argument. */
const argumentDefects = (arg: ESTree.Argument): ReadonlyArray<readonly [ESTree.Node, string]> => {
  if (arg.type !== 'ObjectExpression')
    return [
      [arg, 'drawing(…) takes an object literal: the lab cannot locate a scene built elsewhere.'],
    ];
  return arg.properties.flatMap((p): ReadonlyArray<readonly [ESTree.Node, string]> => {
    if (p.type === 'SpreadElement')
      return [[p, 'A spread in drawing({…}): the lab cannot prove what it would edit.']];
    const slot = Option.filter(keyName(p), (k) => SLOTS.has(k));
    if (Option.isNone(slot) || locatable(p.value)) return [];
    return [
      [
        p,
        `drawing's ${slot.value} is not an object literal or a same-file const literal: the lab cannot locate or edit it.`,
      ],
    ];
  });
};

/** What the lab cannot locate in one `drawing(…)` call: each with the node to point at. */
const drawingDefects = (
  call: ESTree.CallExpression,
): ReadonlyArray<readonly [ESTree.Node, string]> =>
  Option.match(Option.fromUndefinedOr(call.arguments[0]), {
    onNone: () => [],
    onSome: argumentDefects,
  });

/** An object with both a `timeline` and a `draw`: a scene, typed or not. */
const isScene = (node: ESTree.ObjectExpression): boolean => {
  const keys = node.properties.flatMap((p) => Option.toArray(keyName(p)));
  return keys.includes('timeline') && keys.includes('draw');
};

export const drawingLiteral = Rule.define({
  name: 'drawing-literal',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A scene's timeline and knobs are object literals the lab can find: inline in drawing({…}) or a same-file module const literal; a scene with a timeline goes through drawing().",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = ([node, message]: readonly [ESTree.Node, string]) =>
      context.report(Diagnostic.make({ node, message }));
    return Visitor.merge(
      Visitor.on('CallExpression', (node) => {
        if (!callsNamed(node, 'drawing')) return Effect.void;
        return Effect.forEach(drawingDefects(node), report, { discard: true });
      }),
      Visitor.on('ObjectExpression', (node) => {
        if (!isScene(node)) return Effect.void;
        if (callsNamed(node.parent, 'drawing')) return Effect.void;
        return report([
          node,
          'A scene with a timeline goes through drawing(), so its cues are typed and the lab can locate it.',
        ]);
      }),
    );
  },
});
