// `film/test-git-config`: a test file writes no git config of its own. A
// test repository's git runs with `TEST_GIT` (packages/scripts/src/testing.ts)
// ahead of its arguments, which keeps the machine's name, mail, signing,
// hooks and editor out and turns git's automatic maintenance off: git starts
// it detached after a commit, and it writes and removes
// `.git/objects/maintenance.lock` while the test's scope deletes the folder,
// so the delete fails (ENOENT, in 11 runs of 15 on one process) and the case
// with it. A config copied into one file leaves that out.
//
// It reports a `'-c'` element of an array followed by a `key=value` string,
// git's form of one setting on its command line. The config turns it on over
// every test file.

import { Array as Arr, Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

const MESSAGE =
  "a git config written in a test file: run a test repository's git with TEST_GIT (packages/scripts/src/testing.ts) ahead of its arguments, which also turns git's automatic maintenance off, whose lock file breaks the folder's delete.";

/** The text of an array element that is a string literal, if it is one. */
const textOf = (n: ESTree.ArrayExpression['elements'][number]): Option.Option<string> => {
  if (n?.type === 'Literal' && Predicate.isString(n.value)) return Option.some(n.value);
  return Option.none();
};

/** Whether a string is one setting, `key=value`, with a dotted key. */
const isSetting = (value: string) => /^[A-Za-z][\w-]*(\.[\w-]+)+=/.test(value);

export const testGitConfig = Rule.define({
  name: 'test-git-config',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A test repository's git runs with the shared TEST_GIT config, never one written in the test file.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    return Visitor.on('ArrayExpression', (node) =>
      Effect.forEach(
        node.elements,
        (element, i) =>
          Effect.when(
            Effect.forEach(Option.toArray(Option.fromNullishOr(element)), (flag) =>
              context.report(Diagnostic.make({ node: flag, message: MESSAGE })),
            ),
            Effect.succeed(
              Option.contains(textOf(element), '-c') &&
                Option.exists(Option.flatMap(Arr.get(node.elements, i + 1), textOf), isSetting),
            ),
          ),
        { discard: true },
      ),
    );
  },
});
