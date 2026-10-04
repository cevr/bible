// `film/keys-through-keymap`: a page's keys and its context menus are its
// commands' (packages/film/src/command/), never a listener of its own. A key
// listener of its own skips the keymap: the viewer's rebinding, the focus
// rule (a field's keys are the field's, the studio owns its own), the `?`
// sheet and ⌘K that list every key; a `contextmenu` listener of its own
// skips the long press a phone opens the same menu with.
//
// Refused: a JSX `onKeyDown`, `onKeyUp`, `onKeyPress` or `onContextMenu`
// attribute (and their `on:` and lowercase forms), and an
// `.addEventListener` naming `keydown`, `keyup`, `keypress` or `contextmenu`
// on any target but the host's own (`window`, `document`: those key events
// are `film/host-events-through-adapter`'s; their `contextmenu` is this
// rule's). The config turns it off where the keymap and the menus are made:
// the `Keys` adapter and `src/lab/command/`.

import { Effect, Option, Predicate } from 'effect';
import { Diagnostic, type ESTree, Rule, RuleContext } from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const KEYS =
  'declare a command with its keys (packages/film/src/command/command.ts), registered with the page hub';
const MENU =
  'open a context menu through @bible/ui ContextMenu over the selection’s commands (packages/film/src/lab/command/)';

/** Each listener the rule refuses, by its event, and the way instead. */
const EVENTS: ReadonlyMap<string, string> = new Map([
  ['keydown', KEYS],
  ['keyup', KEYS],
  ['keypress', KEYS],
  ['contextmenu', MENU],
]);

/** The host's own targets: their key events are another rule's. */
const HOSTS = new Set(['window', 'document', 'globalThis', 'self']);

/** A JSX attribute's name as written: `onKeyDown`, or `on:keydown` for a namespaced one. */
const attrName = (attr: ESTree.JSXAttribute): string => {
  if (attr.name.type === 'JSXNamespacedName')
    return `${attr.name.namespace.name}:${attr.name.name.name}`;
  return attr.name.name;
};

/** The event a JSX handler attribute names (`onKeyDown`, `on:keydown`, `onkeydown`), if any. */
const handled = (attr: ESTree.JSXAttribute): Option.Option<string> => {
  const lower = attrName(attr).toLowerCase();
  return Option.liftPredicate(
    lower.replace(/^on:?/, ''),
    (event) => lower.startsWith('on') && EVENTS.has(event),
  );
};

/** The event an `.addEventListener` call names on a target not the host's, or `contextmenu` on the host's. */
const listened = (call: ESTree.CallExpression): Option.Option<string> => {
  const callee = call.callee;
  const first = call.arguments.at(0);
  if (
    callee.type !== 'MemberExpression' ||
    !Option.contains(memberName(callee), 'addEventListener') ||
    first?.type !== 'Literal' ||
    !Predicate.isString(first.value) ||
    !EVENTS.has(first.value)
  )
    return Option.none();
  const onHost = callee.object.type === 'Identifier' && HOSTS.has(callee.object.name);
  return Option.liftPredicate(first.value, (event) => !onHost || event === 'contextmenu');
};

export const keysThroughKeymap = Rule.define({
  name: 'keys-through-keymap',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A page's keys and context menus are its commands', never a key or contextmenu listener of its own.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, event: string, form: string) =>
      context.report(
        Diagnostic.make({
          node,
          message: `${form} hears ${event} on its own: ${EVENTS.get(event) ?? KEYS}.`,
        }),
      );
    return {
      JSXAttribute: (attr: ESTree.JSXAttribute) =>
        Option.match(handled(attr), {
          onNone: () => Effect.void,
          onSome: (event) => report(attr, event, 'a JSX handler'),
        }),
      CallExpression: (call: ESTree.CallExpression) =>
        Option.match(listened(call), {
          onNone: () => Effect.void,
          onSome: (event) => report(call, event, 'addEventListener'),
        }),
    };
  },
});
