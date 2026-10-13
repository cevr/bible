// `film/pages-in-case-scope`: a browser test opens its pages in the case's
// scope, or in a child of it (`Scope.fork`), never in a scope it makes by
// hand (`Scope.make`). A page goes back to its process only when its scope
// closes (`lab/fixtures/browsers.ts`, `lease.ts`), and the case's scope is
// the one its runner closes whatever the case did: a scope made by hand is
// closed only where the case says so, so a step that fails before then keeps
// the page open. The next case in the process that sends touches then dies
// on "another tab was open" (`lab/fixtures/tab.ts`), blaming itself; under
// `--no-isolate` that is the next file's too.
//
// `Scope.make` is effect's, read off `Scope` imported from `effect` (or an
// alias), or `effect/Scope` imported whole. The config turns it on over
// `packages/film/e2e`.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, memberName, type Module } from './nodes.ts';

const MESSAGE =
  "a scope made by hand in a browser test: a step that fails before it is closed keeps its page open, and the process's next touching case dies. Open the page in the case's scope, or in Scope.fork(yield* Effect.scope) to close it early.";

const isEffect: Module = (from) => from === 'effect';
const isScope: Module = (from) => from === 'effect/Scope';

/** Whether `node` is effect's `Scope` module. */
const isScopeModule = (b: Bindings, node: ESTree.Node) =>
  b.readsImport(node, isEffect, 'Scope') || b.importsAs(node, isScope, '*');

/** Whether a call makes a scope with no parent: `Scope.make(…)`. */
const makesScope = (b: Bindings, call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  return (
    callee.type === 'MemberExpression' &&
    Option.contains(memberName(callee), 'make') &&
    isScopeModule(b, callee.object)
  );
};

export const pagesInCaseScope = Rule.define({
  name: 'pages-in-case-scope',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A browser test opens its pages in the case's scope or a child of it, so a failing step still gives the page back.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(makesScope(b, node)),
        ),
      ),
    );
  },
});
