// `film/host-events-through-adapter`: a page hears the host's navigation, key
// and drag events through its adapter, never by its own listener on the
// window or the document, and a press is held and ended by `Pointer.press`
// alone, whatever it was pressed on. A listener of its own skips what the
// adapter holds once: the typing test (a key pressed into a field is the
// field's), the drag's every ending (`pointercancel` and
// `lostpointercapture` as well as `pointerup`) and its one owner per press,
// the URL's batching and history policy.
//
// Refused, on the host (`window`, `document`, `globalThis`, `self`, a const
// bound to one, `document.defaultView`, a hop such as `window.top`, and the
// global object itself, which a bare `addEventListener(…)` or
// `onkeydown = …` reaches): a listener for one of those events, added by
// `addEventListener`, by `EventTarget.prototype.addEventListener.call(…)`
// (or `.apply`), or set as its handler property (`window.onpopstate = …`);
// and a listener whose event the rule cannot read (a parameter, a computed
// string), since it may be any of them. On any receiver: a listener for an
// event that ends a press (`pointerup`, `pointercancel`,
// `lostpointercapture`), in any of those forms or as a JSX handler
// (`onPointerUp`, `on:pointerup`), and a pointer's capture taken or let go
// (`setPointerCapture`, `releasePointerCapture`, called or `.call`ed). An
// event is read when it is written as a string, as a template with no
// values, as a const bound to one, or as the variable of a loop over an
// array of them. A property ban cannot see the argument, so the config's
// restricted names cannot; a `resize` or `pagehide` listener stays
// legitimate, and so do an element's own press (`pointerdown`), hover and
// moves. The `allow` option names events a file may still hear directly
// (the key and drag events in `@bible/url-state` and egw-search, which have
// no film adapters). The adapters (`browser/*-browser.ts`) say at each of
// their own lines that they are the one. A source pattern is an early
// warning: the e2e harness checks the same in the browser, whatever the
// spelling (`lab/fixtures/host-reach.ts`).

import { Effect, Option, Predicate, Schema } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Scope,
  SourceCode,
  type Variable,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
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

/**
 * The names the global object reaches itself, its document, or the document's
 * body and root element by: the body hears the window's navigation, and every
 * key bubbles to it.
 */
const HOPS = new Set([
  'window',
  'self',
  'globalThis',
  'top',
  'parent',
  'frames',
  'document',
  'body',
  'documentElement',
]);

const Options = Schema.UndefinedOr(
  Schema.Struct({ allow: Schema.optionalKey(Schema.Array(Schema.String)) }),
);

/** What a rule's read of the events answers: the events, or none when it cannot read them. */
type Events = Option.Option<ReadonlyArray<string>>;

/** A receiver as the message names it: `el`, `document.body`, else `an element`. */
const receiverText = (node: ESTree.Node): string => {
  if (node.type === 'Identifier') return node.name;
  if (node.type !== 'MemberExpression') return 'an element';
  return Option.match(memberName(node), {
    onNone: () => 'an element',
    onSome: (name) => `${receiverText(node.object)}.${name}`,
  });
};

/** A member as a message writes it: `el.name`, or the bare `name` the global object's is written as. */
const whoOf = (receiver: Option.Option<ESTree.Node>) => (name: string) =>
  Option.match(receiver, {
    onNone: () => name,
    onSome: (r) => `${receiverText(r)}.${name}`,
  });

/** The declarator a name is bound by, where `at` sits: none for a name the file never declares. */
const binding = (at: ESTree.Node, name: string) =>
  Effect.map(SourceCode.getScope(at), (scope) =>
    Option.map(
      Option.flatMap(Scope.findVariableUp(scope, name), (v: Variable) =>
        Option.fromUndefinedOr(v.defs[0]),
      ),
      (def) => def.node,
    ),
  );

/** Whether a name, where `at` sits, is the global's: declared nowhere in the file. */
const isGlobal = (at: ESTree.Node, name: string) => Effect.map(binding(at, name), Option.isNone);

/** The value a `const` declarator binds. */
const constInit = (node: ESTree.Node): Option.Option<ESTree.Node> => {
  if (node.type !== 'VariableDeclarator' || node.parent.type !== 'VariableDeclaration')
    return Option.none();
  if (node.parent.kind !== 'const') return Option.none();
  return Option.fromNullOr(node.init);
};

/** A string written out: a literal, or a template with no values. */
const writtenString = (node: ESTree.Node): Option.Option<string> => {
  if (node.type === 'Literal' && Predicate.isString(node.value)) return Option.some(node.value);
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
    return Option.fromNullishOr(node.quasis[0]?.value.cooked);
  return Option.none();
};

/** The strings an array literal holds, when it holds nothing else. */
const stringsOf = (node: ESTree.Node): Events => {
  if (node.type !== 'ArrayExpression') return Option.none();
  const out: Array<string> = [];
  for (const element of node.elements) {
    const text = Option.flatMap(Option.fromNullOr(element), writtenString);
    if (Option.isNone(text)) return Option.none();
    out.push(text.value);
  }
  return Option.some(out);
};

