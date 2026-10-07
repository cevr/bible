// `film/host-events-through-adapter`: a page hears the host's navigation, key
// and drag events through its adapter, never by its own listener on the
// window or the document, and a press is held and ended by `Pointer.press`
// alone, whatever it was pressed on. A listener of its own skips what the
// adapter holds once: the typing test (a key pressed into a field is the
// field's), the drag's every ending (`pointercancel` and
// `lostpointercapture` as well as `pointerup`) and its one owner per press,
// the URL's batching and history policy.
//
// Refused: `window`, `document`, `globalThis` or `self` `.addEventListener`
// with a string literal naming one of those events; on any receiver, a
// listener for an event that ends a press (`pointerup`, `pointercancel`,
// `lostpointercapture`), and a pointer's capture taken or let go
// (`setPointerCapture`, `releasePointerCapture`). A property ban cannot see
// the argument, so the config's restricted names cannot; a `resize` or
// `pagehide` listener stays legitimate, and so do an element's own press
// (`pointerdown`), hover and moves. The `allow` option names events a file
// may still hear directly (the key and drag events in `@bible/url-state` and
// egw-search, which have no film adapters). The Pointer adapter
// (`browser/pointer.ts`) says at each of its own lines that it is the one.

import { Effect, Option, Predicate, Schema } from 'effect';
import { Diagnostic, type ESTree, Rule, RuleContext } from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const URL = "use @bible/url-state's Location";
const KEYS = 'use Keys.listen (packages/film/src/browser/keys.ts)';
const DRAG = 'use Pointer.press (packages/film/src/browser/pointer.ts)';

/** Each event a page hears through an adapter, and the adapter. */
const THROUGH: ReadonlyMap<string, string> = new Map([
  ['popstate', URL],
  ['hashchange', URL],
  ['keydown', KEYS],
  ['keyup', KEYS],
  ['pointermove', DRAG],
  ['pointerup', DRAG],
  ['pointercancel', DRAG],
  ['lostpointercapture', DRAG],
]);

/** The events that end a press: its owner's alone, on any receiver. */
const ENDS_A_PRESS = new Set(['pointerup', 'pointercancel', 'lostpointercapture']);

/** The calls that hold or let go of a press: its owner's alone. */
const CAPTURES = new Set(['setPointerCapture', 'releasePointerCapture']);

/** The host's own targets. */
const HOSTS = new Set(['window', 'document', 'globalThis', 'self']);

const Options = Schema.UndefinedOr(
  Schema.Struct({ allow: Schema.optionalKey(Schema.Array(Schema.String)) }),
);

/** A receiver as the message names it: `el`, `document.body`, else `an element`. */
const receiverText = (node: ESTree.Node): string => {
  if (node.type === 'Identifier') return node.name;
  if (node.type !== 'MemberExpression') return 'an element';
  return Option.match(memberName(node), {
    onNone: () => 'an element',
    onSome: (name) => `${receiverText(node.object)}.${name}`,
  });
};

/** A call's receiver and the method it calls: `el.addEventListener(…)`. */
const called = (
  call: ESTree.CallExpression,
): Option.Option<{ readonly receiver: ESTree.Node; readonly method: string }> => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return Option.none();
  return Option.map(memberName(callee), (method) => ({ receiver: callee.object, method }));
};

/** What `call` does that a page must leave to an adapter, in words: none when it is the page's own. */
const refusal = (
  call: ESTree.CallExpression,
  allowed: ReadonlySet<string>,
): Option.Option<string> =>
  Option.flatMap(called(call), ({ receiver, method }) => {
    const who = receiverText(receiver);
    if (CAPTURES.has(method))
      return Option.some(`${who}.${method} holds a press outside its owner: ${DRAG}.`);
    const first = call.arguments.at(0);
    if (
      method !== 'addEventListener' ||
      first?.type !== 'Literal' ||
      !Predicate.isString(first.value)
    )
      return Option.none();
    const event = first.value;
    const onHost = receiver.type === 'Identifier' && HOSTS.has(receiver.name);
    if (allowed.has(event) || (!onHost && !ENDS_A_PRESS.has(event))) return Option.none();
    return Option.map(Option.fromUndefinedOr(THROUGH.get(event)), (advice) => {
      if (onHost) return `${who}.addEventListener('${event}') hears the host directly: ${advice}.`;
      return `${who}.addEventListener('${event}') ends a press outside its owner: ${advice}.`;
    });
  });

export const hostEventsThroughAdapter = Rule.define({
  name: 'host-events-through-adapter',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A page hears navigation, key and drag events through its adapter (Location, Keys, Pointer), never by its own listener on the window or the document, and a press is held and ended by Pointer.press alone.',
    schema: [
      {
        type: 'object',
        properties: { allow: { type: 'array', items: { type: 'string' } } },
        additionalProperties: false,
      },
    ],
  }),
  options: Options,
  create: function* (options) {
    const context = yield* RuleContext;
    const allowed = new Set(options?.allow ?? []);
    return {
      CallExpression: (call: ESTree.CallExpression) =>
        Option.match(refusal(call, allowed), {
          onNone: () => Effect.void,
          onSome: (message) => context.report(Diagnostic.make({ node: call, message })),
        }),
    };
  },
});
