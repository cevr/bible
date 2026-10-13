// `film/focus-through-focus-for`: the lab moves the focus from script only
// through `focusFor` (`packages/film/src/lab/focus.ts`), which takes the input
// that asked for the move and shows the studio's ring iff a key did. Left to
// itself, Chromium shows the ring on a script's focus whenever no mouse has
// focused anything yet (a page fresh from a link or a reload), and a focus on
// an element that already has it keeps the look it had; a call site that
// guesses the path (`focusVisible: true` because "only the keyboard gets
// here") was wrong the day a pointer reached it too. `focusFor` is the one
// reader of the input; each site hands it what it knows (a command's
// `Invocation.input`, its own event, or `Hub.input`).
//
// Refused: a call of a member named `focus` (`el.focus()`, `root?.focus(o)`,
// `root['focus']()`), and one reached through `call`, `apply` or `bind`
// (`el.focus.call(el)`), whatever its options. `focusFor` itself holds the one
// call, its disable comment naming why.
//
// Not seen (the rule reads the call, not what flows into it): `focus` reached
// through `Reflect.apply`, a name it was held under (`const f = el.focus`), a
// computed name (`el[name]()`); the other ways a page moves the focus
// (`select()`, `autofocus`, `showModal()`, a `<dialog>`'s own focus); the
// focus a test's page strings move; and anything outside the lab's sources.
// The config turns it on over `packages/film/src/lab` and off in its tests
// and fixtures.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const MESSAGE =
  'a focus moved from script past focusFor: call focusFor(el, input) (packages/film/src/lab/focus.ts) with the input that asked, so the ring shows iff a key did.';

/** Whether `node` reads a member named `name`. */
const reads = (node: ESTree.Node, name: string): boolean =>
  node.type === 'MemberExpression' && Option.contains(memberName(node), name);

/** The ways a function is called by another name: `call`, `apply`, `bind`. */
const INDIRECT = ['call', 'apply', 'bind'];

/** Whether a call moves the focus: `el.focus(…)`, or `el.focus.call(…)` and its kin. */
const movesFocus = (call: ESTree.CallExpression): boolean => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return false;
  if (reads(callee, 'focus')) return true;
  return INDIRECT.some((name) => reads(callee, name)) && reads(callee.object, 'focus');
};

export const focusThroughFocusFor = Rule.define({
  name: 'focus-through-focus-for',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A focus moved from script in the lab goes through focusFor, which shows the ring iff a key asked.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(movesFocus(node)),
        ),
      ),
    );
  },
});
