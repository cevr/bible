// `film/focus-says-visible`: the lab moves the focus from script only with
// `focus({ focusVisible })` written at the call, so each call site says
// whether the move shows the studio's ring. Left to itself, Chromium shows it
// for a script's focus whenever no mouse has focused anything yet (a page
// fresh from a link or a reload) or the last mousedown was cancelled, so a
// mouse path (the studio holding the focus after a click on its button, its
// focus back after a kept take's reload) drew the ring as a keyboard's would.
// A keyboard path says `true`, a pointer path `false`, and a path both reach
// says which one it is by what it can see.
//
// Refused: a call of a member named `focus` (`el.focus()`, `root?.focus(o)`)
// whose first argument is not an object literal naming `focusVisible`
// (`{ preventScroll: true, focusVisible: false }`, or a spread with it
// written beside: `{ ...STAY, focusVisible: false }`). A name (`focus(STAY)`)
// is refused too: what it holds is not read at the call. The config turns it
// on over the lab's sources and off in the tests and the fixtures.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { keyName, memberName } from './nodes.ts';

const MESSAGE =
  'a focus moved from script without saying whether it shows the ring: write focus({ focusVisible }) at the call, true on a keyboard path, false on a pointer path.';

/** Whether a call's options (its first argument) name `focusVisible`: an object literal with that key. */
const saysVisible = (call: ESTree.CallExpression): boolean =>
  Option.exists(
    Option.fromUndefinedOr(call.arguments[0]),
    (options) =>
      options.type === 'ObjectExpression' &&
      options.properties.some((p) => Option.contains(keyName(p), 'focusVisible')),
  );

/** Whether a call is a focus moved from script: a member named `focus` called. */
const movesFocus = (call: ESTree.CallExpression): boolean =>
  call.callee.type === 'MemberExpression' && Option.contains(memberName(call.callee), 'focus');

export const focusSaysVisible = Rule.define({
  name: 'focus-says-visible',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A focus moved from script in the lab says at the call whether it shows the ring: focus({ focusVisible }).',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(movesFocus(node) && !saysVisible(node)),
        ),
      ),
    );
  },
});
