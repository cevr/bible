// `film/drawing-literal`: the lab edits a scene's cues and knobs by writing
// the literal in its source, so it must be able to find that literal. The rule
// runs the lab's own locator (`unlocatable` in tools/scene-source.ts, over the
// same oxc-parser parse) and reports what it cannot locate where the scene is
// written, so the rule and the lab cannot disagree:
//
// - `drawing(…)` is called as a named import (aliases included), in a
//   module-level `export const x = drawing({…})` (or a const exported by name),
//   with an object literal and no spread in it;
// - its `timeline` and `knobs` are object literals, inline or a module-level
//   `const X = {…}` (seen through `as const` and `satisfies`), each once;
// - an object with a `timeline` and a `draw` goes through `drawing()`, or its
//   cues are untyped (`Frame<C = string>`) and the lab never sees it.
//
// A drawing built inside a function is not located, which is also why a local
// variable cannot shadow the const a slot names: a module-level slot sees only
// module-level bindings.

import { Effect, Result } from 'effect';
import { Diagnostic, Rule, RuleContext, Visitor } from 'oxlint-plugin-effect/rule-bindings';
import { parseModule, unlocatable } from '../src/tools/scene-source.ts';

export const drawingLiteral = Rule.define({
  name: 'drawing-literal',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A scene's timeline and knobs are object literals the lab can find: an exported module-level drawing({…}) with inline or same-file module const literals; a scene with a timeline goes through drawing().",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const source = context.sourceCode.text;
    return Visitor.on('Program', () =>
      Result.match(parseModule(context.filename, source), {
        // oxlint reports a module that does not parse itself.
        onFailure: () => Effect.void,
        onSuccess: (program) =>
          Effect.forEach(
            unlocatable(source, program),
            ({ start, end, reason }) =>
              context.report(Diagnostic.make({ node: { range: [start, end] }, message: reason })),
            { discard: true },
          ),
      }),
    );
  },
});
