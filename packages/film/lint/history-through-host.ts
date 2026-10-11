// `film/history-through-host`: a page never chooses a history move. Each
// field of a place declares its own policy (`Place.history`, @bible/url-state),
// and the address bar is written in one module, `browser/host.ts`
// (`addressOn`, `reloadAtAddress`), which reads that policy and owns the one
// traversal a page makes, a dismissal's Back (`addressOn(host).dismiss`): a
// call site that picks push or replace itself is how a drag came to push an
// entry per step, and one that picks Back how a dismissal went Back over
// another page's entry.
//
// Refused, each read off what holds it, called or not, or taken by
// destructuring under any static key (`const { replace } = yield* Location`,
// `{ 'back': b }`, `{ ['go']: g }`):
// - `navigate`, read from `UrlState.UrlState` (it takes its own `history`);
// - a move read from `Location`: `push`, `replace`, `back`, `forward` or `go`;
// - a traversal (`back`, `forward`) read from the bar `addressOn` gives: the
//   bar's dismissal chooses Back, never its caller.
// A value holds a service (`Location`, `UrlState.UrlState`) when it is bound
// to `yield* <service>` (or is `(yield* <service>)` itself), is
// `Context.get(…, <service>)` or `Context.getUnsafe(…, <service>)`, is the
// parameter of a callback handed to `<service>.use`, to
// `Effect.flatMap(<service>.asEffect(), …)` or to a `pipe` on the service,
// or is an alias of one, under any type wrapper (`as`, `satisfies`, `!`).
// Each name is read by its binding where it is written (`nodes.ts`):
// `Location` is a name bound to `@bible/url-state`'s `Location` import, or
// `<ns>.Location` where `<ns>` is bound to a namespace import of
// `@bible/url-state`; `UrlState.UrlState` is the `UrlState` namespace
// `@bible/url-state` exports (imported, or `<ns>.UrlState`); `Context` is
// bound to `effect`'s; and the bar is a call of a name bound to
// `browser/host.ts`'s `addressOn`, or an alias of one. A parameter or a local
// of the same name is its own binding, and none of these; a `navigate` read
// off anything else (a WebView's) is no history move. A service handed in as
// a parameter typed by its interface is not traced. The config turns the rule
// off in `browser/host.ts`, the tests and the fixtures.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { definitionOf, importsAs, keyName, memberName, unwrapped } from './nodes.ts';

const URL_STATE = '@bible/url-state';

/** The module that owns the address bar: `addressOn` is imported from a path ending here. */
const HOST_MODULE = /(?:^|\/)browser\/host\.ts$/u;

const MESSAGE =
  "a history move chosen here: a place's field declares its policy (Place.history, @bible/url-state), and the address bar is written through addressOn (packages/film/src/browser/host.ts).";

/** What a value is, of those this rule watches: the `Location` service, the bar `addressOn` gives, or `UrlState`. */
type Held = 'location' | 'bar' | 'urlState';

/** The moves a page never reads off what it holds. */
const REFUSED: Readonly<Record<Held, ReadonlyArray<string>>> = {
  location: ['push', 'replace', 'back', 'forward', 'go'],
  bar: ['back', 'forward'],
  urlState: ['navigate'],
};

/** Every move refused on anything: the names worth asking what their receiver holds. */
const MOVES: ReadonlySet<string> = new Set(Object.values(REFUSED).flat());

/** An answer read from the scope tree. */
type Reads<A> = Effect.Effect<A, never, RuleContext>;

/** What a value holds: none, or one of `Held`. */
type Holds = Reads<Option.Option<Held>>;

const no: Reads<boolean> = Effect.succeed(false);

/** Whether any answer is yes, asked in order. */
const some = (answers: ReadonlyArray<Reads<boolean>>): Reads<boolean> =>
  Effect.map(Effect.all(answers), (all) => all.some((a) => a));

/** The first answer that holds something, asked in order. */
const first = (answers: ReadonlyArray<Holds>): Holds =>
  Effect.map(Effect.all(answers), (all) => Option.firstSomeOf(all));

