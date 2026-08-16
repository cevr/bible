import { BunRuntime, BunServices } from '@effect/platform-bun';
import {
  Cause,
  Config,
  Console,
  Effect,
  FileSystem,
  Option,
  Path,
  Schema,
  SchemaGetter,
} from 'effect';
import { Command, Flag } from 'effect/unstable/cli';

import { compileTopics } from './compile.js';
import { emitArtifact } from './emit.js';
import { openCatalogLookup, openParagraphLookup } from './lookups.js';
import { parseTopicSource } from './source.js';

/** Defaults resolve against the repo root, not the caller's cwd: the root
 *  `build:topics` script runs this from `packages/scripts`, and a default that
 *  silently meant a different directory depending on who invoked it would be a
 *  trap. `import.meta.dir` is this file, three levels below the package root
 *  and five below the repo root. */
const repoRoot = new URL('../../../../', import.meta.url).pathname.replace(/\/$/u, '');

const content = Flag.string('content').pipe(
  Flag.withDefault(`${repoRoot}/content/topics`),
  Flag.withDescription('Directory of authored topic sources'),
);

const out = Flag.string('out').pipe(
  Flag.withDefault(`${repoRoot}/packages/core/data/topics.db`),
  Flag.withDescription('Destination path for the compiled topics.db'),
);

/** Empty means "derive from HOME inside the handler": a default read at module
 *  load would bake one machine's home directory into the flag's help text. */
const bibleDb = Flag.string('bible-db').pipe(
  Flag.withDefault(''),
  Flag.withDescription('bible.db to resolve catalog overlay keys against (default ~/.bible)'),
);

const writingsDb = Flag.string('writings-db').pipe(
  Flag.withDefault(''),
  Flag.withDescription('Writings database to verify citations against (default ~/.bible)'),
);

const json = Flag.boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Emit the manifest as JSON'),
);

class CompilerInputError extends Schema.TaggedError<CompilerInputError>()('CompilerInputError', {
  message: Schema.String,
}) {}

const JsonString = Schema.Unknown.pipe(
  Schema.encodeTo(Schema.String, {
    decode: SchemaGetter.parseJson(),
    encode: SchemaGetter.stringifyJson({ space: 2 }),
  }),
);

const encodeJson = Schema.encodeUnknownEffect(JsonString);

export const buildTopics = Command.make(
  'build:topics',
  { content, out, bibleDb, writingsDb, json },
  (args) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* Config.string('HOME');
      const orDefault = (flag: string, name: string): string =>
        Option.match(
          Option.liftPredicate(flag, (value) => value.length > 0),
          {
            onNone: () => path.join(home, '.bible', name),
            onSome: (value) => value,
          },
        );
      const bibleFile = orDefault(args.bibleDb, 'bible.db');
      const writingsFile = orDefault(args.writingsDb, 'egw-paragraphs.db');

      for (const [label, file] of [
        ['bible.db', bibleFile],
        ['writings database', writingsFile],
      ] satisfies readonly (readonly [string, string])[]) {
        if (!(yield* fs.exists(file))) {
          return yield* CompilerInputError.make({
            message: `${label} not found at ${file} — run 'bible init' first`,
          });
        }
      }
      if (!(yield* fs.exists(args.content))) {
        return yield* CompilerInputError.make({
          message: `content directory not found at ${args.content}`,
        });
      }

      const names = (yield* fs.readDirectory(args.content))
        .filter((name) => name.endsWith('.md'))
        .sort();
      const sources = yield* Effect.forEach(names, (name) =>
        fs
          .readFileString(path.join(args.content, name))
          .pipe(Effect.flatMap((contents) => parseTopicSource(name, contents))),
      );

      const paragraphs = openParagraphLookup(writingsFile);
      const catalog = openCatalogLookup(bibleFile);
      const compiled = yield* compileTopics({ sources, paragraphs, catalog });

      yield* fs.makeDirectory(path.dirname(args.out), { recursive: true });
      const artifact = yield* emitArtifact({ compiled, destination: args.out });

      const manifest = {
        path: artifact.path,
        revision: artifact.revision,
        size: artifact.size,
        digest: artifact.digest,
        schemaMajor: compiled.schemaMajor,
        schemaMinor: compiled.schemaMinor,
        bibleDbRevision: compiled.bibleDbRevision,
        sources: sources.length,
        approved: compiled.topics.length,
        drafts: sources.length - compiled.topics.length,
        aliases: compiled.aliases.length,
        edges: compiled.edges.length,
        catalogKeys: compiled.catalogKeys.length,
      };
      if (args.json) {
        yield* Console.log(yield* encodeJson(manifest));
        return;
      }
      yield* Console.log(`✓ ${artifact.path}`);
      yield* Console.log(`  revision   ${artifact.revision}`);
      yield* Console.log(`  size       ${String(artifact.size)} bytes`);
      yield* Console.log(`  digest     ${artifact.digest}`);
      yield* Console.log(
        `  pages      ${String(manifest.approved)} approved, ${String(manifest.drafts)} draft skipped`,
      );
      yield* Console.log(`  aliases    ${String(manifest.aliases)}`);
      yield* Console.log(`  edges      ${String(manifest.edges)}`);
      yield* Console.log(`  overlays   ${String(manifest.catalogKeys)}`);

      // The compiler's job is to emit what the content set says; refusing an
      // empty artifact is the installer's (§3.5 semantic verifier, which
      // requires a positive page and alias count). So an all-draft content set
      // compiles cleanly and then cannot install — a confusing pair of facts
      // unless the build says so out loud.
      if (manifest.approved === 0 || manifest.aliases === 0) {
        yield* Console.error(``);
        yield* Console.error(`⚠ This artifact is EMPTY and will be REFUSED at install time.`);
        yield* Console.error(`  The semantic verifier requires at least one page and one alias.`);
        yield* Console.error(
          `  All ${String(manifest.drafts)} source(s) are 'status: draft' — approve at least one`,
        );
        yield* Console.error(`  in content/topics/ to produce an installable artifact.`);
      }
    }),
);

const cli = Command.run(buildTopics, {
  version: '1.0.0',
});

cli.pipe(
  Effect.tapCause((cause) =>
    Console.error(`build:topics failed\n${Cause.pretty(cause)}`).pipe(Effect.ignore),
  ),
  Effect.provide(BunServices.layer),
  Effect.scoped,
  BunRuntime.runMain,
);
