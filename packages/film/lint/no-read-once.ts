// `film/no-read-once`: a lab browser test reads the page by waiting for the
// value it asserts, never by reading once. A value read once is whatever the
// page had drawn at that instant: a status line before its update lands, a
// list before the write it shows comes back, a peak meter at the floor. That
// passes on an idle machine and fails under load (four times in passes 5 and
// 6). The shared waits are in `packages/film/src/lab/fixtures/settled.ts`
// (`textIs`, `textHas`, `valueIs`, `attributeIs`, `countIs`, …).
//
// Refused in a `*.dom.test.ts`: Playwright's one-shot reads, which are never
// DOM methods (`textContent()`, `innerText()`, `innerHTML()`, `inputValue()`,
// `allTextContents()`, `allInnerTexts()`, `isChecked()`, `isVisible()`,
// `isHidden()`, `isEnabled()`, `isDisabled()`, `isEditable()`, `$eval`,
// `$$eval`), `getAttribute()` or `count()` called on the page or a
// locator taken from it (`page.getAttribute(…)`, `page.locator(…).count()`),
// not on an element inside a function the page runs, and an `evaluate(…)`
// (the page's, or a helper of that name) whose answer `expect` asserts. An
// `evaluate` run for what it does is an action, and passes; one whose answer a
// binding keeps is not seen.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

/** Playwright methods that read the page once, and are no DOM method's name. */
const READS = new Set([
  'textContent',
  'innerText',
  'innerHTML',
  'inputValue',
  'allTextContents',
  'allInnerTexts',
  'isChecked',
  'isVisible',
  'isHidden',
  'isEnabled',
  'isDisabled',
  'isEditable',
  '$eval',
  '$$eval',
]);

/** Reads that share a DOM method's name: refused only on the page or a locator from it. */
const ON_PAGE = new Set(['getAttribute', 'count']);

/** Whether an expression is `page`, or a call chain that starts at it (`page.locator(…).first()`). */
const fromPage = (n: ESTree.Node): boolean => {
  if (n.type === 'Identifier') return n.name === 'page';
  if (n.type === 'MemberExpression') return fromPage(n.object);
  if (n.type === 'CallExpression') return fromPage(n.callee);
  return false;
};

/** The read a call makes once, when it makes one. */
const readOnce = (call: ESTree.CallExpression): Option.Option<string> => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return Option.none();
  return Option.filter(
    memberName(callee),
    (name) => READS.has(name) || (ON_PAGE.has(name) && fromPage(callee.object)),
  );
};

/** A call to `evaluate`: `page.evaluate(…)`, or a local helper by that name. */
const isEvaluate = (call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type === 'Identifier') return callee.name === 'evaluate';
  return callee.type === 'MemberExpression' && Option.contains(memberName(callee), 'evaluate');
};

const isExpect = (call: ESTree.CallExpression): boolean =>
  call.callee.type === 'Identifier' && call.callee.name === 'expect';

/** Nodes that hand the value they wrap on unchanged: `yield*`, `await`, a cast. */
const PASSES_ON = new Set([
  'YieldExpression',
  'AwaitExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ParenthesizedExpression',
]);

/**
 * Whether `expect(…)` asserts the value `n` answers, past what only hands it on
 * (`yield*`, `await`, a cast, and a call such as `Effect.promise(() => …)` that
 * takes it, or an arrow answering it, as an argument).
 */
const isAsserted = (n: ESTree.Node): boolean => {
  if (n.type === 'Program') return false;
  const up = n.parent;
  if (PASSES_ON.has(up.type)) return isAsserted(up);
  if (up.type === 'ArrowFunctionExpression')
    return up.body === n && up.parent.type === 'CallExpression' && isAsserted(up);
  if (up.type !== 'CallExpression' || !up.arguments.some((a) => a === n)) return false;
  return isExpect(up) || isAsserted(up);
};

/** What a call reads once, when it reads one. */
const refused = (call: ESTree.CallExpression): Option.Option<string> => {
  if (isEvaluate(call) && isAsserted(call)) return Option.some('evaluate');
  return readOnce(call);
};

export const noReadOnce = Rule.define({
  name: 'no-read-once',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A lab browser test waits for the value it asserts (fixtures/settled.ts); a one-shot read of the page takes whatever was drawn at that instant.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (node) =>
      Option.match(refused(node), {
        onNone: () => Effect.void,
        onSome: (name) =>
          context.report(
            Diagnostic.make({
              node,
              message: `${name} reads the page once, whatever it had drawn at that instant: wait for the value instead (textIs, textHas, valueIs, attributeIs, countIs, evaluates or until in lab/fixtures/settled.ts).`,
            }),
          ),
      }),
    );
  },
});