/** `held` when `yes`, else nothing. */
const holds = (held: Held, yes: Reads<boolean>): Holds =>
  Effect.map(yes, (y) => Option.liftPredicate(held, () => y));

/** Whether a module is `@bible/url-state`. */
const isUrlState = (from: string) => from === URL_STATE;

/** Whether `node` reads `@bible/url-state`'s export `name`: imported, or `<url-state ns>.name`. */
const readsUrlState = (node: ESTree.Node, name: string): Reads<boolean> => {
  if (node.type === 'Identifier') return importsAs(node, isUrlState, name);
  if (node.type !== 'MemberExpression' || !Option.contains(memberName(node), name)) return no;
  return importsAs(node.object, isUrlState, '*');
};

/** `UrlState.UrlState`: the service read off url-state's `UrlState` namespace. */
const isUrlStateTag = (n: ESTree.Node): Reads<boolean> => {
  if (n.type !== 'MemberExpression' || !Option.contains(memberName(n), 'UrlState')) return no;
  return readsUrlState(unwrapped(n.object), 'UrlState');
};

/** The service `node` names: url-state's `Location`, or its `UrlState.UrlState`. */
const serviceNamed = (node: ESTree.Node): Holds => {
  const n = unwrapped(node);
  return first([
    holds('location', readsUrlState(n, 'Location')),
    holds('urlState', isUrlStateTag(n)),
  ]);
};

/** `<service>`, or `<service>.asEffect()`: the effect that gives the service. */
const serviceEffect = (node: ESTree.Node): Holds => {
  const n = unwrapped(node);
  if (
    n.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    Option.contains(memberName(n.callee), 'asEffect')
  )
    return serviceNamed(n.callee.object);
  return serviceNamed(n);
};

/** `yield* <service>`. */
const yieldsService = (node: ESTree.Node): Holds => {
  if (node.type !== 'YieldExpression' || !node.delegate || !node.argument)
    return Effect.succeedNone;
  return serviceEffect(node.argument);
};

/** Whether `node` names effect's `Context`: bound to `import { Context } from 'effect'`, or to `effect/Context` whole. */
const isContext = (node: ESTree.Node): Reads<boolean> =>
  some([
    importsAs(node, (from) => from === 'effect', 'Context'),
    importsAs(node, (from) => from === 'effect/Context', '*'),
  ]);

/** `Context.get(context, <service>)` or `Context.getUnsafe(context, <service>)`: the service, out of a context. */
const takenFromContext = (node: ESTree.Node): Holds => {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression')
    return Effect.succeedNone;
  if (!Option.exists(memberName(node.callee), (m) => m === 'get' || m === 'getUnsafe'))
    return Effect.succeedNone;
  const key = node.arguments[1];
  if (!key) return Effect.succeedNone;
  return Effect.flatMap(isContext(unwrapped(node.callee.object)), (context) => {
    if (!context) return Effect.succeedNone;
    return serviceNamed(key);
  });
};

/** `addressOn(host)`, under a name bound to `browser/host.ts`'s `addressOn`. */
const makesBar = (node: ESTree.Node): Reads<boolean> => {
  if (node.type !== 'CallExpression') return no;
  return importsAs(unwrapped(node.callee), (from) => HOST_MODULE.test(from), 'addressOn');
};

/** `<service>.use` or `<service>.useSync`: the service `callee` hands its callback. */
const usedOn = (callee: ESTree.Node): Holds => {
  if (
    callee.type !== 'MemberExpression' ||
    !Option.exists(memberName(callee), (m) => m === 'use' || m === 'useSync')
  )
    return Effect.succeedNone;
  return serviceNamed(callee.object);
};

/** `<service>.asEffect().pipe(…, call, …)`: the service `call` is piped on. */
const pipedOn = (call: ESTree.Node): Holds => {
  const piped = call.parent;
  if (
    piped?.type !== 'CallExpression' ||
    !piped.arguments.some((a) => a === call) ||
    piped.callee.type !== 'MemberExpression' ||
    !Option.contains(memberName(piped.callee), 'pipe')
  )
    return Effect.succeedNone;
  return serviceEffect(piped.callee.object);
};

