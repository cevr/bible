// `film/touches-serial`: a browser test that sends touches runs alone, as
// `test.serial`. While one tab's touches are under way, Chrome drops, or
// lands as a bare click, the touches a file's other cases send their own
// tabs at the same time, one finger or two; and a `.dom.test.ts` file's
// cases run at once (`concurrentTestGlob`, `bunfig.toml`), so the sibling's
// press never lands as a touch and one of the two fails by turns.
//
// A touch is a tab's finger (`page.finger`, its `second` among them,
// `lab/fixtures/tab.ts`), read off the tab or taken apart from it
// (`const { finger } = page`): the tab is a value handed in, so its finger is
// read by its member's name. Or it is the touch gesture (`touch`,
// `lab/fixtures/gestures.ts`), by its binding (`nodes.ts`): imported, under
// an alias, or read off the module imported whole. A name the file declares
// whose value touches only inside a function (a helper, a table of steps), or
// that a finger is taken apart into, touches too, however deep, at each read
// of that binding (a parameter or a local of the same spelling is another
// name). An initializer that touches outside any function of its own runs
// where it is declared, so its touch stands where the declaration does.
// Every touch, and every use of a name that touches, is inside the body of a
// `test.serial(…)`, or inside a declaration that is itself used only there;
// one inside any other test, or outside every test and declaration (a loop
// over a table that touches), is reported where it is. A test is a call of
// the runner's `it` or `test` (`bun:test`'s, `effect-bun-test`'s or bun's
// global, by its binding), and `test.serial` is the runner's `test`'s.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, type Bindings, bindings, memberName, type Module } from './nodes.ts';

/** The module the touch gesture is exported from. */
const isGestures: Module = (from) => /(?:^|\/)fixtures\/gestures(?:\.[jt]s)?$/u.test(from);

/** The node a callee chain starts at: `it` for `it.effect.layer(x)(…)`. */
const rootOf = (n: ESTree.Node): Option.Option<ESTree.Node> => {
  if (n.type === 'Identifier') return Option.some(n);
  if (n.type === 'MemberExpression') return rootOf(n.object);
  if (n.type === 'CallExpression') return rootOf(n.callee);
  return Option.none();
};

const isFunction = (n: ESTree.Node) =>
  n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression';

/** A call of the runner's `test.serial(…)`. */
const isSerialTest = (b: Bindings, n: ESTree.Node) =>
  n.type === 'CallExpression' &&
  n.callee.type === 'MemberExpression' &&
  Option.contains(memberName(n.callee), 'serial') &&
  b.isRunner(n.callee.object, 'test');

/** A test: the runner's `it…(name, body, …)` or `test…(name, body, …)`. */
const isTest = (b: Bindings, n: ESTree.Node) =>
  n.type === 'CallExpression' &&
  Option.exists(rootOf(n.callee), (root) => b.isRunner(root, 'it') || b.isRunner(root, 'test')) &&
  n.arguments.some(isFunction);

/** `<x>.finger`: the identifier `finger` read off a tab. */
const isFinger = (n: ESTree.Node) =>
  n.type === 'Identifier' &&
  n.name === 'finger' &&
  n.parent.type === 'MemberExpression' &&
  n.parent.property === n &&
  !n.parent.computed;

/** The touch gesture: `touch` (or its alias) where it is used, or the `touch` of `gestures.touch`. */
const isGesture = (b: Bindings, n: ESTree.Node) => {
  if (n.type !== 'Identifier') return false;
  const p = n.parent;
  if (p.type === 'MemberExpression' && p.property === n && !p.computed)
    return b.readsImport(p, isGestures, 'touch');
  return isUse(n) && b.importsAs(n, isGestures, 'touch');
};

/**
 * `{ finger }` or `{ finger: tip }` taken apart from a tab: the `finger` key
 * of a pattern, with the name it binds (none when it binds no one name, as
 * a pattern within the pattern).
 */
const fingerTakenApart = (n: ESTree.Node): Option.Option<Option.Option<ESTree.Node>> => {
  if (n.type !== 'Identifier' || n.name !== 'finger') return Option.none();
  const p = n.parent;
  if (p.type !== 'Property' || p.key !== n || p.computed) return Option.none();
  if (p.parent.type !== 'ObjectPattern') return Option.none();
  return Option.some(boundName(p.value));
};

/** The one name a pattern binds (`tip`, `tip = x`), or none. */
const boundName = (b: ESTree.Node): Option.Option<ESTree.Node> => {
  if (b.type === 'Identifier') return Option.some(b);
  if (b.type === 'AssignmentPattern') return boundName(b.left);
  return Option.none();
};

/** Whether an identifier is a use of a name, not a declaration of one or a member's or key's name. */
const isUse = (n: ESTree.Node) =>
  Option.exists(Option.fromUndefinedOr(ancestors(n).at(0)), (p) => usedIn(n, p));

