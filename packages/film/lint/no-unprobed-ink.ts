// `film/no-unprobed-ink`: `film check` sees ink only where the kit records it
// (`stroke`, `fill` and `cutout` in ink.ts and cutout.ts, `write` and `block`
// in type.ts). A stroke or a line of text drawn straight on the context is
// invisible to it, so it can run through a line of text and pass. A film draws
// ink through the kit, or wraps a deliberate exception (texture that never
// crosses text) in the kit's `unprobed(ctx, () => …)`, which says so where it
// is drawn.
//
// The rule reads the ink method off any object, however it is spelled:
// `ctx.stroke`, `ctx['stroke']`, `ctx.fillText.call(…)`, or destructured
// (`const { fillText } = ctx`). A namespace import (`Canvas.stroke(ctx)`) is the
// kit, not a context. The exemption is an `unprobed` imported by name (aliases
// included) or read off a namespace import, resolved through scope: a local
// function that happens to be called `unprobed` exempts nothing.
//
// Raw `fill`/`fillRect` are left out on purpose: they are backdrops and eyes,
// which cover text rather than cross it.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Scope,
  SourceCode,
  type Variable,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, memberName } from './nodes.ts';

/** The context methods that put ink on the frame as a line: a stroke or text. */
const INK: ReadonlySet<string> = new Set(['stroke', 'strokeRect', 'fillText', 'strokeText']);

/** The kit's exemption, by its exported name. */
const UNPROBED = 'unprobed';

/** How `name` is bound where `node` sits, when it is an import (`import * as X`, `import { a as X }`). */
const importBinding = (node: ESTree.Node, name: string) =>
  Effect.map(SourceCode.getScope(node), (scope) =>
    Option.filter(
      Option.flatMap(Scope.findVariableUp(scope, name), (v: Variable) =>
        Option.map(Option.fromUndefinedOr(v.defs[0]), (def) => def.node),
      ),
      (bound) => bound.type === 'ImportNamespaceSpecifier' || bound.type === 'ImportSpecifier',
    ),
  );

/** `name` is bound by `import * as name`. */
const isNamespace = (node: ESTree.Node, name: string) =>
  Effect.map(
    importBinding(node, name),
    Option.exists((i) => i.type === 'ImportNamespaceSpecifier'),
  );

/** `name` is bound by `import { unprobed }` or `import { unprobed as name }`. */
const isImportedUnprobed = (node: ESTree.Node, name: string) =>
  Effect.map(
    importBinding(node, name),
    Option.exists(
      (i) =>
        i.type === 'ImportSpecifier' &&
        i.imported.type === 'Identifier' &&
        i.imported.name === UNPROBED,
    ),
  );

/** A call to the kit's `unprobed`: `unprobed(…)`, an alias of it, or `Canvas.unprobed(…)`. */
const callsUnprobed = (node: ESTree.Node): Effect.Effect<boolean, never, RuleContext> => {
  if (node.type !== 'CallExpression') return Effect.succeed(false);
  const callee = node.callee;
  if (callee.type === 'Identifier') return isImportedUnprobed(node, callee.name);
  if (
    callee.type === 'MemberExpression' &&
    callee.object.type === 'Identifier' &&
    Option.contains(memberName(callee), UNPROBED)
  )
    return isNamespace(node, callee.object.name);
  return Effect.succeed(false);
};

/** `node` sits inside a call to the kit's `unprobed`. */
const insideUnprobed = (node: ESTree.Node) =>
  Effect.map(Effect.forEach(ancestors(node), callsUnprobed), (hits) => hits.includes(true));

/** The ink method a member expression reads (`ctx.fillText`, `ctx['stroke']`), off anything but a namespace import. */
const inkRead = (node: ESTree.MemberExpression) =>
  Option.match(
    Option.filter(memberName(node), (name) => INK.has(name)),
    {
      onNone: () => Effect.succeedNone,
      onSome: (name) => {
        if (node.object.type !== 'Identifier') return Effect.succeedSome(name);
        return Effect.map(isNamespace(node, node.object.name), (ns) =>
          Option.filter(Option.some(name), () => !ns),
        );
      },
    },
  );

/** `const { fillText } = ctx`: the ink methods an object pattern takes off its value. */
const inkTaken = (node: ESTree.ObjectPattern): ReadonlyArray<string> =>
  node.properties.flatMap((p) => {
    if (p.type !== 'Property' || p.computed || p.key.type !== 'Identifier') return [];
    if (!INK.has(p.key.name)) return [];
    return [p.key.name];
  });

const message = (name: string) =>
  `ctx.${name} bypasses the probe, so film check cannot see it cross text. Draw it with the kit's stroke/write, or wrap it in the kit's unprobed(ctx, () => …) to say it is texture.`;

export const noUnprobedInk = Rule.define({
  name: 'no-unprobed-ink',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A stroke or text drawn on the raw context is invisible to film check's probe: draw it with the kit (stroke, write, block), or wrap texture in unprobed().",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const reportUnlessUnprobed = (node: ESTree.Node, name: string) =>
      Effect.flatMap(insideUnprobed(node), (exempt) => {
        if (exempt) return Effect.void;
        return context.report(Diagnostic.make({ node, message: message(name) }));
      });
    return Visitor.merge(
      Visitor.on('MemberExpression', (node) =>
        Effect.flatMap(
          inkRead(node),
          Option.match({
            onNone: () => Effect.void,
            onSome: (name) => reportUnlessUnprobed(node, name),
          }),
        ),
      ),
      Visitor.on('ObjectPattern', (node) =>
        Effect.forEach(inkTaken(node), (name) => reportUnlessUnprobed(node, name), {
          discard: true,
        }),
      ),
    );
  },
});