/**
 * The service a function is handed: the callback of `<service>.use(…)`, of a
 * call that also takes `<service>.asEffect()` (`Effect.flatMap(
 * Location.asEffect(), fn)`), or of a call piped on it (`Location.asEffect()
 * .pipe(Effect.flatMap(fn))`).
 */
const givenService = (fn: ESTree.Node): Holds => {
  const call = fn.parent;
  if (call?.type !== 'CallExpression' || !call.arguments.some((a) => a === fn))
    return Effect.succeedNone;
  const beside = call.arguments.filter((a) => a !== fn).map(serviceEffect);
  return first([usedOn(call.callee), ...beside, pipedOn(call)]);
};

/** Whether `param` is a parameter of the function `fn`. */
const isParameter = (fn: ESTree.Node, param: ESTree.Node) =>
  (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') &&
  fn.params.some((p) => p === param);

/** What a parameter of a function handed a service holds: that service. */
const givenAsParameter = (fn: ESTree.Node, param: ESTree.Node): Holds => {
  if (!isParameter(fn, param)) return Effect.succeedNone;
  return givenService(fn);
};

/** What `receiver` holds, where it is read: a service, the bar, or nothing. */
const heldBy = (receiver: ESTree.Node): Holds => {
  const value = unwrapped(receiver);
  return Effect.flatMap(
    first([yieldsService(value), takenFromContext(value)]),
    Option.match({
      onSome: (service): Holds => Effect.succeedSome(service),
      onNone: () => heldByBarOrBinding(value),
    }),
  );
};

/** What `value`, no service read in place, holds: the bar it makes, or what its binding holds. */
const heldByBarOrBinding = (value: ESTree.Node): Holds =>
  Effect.flatMap(makesBar(value), (bar) => {
    if (bar) return Effect.succeedSome<Held>('bar');
    if (value.type !== 'Identifier') return Effect.succeedNone;
    return Effect.flatMap(definitionOf(value), (def) => {
      if (Option.isNone(def)) return Effect.succeedNone;
      const { type, node, name } = def.value;
      if (type === 'Parameter') return givenAsParameter(node, name);
      if (node.type !== 'VariableDeclarator' || node.id.type !== 'Identifier' || !node.init)
        return Effect.succeedNone;
      return heldBy(node.init);
    });
  });

/** What an object pattern takes apart: `const { replace } = yield* Location`, `const { back } = addressOn(host)`. */
const destructured = (pattern: ESTree.ObjectPattern): Holds => {
  const owner = pattern.parent;
  if (owner.type === 'VariableDeclarator' && owner.id === pattern && owner.init)
    return heldBy(owner.init);
  return givenAsParameter(owner, pattern);
};

/** Whether `name` is a move refused on what `held` reads as. */
const refusedOn = (held: Holds, name: string): Reads<boolean> =>
  Effect.map(held, (h) => Option.exists(h, (on) => REFUSED[on].includes(name)));

export const historyThroughHost = Rule.define({
  name: 'history-through-host',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A page never chooses a history move: a place's field declares its policy, and the address bar is written in browser/host.ts alone.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node, chooses: Reads<boolean>) =>
      Effect.flatMap(chooses, (yes) =>
        Effect.asVoid(
          Effect.when(
            context.report(Diagnostic.make({ node, message: MESSAGE })),
            Effect.succeed(yes),
          ),
        ),
      );
    return Visitor.merge(
      Visitor.on('MemberExpression', (member) =>
        Option.match(
          Option.filter(memberName(member), (name) => MOVES.has(name)),
          {
            onNone: () => Effect.void,
            onSome: (name) => report(member, refusedOn(heldBy(member.object), name)),
          },
        ),
      ),
      Visitor.on('ObjectPattern', (pattern) =>
        Effect.forEach(
          pattern.properties.flatMap((p) =>
            Option.toArray(
              Option.map(
                Option.filter(keyName(p), (name) => MOVES.has(name)),
                (name) => [p, name] as const,
              ),
            ),
          ),
          ([p, name]) => report(p, refusedOn(destructured(pattern), name)),
          { discard: true },
        ),
      ),
    );
  },
});
