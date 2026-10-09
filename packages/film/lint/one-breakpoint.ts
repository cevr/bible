// `film/one-breakpoint`: the studio has one breakpoint, a phone's widest
// window, and one owner of it (`packages/film/src/lab/viewport.ts`: `PHONE`,
// `WIDE`). A style written in TypeScript asks the window through those two,
// so the width is declared once; refused is a media query width written out
// in a string or a template (`(max-width: 899px)`, `(min-width: 900px )`,
// `(width >= 900px)`),
// where a change of the breakpoint would leave it behind. A feature query's
// condition (`@supports (width: 900px)`) asks whether a declaration parses,
// not how wide the window is, and passes. The owner itself
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

/** A length written out: `900px`, `56.25em`. */
const LENGTH = String.raw`\d+(?:\.\d+)?(?:px|em|rem)`;

/** A range comparison: `<`, `<=`, `>`, `>=`, `=`. */
const COMPARED = String.raw`(?:[<>]=?|=)`;

/**
 * A media query's width written out, with any whitespace CSS allows: the
 * colon form (`(max-width: 899px)`, `( min-width:900px )`, `(width: 900px)`)
 * and the range form (`(width >= 900px)`, `(900px <= width)`,
 * `(400px < width <= 899px)`).
 */
const WIDTH = new RegExp(
  [
    String.raw`\(\s*(?:max-|min-)?width\s*:\s*${LENGTH}\s*\)`,
    String.raw`\(\s*width\s*${COMPARED}\s*${LENGTH}\s*\)`,
    String.raw`\(\s*${LENGTH}\s*${COMPARED}\s*width(?:\s*${COMPARED}\s*${LENGTH})?\s*\)`,
  ].join('|'),
  'g',
);

/**
 * Whether the condition at `at` in `text` is a feature query's: its clause
 * (back to the last `{`, `}` or `;`) opens with `@supports`, which asks
 * whether a declaration parses (`(width: 900px)`), not how wide the window is.
 */
const inSupports = (text: string, at: number) => {
  const before = text.slice(0, at);
  const clause = before.slice(Math.max(...['{', '}', ';'].map((c) => before.lastIndexOf(c))) + 1);
  return /@supports\b/u.test(clause);
};

/** Whether `text` writes a media query's width out: a width condition outside every `@supports`. */
const writesWidth = (text: string) =>
  Array.from(text.matchAll(WIDTH)).some((m) => !inSupports(text, m.index));

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
          Effect.succeed(writesWidth(text)),
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