/** The events a loop's variable takes, when `declarator` is a `for…of` over an array of strings. */
const loopedOver = (declarator: ESTree.Node): Option.Option<Events> =>
  Option.flatMap(Option.fromNullOr(declarator.parent), (declaration) =>
    Option.flatMap(Option.fromNullOr(declaration.parent), (loop) => {
      if (loop.type !== 'ForOfStatement' || loop.left !== declaration) return Option.none();
      return Option.some(stringsOf(loop.right));
    }),
  );

/**
 * The events an expression names: a string written out, a const bound to
 * one, or the variable of a `for…of` over an array of them; none when the
 * rule cannot read it.
 */
const eventsNamed = (node: ESTree.Node): Effect.Effect<Events, never, RuleContext> => {
  const written = writtenString(node);
  if (Option.isSome(written)) return Effect.succeedSome([written.value]);
  if (node.type !== 'Identifier') return Effect.succeedNone;
  return Effect.flatMap(binding(node, node.name), (declarator) =>
    Option.match(declarator, {
      onNone: () => Effect.succeedNone,
      onSome: (d) =>
        Option.match(loopedOver(d), {
          onSome: Effect.succeed,
          onNone: () =>
            Option.match(constInit(d), {
              onNone: () => Effect.succeedNone,
              onSome: eventsNamed,
            }),
        }),
    }),
  );
};

/** Whether an expression is the host: a host's name, a const bound to one, or a hop from one. */
const isHost = (node: ESTree.Node): Effect.Effect<boolean, never, RuleContext> => {
  if (node.type === 'ChainExpression') return isHost(node.expression);
  if (node.type === 'MemberExpression')
    return Option.match(memberName(node), {
      onNone: () => Effect.succeed(false),
      onSome: (name) => {
        if (name === 'defaultView') return Effect.succeed(true);
        if (!HOPS.has(name)) return Effect.succeed(false);
        return isHost(node.object);
      },
    });
  if (node.type !== 'Identifier') return Effect.succeed(false);
  return Effect.flatMap(binding(node, node.name), (declarator) =>
    Option.match(declarator, {
      onNone: () => Effect.succeed(HOSTS.has(node.name)),
      onSome: (d) =>
        Option.match(constInit(d), { onNone: () => Effect.succeed(false), onSome: isHost }),
    }),
  );
};

/** Whether a receiver is the host: none is the global object itself. */
const onHost = (receiver: Option.Option<ESTree.Node>) =>
  Option.match(receiver, { onNone: () => Effect.succeed(true), onSome: isHost });

/** A listener: on whom, the events it hears, and how a message spells it for an event. */
interface Listening {
  readonly receiver: Option.Option<ESTree.Node>;
  readonly events: Effect.Effect<Events, never, RuleContext>;
  readonly spelled: (event: string) => string;
  readonly unread: string;
}

/** Why a listener is an adapter's, in words: none when it is the page's own. */
const listenRefusal = (listening: Listening, allowed: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const host = yield* onHost(listening.receiver);
    const events = yield* listening.events;
    if (Option.isNone(events)) {
      if (!host) return Option.none<string>();
      return Option.some(
        `${listening.unread} hears the host with an event this rule cannot read, so it may be one an adapter owns: write the event out, and hear navigation, keys and drags through Location, Keys or Pointer.`,
      );
    }
    const refused = events.value.filter(
      (event) => !allowed.has(event) && THROUGH.has(event) && (host || ENDS_A_PRESS.has(event)),
    );
    return Option.flatMap(Option.fromUndefinedOr(refused[0]), (event) =>
      Option.map(Option.fromUndefinedOr(THROUGH.get(event)), (advice) => {
        if (host) return `${listening.spelled(event)} hears the host directly: ${advice}.`;
        return `${listening.spelled(event)} ends a press outside its owner: ${advice}.`;
      }),
    );
  });

/** The method a callee borrows through `.call` or `.apply`: `X.addEventListener.call` gives `addEventListener`. */
const borrowed = (callee: ESTree.MemberExpression): Option.Option<string> => {
  if (!Option.exists(memberName(callee), (m) => m === 'call' || m === 'apply'))
    return Option.none();
  if (callee.object.type !== 'MemberExpression') return Option.none();
  return memberName(callee.object);
};

/** A call as a method on a receiver: what it calls, on whom (none: the global object), and its first argument. */
interface Called {
  readonly method: string;
  readonly receiver: Option.Option<ESTree.Node>;
  readonly first: Option.Option<ESTree.Node>;
}

/** The first argument `.apply`'s array passes. */
const applied = (node: Option.Option<ESTree.Node>): Option.Option<ESTree.Node> =>
  Option.flatMap(node, (array) => {
    if (array.type !== 'ArrayExpression') return Option.none();
    return Option.fromNullishOr(array.elements[0]);
  });

