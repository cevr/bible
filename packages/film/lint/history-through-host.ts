// `film/history-through-host`: a page never chooses a history move. Each
// field of a place declares its own policy (`Place.history`, @bible/url-state),
// and the address bar is written in one module, `browser/host.ts`
// (`addressOn`, `reloadAtAddress`), which reads that policy and owns the one
// traversal a page makes, a dismissal's Back (`addressOn(host).dismiss`): a
// call site that picks push or replace itself is how a drag came to push an
// entry per step, and one that picks Back how a dismissal went Back over
// another page's entry.
//
// Refused:
// - a call of `.navigate(…)` (UrlState's, with its `history`);
// - a move read from `Location`: `push`, `replace`, `back`, `forward` or
//   `go`, called or not, or taken by destructuring under any static key
//   (`const { replace } = yield* Location`, `{ 'back': b }`, `{ ['go']: g }`);
// - a traversal (`back`, `forward`) read from the bar `addressOn` gives, the
//   same ways: the bar's dismissal chooses Back, never its caller.
// A value is `Location` when it is bound to `yield* Location` (or
// `(yield* Location)` itself), is `Context.get(…, Location)` or
// `Context.getUnsafe(…, Location)`, is the parameter of a callback handed to
// `Location.use`, to `Effect.flatMap(Location.asEffect(), …)` or to a `pipe`
// on `Location`, or is an alias of one, under any type wrapper (`as`,
// `satisfies`, `!`). Each name is read by its binding where it is written:
// `Location` is a name bound to `@bible/url-state`'s `Location` import, or
// `<ns>.Location` where `<ns>` is bound to a namespace import of
// `@bible/url-state`; `Context` is bound to `effect`'s; and the bar is a call
// of a name bound to `browser/host.ts`'s `addressOn`, or an alias of one. A
// parameter or a local of the same name is its own binding, and none of these.
// The config turns the rule off in `browser/host.ts`, the tests and the
// fixtures.

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

/** The moves of `Location` a page never chooses. */
const MOVES: ReadonlyArray<string> = ['push', 'replace', 'back', 'forward', 'go'];

/** The traversals the bar's dismissal chooses, never its caller. */
const TRAVERSALS: ReadonlyArray<string> = ['back', 'forward'];

/** An answer read from the scope tree. */
type Reads<A> = Effect.Effect<A, never, RuleContext>;

const no: Reads<boolean> = Effect.succeed(false);

/** Whether any answer is yes, asked in order. */
const some = (answers: ReadonlyArray<Reads<boolean>>): Reads<boolean> =>
  Effect.map(Effect.all(answers), (all) => all.some((a) => a));

/** Whether a module is `@bible/url-state`. */
const isUrlState = (from: string) => from === URL_STATE;

/** Whether `node` names the `Location` service: bound to its import, or `<url-state ns>.Location`. */
const isLocation = (node: ESTree.Node): Reads<boolean> => {
  if (node.type === 'Identifier') return importsAs(node, isUrlState, 'Location');
  if (node.type !== 'MemberExpression' || !Option.contains(memberName(node), 'Location')) return no;
  return importsAs(node.object, isUrlState, '*');
};

/** `Location`, or `Location.asEffect()`: the effect that gives the service. */
const locationEffect = (node: ESTree.Node): Reads<boolean> => {
  const n = unwrapped(node);
  if (
    n.type === 'CallExpression' &&
    n.callee.type === 'MemberExpression' &&
    Option.contains(memberName(n.callee), 'asEffect')
  )
    return isLocation(unwrapped(n.callee.object));
  return isLocation(n);
};

/** `yield* Location`. */
const yieldsLocation = (node: ESTree.Node): Reads<boolean> => {
  if (node.type !== 'YieldExpression' || !node.delegate || !node.argument) return no;
  return locationEffect(node.argument);
};

/** Whether `node` names effect's `Context`: bound to `import { Context } from 'effect'`, or to `effect/Context` whole. */
const isContext = (node: ESTree.Node): Reads<boolean> =>
  some([
    importsAs(node, (from) => from === 'effect', 'Context'),
    importsAs(node, (from) => from === 'effect/Context', '*'),
  ]);

/** `Context.get(context, Location)` or `Context.getUnsafe(context, Location)`: the service, out of a context. */
const takenFromContext = (node: ESTree.Node): Reads<boolean> => {
  if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return no;
  if (!Option.exists(memberName(node.callee), (m) => m === 'get' || m === 'getUnsafe')) return no;
  const key = node.arguments[1];
  if (!key) return no;
  const callee = node.callee;
  return Effect.flatMap(isContext(unwrapped(callee.object)), (context) => {
    if (!context) return no;
    return isLocation(unwrapped(key));
  });
};

