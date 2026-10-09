// `film/lock-through-sqlite`: a manifest's lock file (`.<name>.lock` beside
// the manifest) is opened by SQLite alone, in `tools/manifest-lock-bun.ts`.
// The lock is the operating system's advisory lock SQLite holds on it, and
// the kernel lets go of every such lock a process holds on a file when that
// process closes any handle on the file: a read, a stat through an open
// handle or a copy made elsewhere in the process drops the store's lock
// while the store still believes it holds it, and two writers go in.
//
// Refused outside that module: a call of `lockFile` (the lock file's path),
// and a string or template that names a lock file (`.catalogue.json.lock`,
// `` `.${name}.lock` ``). A test that reads a lock's name back (a folder's
// listing) is the host's side and is let off by the config.

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

/** A lock file's name: a dot, a name, `.lock`, at the end of a path or a name's piece. */
const LOCK_NAME = /(?:^|\/)\.[^/]*\.lock$/u;

const MESSAGE =
  "a manifest's lock file named outside its lock: SQLite alone opens it (packages/film/src/tools/manifest-lock-bun.ts), since closing any other handle on it lets go of the process's lock.";

/**
 * Whether a template literal builds a lock file's name (`` `.${name}.lock` ``):
 * its text with a name standing for each value.
 */
const buildsLockName = (node: ESTree.TemplateLiteral) =>
  LOCK_NAME.test(
    node.quasis
      .map((q) => Option.getOrElse(Option.fromNullishOr(q.value.cooked), () => q.value.raw))
      .join('x'),
  );

/** Whether a node names a lock file, or asks for one's path. */
const namesLock = (node: ESTree.Node): boolean => {
  if (node.type === 'Literal') return Predicate.isString(node.value) && LOCK_NAME.test(node.value);
  if (node.type === 'TemplateLiteral') return buildsLockName(node);
  if (node.type === 'CallExpression')
    return node.callee.type === 'Identifier' && node.callee.name === 'lockFile';
  return false;
};

export const lockThroughSqlite = Rule.define({
  name: 'lock-through-sqlite',
  meta: Rule.meta({
    type: 'problem',
    description:
      "A manifest's lock file is opened by SQLite alone (tools/manifest-lock-bun.ts): closing any other handle on it lets go of the process's lock.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const report = (node: ESTree.Node) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(namesLock(node)),
        ),
      );
    return Visitor.merge(
      Visitor.on('Literal', report),
      Visitor.merge(Visitor.on('TemplateLiteral', report), Visitor.on('CallExpression', report)),
    );
  },
});
