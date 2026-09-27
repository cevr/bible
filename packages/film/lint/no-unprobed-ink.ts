// `film/no-unprobed-ink`: `film check` sees ink only where the kit records it
// (`stroke`, `fill` and `cutout` in ink.ts and cutout.ts, `write` and `block`
// in type.ts). A stroke or a line of text drawn straight on the context is
// invisible to it, so it can run through a line of text and pass. A film draws
// ink through the kit, or wraps a deliberate exception (texture that never
// crosses text) in `unprobed(ctx, () => …)`, which says so where it is drawn.
//
// Raw `fill`/`fillRect` are left out on purpose: they are backdrops and eyes,
// which cover text rather than cross it.

import { Effect } from 'effect';
import { Diagnostic, Rule, RuleContext, Visitor } from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, callsNamed } from './nodes.ts';

/** The context methods that put ink on the frame as a line: a stroke or text. */
const INK: ReadonlySet<string> = new Set(['stroke', 'strokeRect', 'fillText', 'strokeText']);

export const noUnprobedInk = Rule.define({
  name: 'no-unprobed-ink',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A stroke or text drawn on the raw context is invisible to film check's probe: draw it with the kit (stroke, write, block), or wrap texture in unprobed().",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (node) => {
      const callee = node.callee;
      if (callee.type !== 'MemberExpression' || callee.computed) return Effect.void;
      if (callee.property.type !== 'Identifier' || !INK.has(callee.property.name))
        return Effect.void;
      if (ancestors(node).some((a) => callsNamed(a, 'unprobed'))) return Effect.void;
      return context.report(
        Diagnostic.make({
          node,
          message: `ctx.${callee.property.name}() bypasses the probe, so film check cannot see it cross text. Draw it with the kit's stroke/write, or wrap it in unprobed(ctx, () => …) to say it is texture.`,
        }),
      );
    });
  },
});
