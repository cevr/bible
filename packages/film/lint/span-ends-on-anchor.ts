// `film/span-ends-on-anchor`: a span that lands on its anchor says so with
// `ends: true`. Written as `{ mark: 'true', offset: -0.5, dur: 0.5 }` it
// states its length twice, so a lab `dur` drag (or a hand edit of one number)
// moves the end off the moment it must land on. `{ mark: 'true', dur: 0.5,
// ends: true }` resolves to the same cue and keeps the landing when `dur`
// changes.
//
// The rule reads an object literal with an `offset` that is minus its `dur`,
// each a number written out or a module const holding one. A span that
// already says `ends` is left alone.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { numberOf, property } from './nodes.ts';

/** The `offset` of a span written as `offset: -d, dur: d` (d over 0), when it is one. */
const endsByHand = (n: ESTree.ObjectExpression): Option.Option<ESTree.ObjectProperty> => {
  if (Option.isSome(property(n, 'ends'))) return Option.none();
  const dur = Option.flatMap(property(n, 'dur'), (p) => numberOf(p.value));
  return Option.filter(property(n, 'offset'), (p) =>
    Option.exists(Option.all([numberOf(p.value), dur]), ([o, d]) => d > 0 && o === -d),
  );
};

export const spanEndsOnAnchor = Rule.define({
  name: 'span-ends-on-anchor',
  meta: Rule.meta({
    type: 'problem',
    description:
      'A span that ends on its anchor is `{ …anchor, dur, ends: true }`, never `offset: -dur, dur`: its length is written once, so a dur edit keeps the landing.',
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('ObjectExpression', (node) =>
      Option.match(endsByHand(node), {
        onNone: () => Effect.void,
        onSome: (offset) =>
          context.report(
            Diagnostic.make({
              node: offset,
              message:
                'a span that ends on its anchor writes its length twice (offset: -d, dur: d): drop the offset and add `ends: true`, so a dur edit keeps the landing.',
            }),
          ),
      }),
    );
  },
});
