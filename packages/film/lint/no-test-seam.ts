// `film/no-test-seam`: product code never imports a test seam. A package's
// test-only doubles and fixtures live in its `testing.ts` (`core/testing.ts`,
// `tools/testing.ts`, `@bible/url-state/testing`, `@bible/core/<area>/testing`),
// so a shipped import cannot reach them. The dead-export check counts a seam
// as test code, so a product import of one is a take it does not see.
//
// Refused: a module of the repo's own named `testing`, with no extension or
// any JS or TS one (`.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`,
// `.cjs`: `packages/core` writes `.js`, which resolves to the `.ts` file), or
// a package's `…/testing` export, reached by a relative
// path or a `@bible/` package, from an import, a re-export (`export … from`,
// `export * from`), a type import, or a dynamic `import('…')` of a literal.
// Another package's `testing` (`effect/testing`) is no seam of the repo's.
// The config turns the rule on over every package's `src` and off where a
// seam is the point: the tests, the fixtures, the seams themselves and the
// type tests.

import { Effect, Option, Predicate } from 'effect';
import {
  Diagnostic,
  type ESTree,
  Rule,
  RuleContext,
  Visitor,
} from 'oxlint-plugin-effect/rule-bindings';

/** A test seam of the repo's own: a relative path or a `@bible/` export whose last piece is `testing`. */
const SEAM = /^(?:\.{1,2}\/|@bible\/)(?:.*\/)?testing(?:\.[cm]?[jt]sx?)?$/u;

const MESSAGE =
  "a test seam imported by product code: a testing.ts module holds a package's test-only doubles and fixtures, so a shipped import never reaches one. Move what this file needs out of the seam, into the module it belongs to.";

/** Whether a module source names a test seam, written as a string. */
const namesSeam = (source: ESTree.Node): boolean =>
  source.type === 'Literal' && Predicate.isString(source.value) && SEAM.test(source.value);

export const noTestSeam = Rule.define({
  name: 'no-test-seam',
  meta: Rule.meta({
    type: 'problem',
    description:
      "Product code never imports a test seam: a testing.ts module holds a package's test-only doubles.",
  }),
  create: function* () {
    const context = yield* RuleContext;
    const refuse = (node: ESTree.Node, source: Option.Option<ESTree.Node>) =>
      Effect.asVoid(
        Effect.when(
          context.report(Diagnostic.make({ node, message: MESSAGE })),
          Effect.succeed(Option.exists(source, namesSeam)),
        ),
      );
    return Visitor.merge(
      Visitor.merge(
        Visitor.on('ImportDeclaration', (node) => refuse(node, Option.some(node.source))),
        Visitor.on('ImportExpression', (node) => refuse(node, Option.some(node.source))),
      ),
      Visitor.merge(
        Visitor.on('ExportNamedDeclaration', (node) =>
          refuse(node, Option.fromNullOr(node.source)),
        ),
        Visitor.on('ExportAllDeclaration', (node) => refuse(node, Option.some(node.source))),
      ),
    );
  },
});
