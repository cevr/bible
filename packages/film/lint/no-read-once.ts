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
// `$$eval`), and `getAttribute()` or `count()` called on the page or a
// locator taken from it (`page.getAttribute(…)`, `page.locator(…).count()`),
// not on an element inside a function the page runs.

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
      Option.match(readOnce(node), {
        onNone: () => Effect.void,
        onSome: (name) =>
          context.report(
            Diagnostic.make({
              node,
              message: `${name} reads the page once, whatever it had drawn at that instant: wait for the value instead (textIs, textHas, valueIs, attributeIs, countIs or until in lab/fixtures/settled.ts).`,
            }),
          ),
      }),
    );
  },
});