/** `call` read as a method on a receiver, however it was called: bare, on a receiver, or borrowed. */
const calledAs = (call: ESTree.CallExpression): Option.Option<Called> => {
  const callee = call.callee;
  const args = call.arguments;
  if (callee.type === 'Identifier')
    return Option.some({
      method: callee.name,
      receiver: Option.none(),
      first: Option.fromUndefinedOr(args[0]),
    });
  if (callee.type !== 'MemberExpression') return Option.none();
  return Option.match(borrowed(callee), {
    onNone: () =>
      Option.map(memberName(callee), (method): Called => ({
        method,
        receiver: Option.some(callee.object),
        first: Option.fromUndefinedOr(args[0]),
      })),
    onSome: (method) => {
      if (Option.contains(memberName(callee), 'apply'))
        return Option.some({
          method,
          receiver: Option.fromUndefinedOr(args[0]),
          first: applied(Option.fromUndefinedOr(args[1])),
        });
      return Option.some({
        method,
        receiver: Option.fromUndefinedOr(args[0]),
        first: Option.fromUndefinedOr(args[1]),
      });
    },
  });
};

/** What a call does that a page must leave to an adapter, in words: none when it is the page's own. */
const callRefusal = (call: ESTree.CallExpression, allowed: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const called = calledAs(call);
    if (Option.isNone(called)) return Option.none<string>();
    const { method, receiver, first } = called.value;
    const who = whoOf(receiver);
    if (CAPTURES.has(method) && Option.isSome(receiver))
      return Option.some(`${who(method)} holds a press outside its owner: ${DRAG}.`);
    if (method !== 'addEventListener') return Option.none<string>();
    // A bare `addEventListener` is the global object's, unless the file declares its own.
    if (Option.isNone(receiver) && !(yield* isGlobal(call, method))) return Option.none<string>();
    return yield* listenRefusal(
      {
        receiver,
        events: Option.match(first, {
          onNone: () => Effect.succeedNone,
          onSome: eventsNamed,
        }),
        spelled: (event) => `${who('addEventListener')}('${event}')`,
        unread: who('addEventListener'),
      },
      allowed,
    );
  });

/** The name an assignment writes: `x.name = …`, or a bare `name = …`. */
const assignedName = (left: ESTree.Node): Option.Option<string> => {
  if (left.type === 'Identifier') return Option.some(left.name);
  if (left.type === 'MemberExpression') return memberName(left);
  return Option.none();
};

/** Whose property an assignment writes: none for a bare name, the global object's. */
const targetOf = (left: ESTree.Node): Option.Option<ESTree.Node> => {
  if (left.type === 'MemberExpression') return Option.some(left.object);
  return Option.none();
};

/** `<receiver>.on<event> = …`, or a bare `on<event> = …`: a listener a handler property sets. */
const handlerRefusal = (assign: ESTree.AssignmentExpression, allowed: ReadonlySet<string>) =>
  Effect.gen(function* () {
    const left = assign.left;
    const event = Option.flatMap(assignedName(left), (n) =>
      Option.fromNullishOr(/^on([a-z]+)$/.exec(n)?.[1]),
    );
    if (Option.isNone(event) || !THROUGH.has(event.value)) return Option.none<string>();
    if (left.type === 'Identifier' && !(yield* isGlobal(assign, left.name)))
      return Option.none<string>();
    const receiver = targetOf(left);
    const who = whoOf(receiver);
    return yield* listenRefusal(
      {
        receiver,
        events: Effect.succeedSome([event.value]),
        spelled: (e) => who(`on${e}`),
        unread: who(`on${event.value}`),
      },
      allowed,
    );
  });

/** The event a JSX handler's name hears: `onPointerUp`, `onpointerup`, `on:pointerup`. */
const jsxEvent = (name: ESTree.JSXAttribute['name']): Option.Option<string> => {
  if (name.type === 'JSXNamespacedName')
    return Option.liftPredicate(name.name.name, () => name.namespace.name === 'on');
  return Option.fromNullishOr(/^on([A-Za-z]+)$/.exec(name.name)?.[1]);
};

/** A JSX handler for an event that ends a press, in words: none for any other. */
const jsxRefusal = (attr: ESTree.JSXAttribute, allowed: ReadonlySet<string>) =>
  Option.map(
    Option.filter(
      Option.map(jsxEvent(attr.name), (e) => e.toLowerCase()),
      (event) => ENDS_A_PRESS.has(event) && !allowed.has(event),
    ),
    (event) => `a JSX handler for '${event}' ends a press outside its owner: ${DRAG}.`,
  );

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
    const report = (node: ESTree.Node) => (refusal: Option.Option<string>) =>
      Option.match(refusal, {
        onNone: () => Effect.void,
        onSome: (message) => context.report(Diagnostic.make({ node, message })),
      });
    return Visitor.merge(
      Visitor.on('CallExpression', (call) =>
        Effect.flatMap(callRefusal(call, allowed), report(call)),
      ),
      Visitor.on('AssignmentExpression', (assign) =>
        Effect.flatMap(handlerRefusal(assign, allowed), report(assign)),
      ),
      Visitor.on('JSXAttribute', (attr) => report(attr)(jsxRefusal(attr, allowed))),
    );
  },
});
