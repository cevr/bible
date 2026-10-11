// `film/no-ease-on-cue`: a cue's progress is eased once, by its span's `ease`.
// `f.at(cue)` already returns the eased progress (the span's `ease`, which the
// lab's picker writes), so `ease.inCubic(f.at('plunge'))` curves it a second
// time: the picker no longer sets the curve the frame draws, and a push whose
// zoom takes the second ease runs on another clock than its x and y. A
// camera push is a `shotPath` stop with `pushInto`; a motion that needs
// another curve reads its own cue (`with` the first, its own `ease`) or
// `f.keys(cue, …)`, whose keys name their ease.
//
// The rule reads `ease.<name>(x)`, `ease` film's curves (`core/time.ts`:
// imported, under an alias, or read off the module imported whole,
// `Core.ease.inCubic(x)`), where `x` is a call of the frame's `.at(…)` or a
// name bound by `const`, anywhere in scope, to one. A progress passed in as
// a parameter is not traced.

import { Effect, Option } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { type Bindings, bindings, isFilmTime, unwrapped } from './nodes.ts';

/** `ease.inCubic(x)`, `ease` film's curves: the one argument, when it is one. */
const easedArgument = (b: Bindings, n: ESTree.CallExpression): Option.Option<ESTree.Node> => {
  const callee = unwrapped(n.callee);
  if (
    callee.type !== 'MemberExpression' ||
    !b.readsImport(callee.object, isFilmTime, 'ease') ||
    n.arguments.length !== 1
  )
    return Option.none();
  return Option.filter(Option.fromUndefinedOr(n.arguments[0]), (a) => a.type !== 'SpreadElement');
};

export const noEaseOnCue = Rule.define({
  name: 'no-ease-on-cue',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A cue's progress is eased once, by its span's ease: ease.X(f.at(cue)) curves it again where the lab's picker cannot reach.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const b = yield* bindings;
    return Visitor.on('CallExpression', (node) =>
      Effect.asVoid(
        Effect.when(
          context.report(
            Diagnostic.make({
              node,
              message:
                "a cue's progress eased a second time: f.at(cue) is already eased by the span's `ease`, which the lab sets. A camera push is a shotPath stop with pushInto; another curve is its own cue or f.keys.",
            }),
          ),
          Effect.succeed(Option.exists(easedArgument(b, node), b.readsCue)),
        ),
      ),
    );
  },
});
