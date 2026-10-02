// `film/host-events-through-adapter`: a page hears the host's navigation, key
// and drag events through its adapter, never by its own listener on the
// window or the document. A listener of its own skips what the adapter holds
// once: the typing test (a key pressed into a field is the field's), the
// drag's every ending (`pointercancel` and `lostpointercapture` as well as
// `pointerup`), the URL's batching and history policy.
//
// Refused: `window`, `document`, `globalThis` or `self` `.addEventListener`
// with a string literal naming one of those events. A property ban cannot see
// the argument, so the config's restricted names cannot; a `resize` or
// `pagehide` listener stays legitimate. The `allow` option names events a
// file may still hear directly (the URL's, in the files not yet moved onto
// `@bible/url-state`).

import { Effect, Option, Predicate, Schema } from 'effect';
import { Diagnostic, type ESTree, Rule, RuleContext } from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const URL = "use @bible/url-state's Location";
const KEYS = 'use Keys.listen (packages/film/src/browser/keys.ts)';
const DRAG = 'use Pointer.drag (packages/film/src/browser/pointer.ts)';

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

/** The host's own targets. */
const HOSTS = new Set(['window', 'document', 'globalThis', 'self']);

const Options = Schema.UndefinedOr(
  Schema.Struct({ allow: Schema.optionalKey(Schema.Array(Schema.String)) }),
);

/** The host a call listens on and the event it names: `window.addEventListener('keydown', …)`. */
const listened = (
  call: ESTree.CallExpression,
): Option.Option<{ readonly host: string; readonly event: string }> => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression' || callee.object.type !== 'Identifier')
    return Option.none();
  const host = callee.object.name;
  const first = call.arguments.at(0);
  if (
    !HOSTS.has(host) ||
    !Option.contains(memberName(callee), 'addEventListener') ||
    first?.type !== 'Literal' ||
    !Predicate.isString(first.value)
  )
    return Option.none();
  return Option.some({ host, event: first.value });
};

export const hostEventsThroughAdapter = Rule.define({
  name: 'host-events-through-adapter',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A page hears navigation, key and drag events through its adapter (Location, Keys, Pointer), never by its own listener on the window or the document.',
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
        Option.match(
          Option.flatMap(listened(call), ({ host, event }) =>
            Option.map(
              Option.filter(Option.fromUndefinedOr(THROUGH.get(event)), () => !allowed.has(event)),
              (advice) =>
                `${host}.addEventListener('${event}') hears the host directly: ${advice}.`,
            ),
          ),
          {
            onNone: () => Effect.void,
            onSome: (message) => context.report(Diagnostic.make({ node: call, message })),
          },
        ),
    };
  },
});
