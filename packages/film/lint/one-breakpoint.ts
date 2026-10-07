// `film/one-breakpoint`: the studio has one breakpoint, a phone's widest
// window, and one owner of it (`packages/film/src/lab/viewport.ts`: `PHONE`,
// `WIDE`). A style written in TypeScript asks the window through those two,
// so the width is declared once; refused is a media query width written out
// in a string or a template (`(max-width: 899px)`, `(min-width: 900px)`),
// where a change of the breakpoint would leave it behind. The owner itself
// builds both from one number, so it writes no width out. The stylesheets that
// cannot import the owner (`player.css`, `tokens.css`) are held to its value
// by `lab/viewport.test.ts`.

import { Effect, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

/** A media query's width written out: `(max-width: 899px)`, `(min-width:900px)`. */
const WIDTH = /\((?:max|min)-width:\s*\d+(?:\.\d+)?px\)/;

const MESSAGE =
  "a breakpoint written out: ask the studio's one breakpoint through PHONE or WIDE (packages/film/src/lab/viewport.ts), so the width is declared once.";

export const oneBreakpoint = Rule.define({
  name: 'one-breakpoint',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A style in TypeScript asks the window through the studio's one breakpoint (PHONE, WIDE in lab/viewport.ts), never a width written out.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, text: string) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(WIDTH.test(text)),
        ),
      );
    return Visitor.merge(
      Visitor.on('Literal', (node) => {
        if (!Predicate.isString(node.value)) return Effect.void;
        return report(node, node.value);
      }),
      Visitor.on('TemplateElement', (node) => report(node, node.value.cooked ?? node.value.raw)),
    );
  },
});
