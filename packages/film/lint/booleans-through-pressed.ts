// `film/booleans-through-pressed`: a boolean a control shows is written by
// `pressed(on)` (`packages/film/src/lab/pressed.ts`), which types it
// `'true' | 'false'`, never as a string by hand. A template or `String(…)` over
// a boolean is a second spelling of it, and the one that was fixed by hand twice
// (Scenes, then the sheet and the page shell) came back at six more controls.
//
// A value is written by hand when it is `String(x)` or a template that is one
// value and nothing else (`` `${x}` ``). Refused, as a JSX attribute's value:
// - on `aria-pressed`, `aria-selected`, `aria-checked`, `aria-expanded` and
//   `aria-busy`, any such value: their tokens are `true` and `false` (and a
//   `mixed`, written as itself), so the attribute is the proof the value is a
//   boolean;
// - on `aria-current` (whose tokens are also words: `page`, `step`) and on any
//   `data-*`, such a value whose whole expression the source proves a boolean:
//   a comparison (`a === b`), a negation (`!a`), a boolean literal,
//   `Boolean(…)`, a logical or a conditional whose every branch is one, a cast
//   to `boolean`, a call named as a predicate is (`isLive()`, `hasCue()`,
//   `canUndo()`, `shouldRun()`), or a name whose binding in the file says so
//   (typed `boolean`, `() => boolean` or `Accessor<boolean>`, a const of a
//   proven boolean, a `createSignal(false)`, a `createMemo` of one, a function
//   returning `boolean`, or a member of a binding typed in the file:
//   `props.staged()` for `props: { staged: Accessor<boolean> }`).
// A number (`String(rate())`), a value beside a flag (`String(on() &&
// rate())`), text around a value (`` `${on()} item` ``) and a name proven
// nothing (`loaded()`) pass. The config turns it on over the lab's components
// and off in the tests and the fixtures.

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Scope,
  SourceCode,
  type Variable,
} from 'oxlint-plugin-effect/rule-bindings';
import { declared, memberName, programOf, staticName } from './nodes.ts';

const MESSAGE =
  "a boolean written as a string by hand: pressed(on) (packages/film/src/lab/pressed.ts) types it 'true' | 'false'.";

/** The ARIA states whose tokens are `true` and `false` (and a literal `mixed`): the attribute proves the value. */
const BOOLEAN_STATES: ReadonlyArray<string> = [
  'aria-pressed',
  'aria-selected',
  'aria-checked',
  'aria-expanded',
  'aria-busy',
];

/** A name a predicate goes by: `isLive`, `hasCue`, `canUndo`, `shouldRun`. */
const PREDICATE_NAME = /^(?:is|has|can|should)[A-Z]/u;

/** The comparisons, each a boolean. */
const COMPARISONS: ReadonlyArray<string> = [
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  'in',
  'instanceof',
];

/** How a name is used: its value read (`on`), or called (`on()`). */
type Use = 'read' | 'called';

/** The names already followed on the way to a binding: a name bound through itself proves nothing. */
type Seen = ReadonlySet<ESTree.Node>;

/** An answer read from the scope tree. */
type Reads = Effect.Effect<boolean, never, Effect.Services<ReturnType<typeof SourceCode.getScope>>>;

const yes: Reads = Effect.succeed(true);
const no: Reads = Effect.succeed(false);

/** Whether any answer is yes. */
const some = (answers: ReadonlyArray<Reads>): Reads =>
  Effect.map(Effect.all(answers), (all) => all.some((a) => a));

/** Whether every answer is yes. */
const every = (answers: ReadonlyArray<Reads>): Reads =>
  Effect.map(Effect.all(answers), (all) => all.every((a) => a));

