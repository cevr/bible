// `film/test-git-config`: a test file writes no git config of its own. A
// test repository's git runs with `TEST_GIT` (packages/scripts/src/testing.ts)
// ahead of its arguments, which keeps the machine's name, mail, signing,
// hooks and editor out and turns git's automatic maintenance off: git starts
// it detached after a commit, and it writes and removes
// `.git/objects/maintenance.lock` while the test's scope deletes the folder,
// so the delete fails (ENOENT, in 11 runs of 15 on one process) and the case
// with it. A config copied into one file leaves that out.
//
// It reports a `'-c'` element of git's arguments followed by a `key=value`
// string, git's form of one setting on its command line. An array is git's
// arguments when it starts at a `'git'` element, when a call is handed it
// beside a `'git'` argument or by a name that says git (`git(dir, [...])`),
// or when a name that says git holds it (`const GIT = [...]`); another
// program's `-c` (`tar -c`) is its own. The config turns it on over every
// test file.

import { Array as Arr, Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';
import { memberName } from './nodes.ts';

const MESSAGE =
  "a git config written in a test file: run a test repository's git with TEST_GIT (packages/scripts/src/testing.ts) ahead of its arguments, which also turns git's automatic maintenance off, whose lock file breaks the folder's delete.";

/** The text of a node that is a string literal, if it is one. */
const textOf = (n: ESTree.ArrayExpression['elements'][number]): Option.Option<string> => {
  if (n?.type === 'Literal' && Predicate.isString(n.value)) return Option.some(n.value);
  return Option.none();
};

/** Whether a string is one setting, `key=value`, with a dotted key. */
const isSetting = (value: string) => /^[A-Za-z][\w-]*(\.[\w-]+)+=/.test(value);

/** Whether a name says git: `git`, `GIT`, `gitIn`, `runGit`. */
const saysGit = (name: string) => /git/i.test(name);

/** The name a callee goes by: `git` for `git(…)`, `make` for `ChildProcess.make(…)`. */
const calleeName = (callee: ESTree.Node): Option.Option<string> => {
  if (callee.type === 'Identifier') return Option.some(callee.name);
  if (callee.type === 'MemberExpression') return memberName(callee);
  return Option.none();
};

/** Whether an array is git's arguments, by its own first element or by what holds it. */
const isGitArguments = (array: ESTree.ArrayExpression) => {
  if (Option.contains(Option.flatMap(Arr.head(array.elements), textOf), 'git')) return true;
  const parent = array.parent;
  if (parent.type === 'CallExpression')
    return (
      Option.exists(calleeName(parent.callee), saysGit) ||
      parent.arguments.some((argument) => Option.contains(textOf(argument), 'git'))
    );
  if (parent.type === 'VariableDeclarator')
    return parent.id.type === 'Identifier' && saysGit(parent.id.name);
  return false;
};

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
              isGitArguments(node) &&
                Option.contains(textOf(element), '-c') &&
                Option.exists(Option.flatMap(Arr.get(node.elements, i + 1), textOf), isSetting),
            ),
          ),
        { discard: true },
      ),
    );
  },
});