/** Whether `n` stands as a use in `p`, its parent. */
const usedIn = (n: ESTree.Node, p: ESTree.Node) => {
  if (p.type === 'MemberExpression') return p.object === n || p.computed;
  // In a pattern a property's value is a name bound; only a computed key is read.
  if (p.type === 'Property' && p.parent.type === 'ObjectPattern') return p.computed && p.key === n;
  if (p.type === 'Property') return p.value === n || p.computed;
  if (p.type === 'VariableDeclarator') return p.init === n;
  return !(
    p.type === 'ImportSpecifier' ||
    p.type === 'ImportDefaultSpecifier' ||
    p.type === 'ImportNamespaceSpecifier' ||
    p.type === 'FunctionDeclaration' ||
    p.type === 'MethodDefinition' ||
    p.type === 'PropertyDefinition'
  );
};

/** Where a touch or a use stands: a serial test's body, another test's, a declaration (by the name it binds), or none. */
type Host =
  | { readonly _tag: 'Serial' }
  | { readonly _tag: 'Test' }
  | { readonly _tag: 'Declared'; readonly binding: ESTree.Node }
  | { readonly _tag: 'Loose' };

/**
 * Where `n` stands. A declaration hosts it only when `n` is inside a
 * function of the declaration's (a helper's body, a step's): an initializer
 * that reaches `n` with no function between runs as it is declared, so `n`
 * stands where the declaration does.
 */
const hostOf = (b: Bindings, n: ESTree.Node): Host => {
  const up = ancestors(n);
  if (up.some((a) => isSerialTest(b, a))) return { _tag: 'Serial' };
  let deferred = false;
  for (const a of up) {
    if (isTest(b, a)) return { _tag: 'Test' };
    if (a.type === 'VariableDeclarator' && a.id.type === 'Identifier' && deferred)
      return { _tag: 'Declared', binding: a.id };
    if (a.type === 'FunctionDeclaration')
      return Option.match(Option.fromNullOr(a.id), {
        onNone: (): Host => ({ _tag: 'Loose' }),
        onSome: (id): Host => ({ _tag: 'Declared', binding: id }),
      });
    if (isFunction(a)) deferred = true;
  }
  return { _tag: 'Loose' };
};

/** A touch, or a use of a name the file binds, outside a serial test's body. */
interface Seen {
  readonly node: ESTree.Node;
  /** The binding of the name used; none for a touch, which touches whatever it is called. */
  readonly used: Option.Option<ESTree.Node>;
  readonly host: Exclude<Host, { readonly _tag: 'Serial' }>;
}

const seen =
  (b: Bindings) =>
  (n: ESTree.Node): Option.Option<Seen> => {
    if (n.type !== 'Identifier') return Option.none();
    const takenApart = fingerTakenApart(n);
    // A finger taken apart into one name declares that name, which touches wherever it is used.
    const declares = Option.flatten(takenApart);
    const touch = isFinger(n) || isGesture(b, n) || Option.isSome(takenApart);
    const used = Option.map(
      Option.filter(b.definitionOf(n), () => !touch && isUse(n)),
      (def) => def.name,
    );
    if (!touch && Option.isNone(used)) return Option.none();
    const host = Option.match(declares, {
      onNone: () => hostOf(b, n),
      onSome: (binding): Host => ({ _tag: 'Declared', binding }),
    });
    if (host._tag === 'Serial') return Option.none();
    return Option.some({ node: n, used, host });
  };

/** Whether a sighting touches, given the bindings that do. */
const touches = (s: Seen, touching: ReadonlySet<ESTree.Node>) =>
  Option.match(s.used, { onNone: () => true, onSome: (binding) => touching.has(binding) });

/** The bindings that touch: each declaration whose value touches or uses one that does. */
const touchingBindings = (all: ReadonlyArray<Seen>) => {
  const touching = new Set<ESTree.Node>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of all)
      if (s.host._tag === 'Declared' && !touching.has(s.host.binding) && touches(s, touching)) {
        touching.add(s.host.binding);
        grew = true;
      }
  }
  return touching;
};

const MESSAGE =
  "a touch outside test.serial: while one tab's touches are under way Chrome drops, or lands as a bare click, the touches the file's other cases send their own tabs at the same time. Run this case as test.serial.";

export const touchesSerial = Rule.define({
  name: 'touches-serial',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A test that sends touches runs alone: Chrome drops a sibling tab's touches, or lands them as bare clicks, while a tab's are under way.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return yield* Visitor.accumulate('Identifier', seen(b), (all) => {
      const touching = touchingBindings(all);
      return Effect.forEach(
        all.filter((s) => s.host._tag !== 'Declared' && touches(s, touching)),
        (s) => context.report(Diagnostic.make({ node: s.node, message: MESSAGE })),
        { discard: true },
      );
    });
  },
});