/** The value a JSX attribute writes by hand: the argument of `String(x)`, or the one value of `` `${x}` ``. */
const writtenByHand = (attr: ESTree.JSXAttribute): Option.Option<ESTree.Node> => {
  if (attr.value?.type !== 'JSXExpressionContainer') return Option.none();
  const value = attr.value.expression;
  if (
    value.type === 'CallExpression' &&
    value.callee.type === 'Identifier' &&
    value.callee.name === 'String'
  )
    return Option.fromUndefinedOr(value.arguments[0]);
  if (
    value.type === 'TemplateLiteral' &&
    value.expressions.length === 1 &&
    value.quasis.every((q) => q.value.raw === '')
  )
    return Option.fromUndefinedOr(value.expressions[0]);
  return Option.none();
};

// The types the file writes.

/** A type is `boolean`: the keyword, `true` or `false`, a predicate (`x is T`), or a union of them. */
const isBooleanType = (t: ESTree.Node): boolean => {
  if (t.type === 'TSBooleanKeyword') return true;
  if (t.type === 'TSLiteralType')
    return t.literal.type === 'Literal' && Predicate.isBoolean(t.literal.value);
  if (t.type === 'TSTypePredicate') return !t.asserts;
  if (t.type === 'TSParenthesizedType') return isBooleanType(t.typeAnnotation);
  if (t.type === 'TSUnionType') return t.types.every(isBooleanType);
  return false;
};

/** A type is a reader of a boolean: `() => boolean`, `Accessor<boolean>`. */
const isBooleanReader = (t: ESTree.Node): boolean => {
  if (t.type === 'TSFunctionType') return isBooleanType(t.returnType.typeAnnotation);
  if (t.type === 'TSParenthesizedType') return isBooleanReader(t.typeAnnotation);
  return (
    t.type === 'TSTypeReference' &&
    t.typeName.type === 'Identifier' &&
    t.typeName.name === 'Accessor' &&
    Option.exists(Option.fromNullishOr(t.typeArguments?.params[0]), isBooleanType)
  );
};

/** Whether a type, used as `use`, gives a boolean. */
const typeGives = (t: ESTree.Node, use: Use): boolean => {
  if (use === 'read') return isBooleanType(t);
  return isBooleanReader(t);
};

/** The interface or type alias `name` declared at the top of the file. */
const localType = (program: ESTree.Node, name: string): Option.Option<ESTree.Node> => {
  if (program.type !== 'Program') return Option.none();
  return Option.fromNullishOr(
    program.body
      .map(declared)
      .find(
        (d) =>
          (d?.type === 'TSInterfaceDeclaration' || d?.type === 'TSTypeAliasDeclaration') &&
          d.id.name === name,
      ),
  );
};

/** The deepest a type is followed through aliases and wrappers. */
const TYPE_DEPTH = 4;

/**
 * The members a type declares: a literal's, a local interface's or alias's,
 * an intersection's, and a wrapper's type arguments' (`ParentProps<{ … }>`).
 */
const membersOf = (t: ESTree.Node, depth: number): ReadonlyArray<ESTree.Node> => {
  if (depth > TYPE_DEPTH) return [];
  if (t.type === 'TSTypeLiteral') return t.members;
  if (t.type === 'TSInterfaceDeclaration') return t.body.body;
  if (t.type === 'TSTypeAliasDeclaration' || t.type === 'TSParenthesizedType')
    return membersOf(t.typeAnnotation, depth + 1);
  if (t.type === 'TSIntersectionType') return t.types.flatMap((x) => membersOf(x, depth + 1));
  if (t.type !== 'TSTypeReference') return [];
  const named = Option.flatMap(
    Option.liftPredicate(t.typeName, (n) => n.type === 'Identifier'),
    (n) => Option.flatMap(Option.fromNullishOr(n.name), (name) => localType(programOf(t), name)),
  );
  return [
    ...Option.match(named, { onNone: () => [], onSome: (d) => membersOf(d, depth + 1) }),
    ...(t.typeArguments?.params ?? []).flatMap((x) => membersOf(x, depth + 1)),
  ];
};

