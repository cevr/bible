// `film/two-fingers-serial`: a browser test that puts a second finger down
// (`page.finger.second`, `lab/fixtures/tab.ts`) runs alone, as `test.serial`.
// While two fingers are down on one tab, Chrome drops the touches a file's
// other cases send their own tabs at the same time, and a `.dom.test.ts`
// file's cases run at once (`concurrentTestGlob`, `bunfig.toml`): the
// sibling's press never lands, and one of the two fails by turns. So
// `finger.second` may be read only inside the body of a `test.serial(…)`.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, memberName } from './nodes.ts';

/** `<x>.finger.second`: the second finger of a tab. */
const isSecondFinger = (n: ESTree.MemberExpression) =>
  Option.contains(memberName(n), 'second') &&
  n.object.type === 'MemberExpression' &&
  Option.contains(memberName(n.object), 'finger');

/** A call to `test.serial(…)`. */
const isSerialTest = (n: ESTree.Node) =>
  n.type === 'CallExpression' &&
  n.callee.type === 'MemberExpression' &&
  n.callee.object.type === 'Identifier' &&
  n.callee.object.name === 'test' &&
  Option.contains(memberName(n.callee), 'serial');

export const twoFingersSerial = Rule.define({
  name: 'two-fingers-serial',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A test that puts a second finger down runs alone: Chrome drops a sibling tab's touches while two fingers are down.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('MemberExpression', (node) => {
      if (!isSecondFinger(node) || ancestors(node).some(isSerialTest)) return Effect.void;
      return context.report(
        Diagnostic.make({
          node,
          message:
            "a second finger outside test.serial: while two fingers are down Chrome drops the touches the file's other cases send their own tabs at the same time. Run this case as test.serial.",
        }),
      );
    });
  },
});
