// `film/touches-serial`: a browser test that sends touches runs alone, as
// `test.serial`. While one tab's touches are under way, Chrome drops, or
// lands as a bare click, the touches a file's other cases send their own
// tabs at the same time, one finger or two; and a `.dom.test.ts` file's
// cases run at once (`concurrentTestGlob`, `bunfig.toml`), so the sibling's
// press never lands as a touch and one of the two fails by turns.
//
// A touch is a tab's finger (`page.finger`, its `second` among them,
// `lab/fixtures/tab.ts`) or the touch gesture (`touch`,
// `lab/fixtures/gestures.ts`, under whatever name it is imported). A name
// the file declares whose value touches (a helper, a table of states, a step
// a case binds) touches too, however deep. Every touch, and every use of a
// name that touches, is inside the body of a `test.serial(…)`, or inside a
// declaration that is itself used only there; one inside any other test, or
// outside every test and declaration (a loop over a table that touches), is
// reported where it is.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { ancestors, memberName, programOf } from './nodes.ts';

/** The module the touch gesture is exported from. */
const GESTURES = /(?:^|\/)fixtures\/gestures(?:\.ts)?$/;

/** The names a file imports the touch gesture (`touch`, `fixtures/gestures.ts`) under. */
const gestureNames = (program: ESTree.Node): ReadonlyArray<string> => {
  if (program.type !== 'Program') return [];
  return program.body.flatMap((statement) => {
    if (statement.type !== 'ImportDeclaration' || !GESTURES.test(statement.source.value)) return [];
    return statement.specifiers.flatMap((s) => {
      if (s.type !== 'ImportSpecifier' || s.imported.type !== 'Identifier') return [];
      if (s.imported.name !== 'touch') return [];
      return [s.local.name];
    });
  });
};

/** The identifier a callee chain starts at: `it` for `it.effect.layer(x)(…)`. */
const rootName = (n: ESTree.Node): Option.Option<string> => {
  if (n.type === 'Identifier') return Option.some(n.name);
  if (n.type === 'MemberExpression') return rootName(n.object);
  if (n.type === 'CallExpression') return rootName(n.callee);
  return Option.none();
};

const isFunction = (n: ESTree.Node) =>
  n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression';

/** A call to `test.serial(…)`. */
const isSerialTest = (n: ESTree.Node) =>
  n.type === 'CallExpression' &&
  n.callee.type === 'MemberExpression' &&
  n.callee.object.type === 'Identifier' &&
  n.callee.object.name === 'test' &&
  Option.contains(memberName(n.callee), 'serial');

/** A test: `it…(name, body, …)` or `test…(name, body, …)`. */
const isTest = (n: ESTree.Node) =>
  n.type === 'CallExpression' &&
  Option.exists(rootName(n.callee), (name) => name === 'it' || name === 'test') &&
  n.arguments.some(isFunction);

/** `<x>.finger`: the identifier `finger` read off a tab. */
const isFinger = (n: ESTree.Node) =>
  n.type === 'Identifier' &&
  n.name === 'finger' &&
  n.parent.type === 'MemberExpression' &&
  n.parent.property === n &&
  !n.parent.computed;

/** Whether an identifier is a use of a name, not a declaration of one or a member's or key's name. */
const isUse = (n: ESTree.Node) =>
  Option.exists(Option.fromUndefinedOr(ancestors(n).at(0)), (p) => usedIn(n, p));

/** Whether `n` stands as a use in `p`, its parent. */
const usedIn = (n: ESTree.Node, p: ESTree.Node) => {
  if (p.type === 'MemberExpression') return p.object === n || p.computed;
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

/** Where a touch or a use stands: a serial test's body, another test's, a named declaration, or none. */
type Host =
  | { readonly _tag: 'Serial' }
  | { readonly _tag: 'Test' }
  | { readonly _tag: 'Declared'; readonly name: string }
  | { readonly _tag: 'Loose' };

const hostOf = (n: ESTree.Node): Host => {
  const up = ancestors(n);
  if (up.some(isSerialTest)) return { _tag: 'Serial' };
  for (const a of up) {
    if (isTest(a)) return { _tag: 'Test' };
    if (a.type === 'VariableDeclarator' && a.id.type === 'Identifier')
      return { _tag: 'Declared', name: a.id.name };
    if (a.type === 'FunctionDeclaration')
      return Option.match(Option.fromNullOr(a.id), {
        onNone: (): Host => ({ _tag: 'Loose' }),
        onSome: (id): Host => ({ _tag: 'Declared', name: id.name }),
      });
  }
  return { _tag: 'Loose' };
};

/** A touch, or a use of a name, outside a serial test's body. */
interface Seen {
  readonly node: ESTree.Node;
  /** The name used; none for a finger, which touches whatever it is called. */
  readonly name: Option.Option<string>;
  readonly host: Exclude<Host, { readonly _tag: 'Serial' }>;
  readonly program: ESTree.Node;
}

const seen = (n: ESTree.Node): Option.Option<Seen> => {
  if (n.type !== 'Identifier') return Option.none();
  const finger = isFinger(n);
  if (!finger && !isUse(n)) return Option.none();
  const host = hostOf(n);
  if (host._tag === 'Serial') return Option.none();
  return Option.some({
    node: n,
    name: Option.liftPredicate(n.name, () => !finger),
    host,
    program: programOf(n),
  });
};

/** Whether a sighting touches, given the names that do. */
const touches = (s: Seen, touching: ReadonlySet<string>) =>
  Option.match(s.name, { onNone: () => true, onSome: (name) => touching.has(name) });

/** The names that touch: the gesture's, and each declaration whose value touches or uses one that does. */
const touchingNames = (all: ReadonlyArray<Seen>) => {
  const touching = new Set(all.slice(0, 1).flatMap((s) => gestureNames(s.program)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of all)
      if (s.host._tag === 'Declared' && !touching.has(s.host.name) && touches(s, touching)) {
        touching.add(s.host.name);
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
    return yield* Visitor.accumulate('Identifier', seen, (all) => {
      const touching = touchingNames(all);
      return Effect.forEach(
        all.filter((s) => s.host._tag !== 'Declared' && touches(s, touching)),
        (s) => context.report(Diagnostic.make({ node: s.node, message: MESSAGE })),
        { discard: true },
      );
    });
  },
});
