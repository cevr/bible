// `film/span-ends-on-anchor`: a span that lands on its anchor says so with
// `ends: true`. Written as `{ mark: 'true', offset: -0.5, dur: 0.5 }` it
// states its length twice, so a lab `dur` drag (or a hand edit of one number)
// moves the end off the moment it must land on. `{ mark: 'true', dur: 0.5,
// ends: true }` resolves to the same cue and keeps the landing when `dur`
// changes.
//
// A part of another cue that ends where that cue does says so too. Written
// as `{ with: 'speck', offset: 0.49, dur: 0.68 }` beside a `speck` of `dur:
// 1.17`, it ends on speck's end only because the numbers add up, so a lab
// drag of speck leaves it behind. `{ after: 'speck', dur: 0.68, ends: true }`
// (it keeps its length) or `{ with: 'speck', until: { cue: 'speck' } }` (it
// keeps its start) ends with speck however speck is dragged.
//
// The rule reads an object literal with an `offset` that is minus its `dur`;
// and a `{ with: P, offset?: a, dur: b }` in a timeline literal whose sibling
// `P` has a `dur` d with a + b = d. Each number is written out or a top-level
// const holding one, by the name's binding where it is read. A span that already says `ends` or `until` is left alone.

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type NumberOf, property, topLevel } from './nodes.ts';

/** How far apart two sums of written seconds may be and still be the same point. */
const SAME = 1e-9;

/** The `offset` of a span written as `offset: -d, dur: d` (d over 0), when it is one. */
const endsByHand = (
  numberOf: NumberOf,
  n: ESTree.ObjectExpression,
): Option.Option<ESTree.ObjectProperty> => {
  if (Option.isSome(property(n, 'ends'))) return Option.none();
  const dur = Option.flatMap(property(n, 'dur'), (p) => numberOf(p.value));
  return Option.filter(property(n, 'offset'), (p) =>
    Option.exists(Option.all([numberOf(p.value), dur]), ([o, d]) => d > 0 && o === -d),
  );
};

/** A string written out: the cue a `with` names. */
const stringOf = (n: ESTree.Node): Option.Option<string> => {
  if (n.type === 'Literal' && Predicate.isString(n.value)) return Option.some(n.value);
  return Option.none();
};

/** A span's `offset` in seconds: 0 when it has none, none when it is not a number written out. */
const offsetOf = (numberOf: NumberOf, n: ESTree.ObjectExpression): Option.Option<number> =>
  Option.match(property(n, 'offset'), {
    onNone: () => Option.some(0),
    onSome: (p) => numberOf(p.value),
  });

/** The `dur` of the cue `name` in the timeline literal `span` sits in, when it is written out. */
const siblingDur = (
  numberOf: NumberOf,
  span: ESTree.ObjectExpression,
  name: string,
): Option.Option<number> => {
  const entry = span.parent;
  if (entry.type !== 'Property' || entry.parent.type !== 'ObjectExpression') return Option.none();
  return Option.flatMap(property(entry.parent, name), (p) => {
    if (p.value.type !== 'ObjectExpression') return Option.none();
    return Option.flatMap(property(p.value, 'dur'), (d) => numberOf(d.value));
  });
};

/** The `dur` of a `with` part whose offset and dur add up to its parent's dur, when it is one. */
const endsWithParent = (
  numberOf: NumberOf,
  n: ESTree.ObjectExpression,
): Option.Option<ESTree.ObjectProperty> => {
  if (Option.isSome(property(n, 'ends')) || Option.isSome(property(n, 'until')))
    return Option.none();
  const parent = Option.flatMap(property(n, 'with'), (p) => stringOf(p.value));
  const length = Option.flatMap(parent, (name) => siblingDur(numberOf, n, name));
  return Option.filter(property(n, 'dur'), (p) =>
    Option.exists(
      Option.all([offsetOf(numberOf, n), numberOf(p.value), length]),
      ([a, b, d]) => d > 0 && Math.abs(a + b - d) < SAME,
    ),
  );
};

export const spanEndsOnAnchor = Rule.define({
  name: 'span-ends-on-anchor',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A span that ends on its anchor, or on the end of the cue it runs with, says so (`ends: true`, `until: { cue }`): its length is written once, so a dur edit or a drag keeps the landing.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    const { numberOf } = yield* topLevel;
    const report = (found: Option.Option<ESTree.Node>, message: string) =>
      Option.match(found, {
        onNone: () => Effect.void,
        onSome: (node) => context.report(Diagnostic.make({ node, message })),
      });
    return Visitor.on('ObjectExpression', (node) =>
      Effect.andThen(
        report(
          endsByHand(numberOf, node),
          'a span that ends on its anchor writes its length twice (offset: -d, dur: d): drop the offset and add `ends: true`, so a dur edit keeps the landing.',
        ),
        report(
          endsWithParent(numberOf, node),
          "a part that ends on its parent's end only because its offset and dur add up to the parent's dur: write `{ after: parent, dur, ends: true }` (keeps its length) or `{ with: parent, until: { cue: parent } }` (keeps its start), so a drag of the parent carries it.",
        ),
      ),
    );
  },
});