/** Whether the member `name` of the type `t`, used as `use`, gives a boolean (`on: boolean`, `on: () => boolean`, `on(): boolean`). */
const memberGives = (t: ESTree.Node, name: string, use: Use): boolean =>
  membersOf(t, 0).some((m) => {
    if (m.type === 'TSMethodSignature')
      return (
        use === 'called' &&
        Option.contains(staticName(m.key, m.computed), name) &&
        Option.exists(Option.fromNullOr(m.returnType), (r) => isBooleanType(r.typeAnnotation))
      );
    return (
      m.type === 'TSPropertySignature' &&
      Option.contains(staticName(m.key, m.computed), name) &&
      Option.exists(Option.fromNullOr(m.typeAnnotation), (a) => typeGives(a.typeAnnotation, use))
    );
  });

// The bindings the file makes.

/** A name, where it is read. */
type Named = ESTree.Node & { readonly name: string };

/** How `id` is bound where it is read, when the file binds it. */
const definitionOf = (id: Named) =>
  Effect.map(SourceCode.getScope(id), (scope) =>
    Option.flatMap(Scope.findVariableUp(scope, id.name), (v: Variable) =>
      Option.fromUndefinedOr(v.defs[0]),
    ),
  );

/** The type a binding's name is annotated with: `const on: () => boolean`, `(props: { … })`. */
const annotated = (name: ESTree.Node): Option.Option<ESTree.Node> => {
  if (name.type !== 'Identifier') return Option.none();
  return Option.map(Option.fromNullishOr(name.typeAnnotation), (a) => a.typeAnnotation);
};

/** A function whose result is a proven boolean: annotated `boolean`, or an arrow whose body is one. */
const returnsBoolean = (fn: ESTree.Node, seen: Seen): Reads => {
  if (
    fn.type !== 'ArrowFunctionExpression' &&
    fn.type !== 'FunctionExpression' &&
    fn.type !== 'FunctionDeclaration'
  )
    return no;
  if (fn.returnType) return Effect.succeed(isBooleanType(fn.returnType.typeAnnotation));
  if (fn.type === 'ArrowFunctionExpression' && fn.expression) return isBoolean(fn.body, seen);
  return no;
};

/** `createSignal(false)`, `createSignal<boolean>(…)`, `createMemo(() => a === b)`: a reader of a boolean. */
const readerMade = (init: ESTree.Node, seen: Seen): Reads => {
  if (init.type !== 'CallExpression' || init.callee.type !== 'Identifier') return no;
  const made = init.callee.name;
  if (made !== 'createSignal' && made !== 'createMemo') return no;
  if (Option.exists(Option.fromNullishOr(init.typeArguments?.params[0]), isBooleanType)) return yes;
  return Option.match(Option.fromUndefinedOr(init.arguments[0]), {
    onNone: () => no,
    onSome: (first) => {
      if (made === 'createSignal') return isBoolean(first, seen);
      return returnsBoolean(first, seen);
    },
  });
};

/** What a `const`'s value proves, used as `use`. */
const constGives = (init: ESTree.Node, use: Use, seen: Seen): Reads => {
  if (use === 'read') return isBoolean(init, seen);
  return some([returnsBoolean(init, seen), readerMade(init, seen)]);
};

/** Whether the binding of `id`, used as `use`, proves a boolean. */
const bindingGives = (id: Named, use: Use, seen: Seen): Reads =>
  Effect.flatMap(definitionOf(id), (found) => {
    if (Option.isNone(found) || seen.has(found.value.node)) return no;
    const { type, node, name } = found.value;
    const next = new Set([...seen, node]);
    const typed = annotated(name);
    if (Option.isSome(typed)) return Effect.succeed(typeGives(typed.value, use));
    if (type === 'FunctionName') {
      if (use === 'read') return no;
      return returnsBoolean(node, next);
    }
    if (type !== 'Variable' || node.type !== 'VariableDeclarator' || !node.init) return no;
    if (node.parent.type !== 'VariableDeclaration' || node.parent.kind !== 'const') return no;
    // `const [on] = createSignal(false)`: the pattern's first name reads the signal.
    if (node.id.type === 'ArrayPattern') {
      if (use === 'read' || node.id.elements[0] !== name) return no;
      return readerMade(node.init, next);
    }
    if (node.id.type !== 'Identifier') return no;
    return constGives(node.init, use, next);
  });