/** `addressOn(host)`, under a name bound to `browser/host.ts`'s `addressOn`. */
const makesBar = (node: ESTree.Node): Reads<boolean> => {
  if (node.type !== 'CallExpression') return no;
  return importsAs(unwrapped(node.callee), (from) => HOST_MODULE.test(from), 'addressOn');
};

/**
 * Whether a function is handed the service: the callback of `Location.use(…)`,
 * of a call that also takes `Location.asEffect()` (`Effect.flatMap(
 * Location.asEffect(), fn)`), or of a call piped on it (`Location.asEffect()
 * .pipe(Effect.flatMap(fn))`).
 */
const givenLocation = (fn: ESTree.Node): Reads<boolean> => {
  const call = fn.parent;
  if (call?.type !== 'CallExpression' || !call.arguments.some((a) => a === fn)) return no;
  const beside = call.arguments.filter((a) => a !== fn).map(locationEffect);
  return some([usedOn(call.callee), ...beside, pipedOn(call)]);
};

/** `Location.use` or `Location.useSync`: whether `callee` hands its callback the service. */
const usedOn = (callee: ESTree.Node): Reads<boolean> => {
  if (
    callee.type !== 'MemberExpression' ||
    !Option.exists(memberName(callee), (m) => m === 'use' || m === 'useSync')
  )
    return no;
  return isLocation(unwrapped(callee.object));
};

/** `Location.asEffect().pipe(…, call, …)`: whether `call` is piped on the service's effect. */
const pipedOn = (call: ESTree.Node): Reads<boolean> => {
  const piped = call.parent;
  if (
    piped?.type !== 'CallExpression' ||
    !piped.arguments.some((a) => a === call) ||
    piped.callee.type !== 'MemberExpression' ||
    !Option.contains(memberName(piped.callee), 'pipe')
  )
    return no;
  return locationEffect(piped.callee.object);
};

/** What a value is, of the two this rule watches: the `Location` service, or the bar `addressOn` gives. */
type Held = 'location' | 'bar';

/** Whether `param` is a parameter of the function `fn`. */
const isParameter = (fn: ESTree.Node, param: ESTree.Node) =>
  (fn.type === 'ArrowFunctionExpression' || fn.type === 'FunctionExpression') &&
  fn.params.some((p) => p === param);

/** The moves a page never reads off what it holds. */
const REFUSED: Readonly<Record<Held, ReadonlyArray<string>>> = {
  location: MOVES,
  bar: TRAVERSALS,
};

/** `held` when `yes`, else nothing. */
const holds = (held: Held, yes: Reads<boolean>): Reads<Option.Option<Held>> =>
  Effect.map(yes, (y) => Option.liftPredicate(held, () => y));

/** What a parameter of a function handed the service holds: the service. */
const givenAsParameter = (fn: ESTree.Node, param: ESTree.Node): Reads<Option.Option<Held>> => {
  if (!isParameter(fn, param)) return Effect.succeedNone;
  return holds('location', givenLocation(fn));
};

/** What `receiver` holds, where it is read: the service, the bar, or neither. */
const heldBy = (receiver: ESTree.Node): Reads<Option.Option<Held>> => {
  const value = unwrapped(receiver);
  return Effect.flatMap(
    some([yieldsLocation(value), takenFromContext(value)]),
    (location): Reads<Option.Option<Held>> => {
      if (location) return Effect.succeedSome<Held>('location');
      return Effect.flatMap(makesBar(value), (bar) => {
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
    },
  );
};

/** What an object pattern takes apart: `const { replace } = yield* Location`, `const { back } = addressOn(host)`. */
const destructured = (pattern: ESTree.ObjectPattern): Reads<Option.Option<Held>> => {
  const owner = pattern.parent;
  if (owner.type === 'VariableDeclarator' && owner.id === pattern && owner.init)
    return heldBy(owner.init);
  return givenAsParameter(owner, pattern);
};

/** Whether `node` is `x.navigate(…)`: UrlState's move, with its own `history`. */
const navigates = (call: ESTree.CallExpression) =>
  call.callee.type === 'MemberExpression' && Option.contains(memberName(call.callee), 'navigate');

/** Whether `name` is a move refused on what `held` reads as. */
const refusedOn = (held: Reads<Option.Option<Held>>, name: string): Reads<boolean> =>
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
      Visitor.on('CallExpression', (call) => report(call, Effect.succeed(navigates(call)))),
      Visitor.merge(
        Visitor.on('MemberExpression', (member) =>
          Option.match(
            Option.filter(memberName(member), (name) => MOVES.includes(name)),
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
                  Option.filter(keyName(p), (name) => MOVES.includes(name)),
                  (name) => [p, name] as const,
                ),
              ),
            ),
            ([p, name]) => report(p, refusedOn(destructured(pattern), name)),
            { discard: true },
          ),
        ),
      ),
    );
  },
});