/** Whether `object.name`, used as `use`, gives a boolean by the type `object`'s binding is annotated with. */
const memberGivesBoolean = (member: ESTree.MemberExpression, use: Use): Reads => {
  const object = member.object;
  if (object.type !== 'Identifier') return no;
  return Effect.map(definitionOf(object), (found) =>
    Option.exists(
      Option.all([Option.flatMap(found, (d) => annotated(d.name)), memberName(member)]),
      ([type, name]) => memberGives(type, name, use),
    ),
  );
};

/** Whether a call gives a proven boolean: `Boolean(x)`, a predicate's name, a reader the file types or binds. */
const calledBoolean = (call: ESTree.CallExpression, seen: Seen): Reads => {
  const { callee } = call;
  if (callee.type === 'Identifier') {
    if (callee.name === 'Boolean' || PREDICATE_NAME.test(callee.name)) return yes;
    return bindingGives(callee, 'called', seen);
  }
  if (callee.type !== 'MemberExpression') return no;
  if (Option.exists(memberName(callee), (name) => PREDICATE_NAME.test(name))) return yes;
  return memberGivesBoolean(callee, 'called');
};

/** Whether the source proves `node`'s whole value a boolean. */
const isBoolean = (node: ESTree.Node, seen: Seen): Reads => {
  switch (node.type) {
    case 'ParenthesizedExpression':
    case 'TSNonNullExpression':
      return isBoolean(node.expression, seen);
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSTypeAssertion':
      if (isBooleanType(node.typeAnnotation)) return yes;
      return isBoolean(node.expression, seen);
    case 'Literal':
      return Effect.succeed(Predicate.isBoolean(node.value));
    case 'UnaryExpression':
      return Effect.succeed(node.operator === '!');
    case 'BinaryExpression':
      return Effect.succeed(COMPARISONS.includes(node.operator));
    case 'LogicalExpression':
      return every([isBoolean(node.left, seen), isBoolean(node.right, seen)]);
    case 'ConditionalExpression':
      return every([isBoolean(node.consequent, seen), isBoolean(node.alternate, seen)]);
    case 'Identifier':
      return bindingGives(node, 'read', seen);
    case 'MemberExpression':
      return memberGivesBoolean(node, 'read');
    case 'CallExpression':
      return calledBoolean(node, seen);
    default:
      return no;
  }
};

/** Whether a JSX attribute writes a boolean as a string by hand. */
const writesBoolean = (attr: ESTree.JSXAttribute): Reads => {
  if (attr.name.type !== 'JSXIdentifier') return no;
  const name = attr.name.name;
  const value = writtenByHand(attr);
  if (Option.isNone(value)) return no;
  if (BOOLEAN_STATES.includes(name)) return yes;
  if (name !== 'aria-current' && !name.startsWith('data-')) return no;
  return isBoolean(value.value, new Set());
};

export const booleansThroughPressed = Rule.define({
  name: 'booleans-through-pressed',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A boolean a control shows is written by pressed(on), never a template or String(…) by hand.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return {
      JSXAttribute: (attr: ESTree.JSXAttribute) =>
        Effect.flatMap(writesBoolean(attr), (writes) =>
          Effect.asVoid(
            Effect.when(
              context.report(Diagnostic.make({ node: attr, message: MESSAGE })),
              Effect.succeed(writes),
            ),
          ),
        ),
    };
  },
});
