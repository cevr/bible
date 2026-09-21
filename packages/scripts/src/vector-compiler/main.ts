/** `bun run build:vectors` — the §9.2 flat vector index builder.
 *
 *  Mirrors `topics-compiler/main.ts`: an `effect/unstable/cli` command under
 *  `BunRuntime.runMain`, defaults resolved against `~/.bible`, a `--json`
 *  manifest, and `Cause.pretty` on the way out.
 *
 *  **`--limit` is required in practice and defaulted to a small number.** §10 is
 *  explicit: "Do NOT run on the full corpus." 961,761 paragraphs at §9.5's
 *  latency is hours of compute and a 246 MB artifact, and what this milestone
 *  has to establish is that the *writer* is correct — which a few hundred
 *  paragraphs prove exactly as well. The full build is a release operation, run
 *  deliberately with `--limit 0`.
 *
 *  The writer under test is the shipped writer: `encodeVectorIndex` lives in
 *  `@bible/core/search` beside the parser that reads it, so the synthetic-vector
 *  test in core exercises the same function this script calls.
 */

import {
  DIMENSIONS,
  encodeVectorIndex,
  MODEL_FINGERPRINT,
  VectorManifest,
} from '@bible/core/search';
import { layerBunEmbedder } from '@bible/core/search/bun';
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

import { clearCheckpoint, embedAllResumable } from './checkpoint.js';
import { bookRanges, paragraphIds } from './emit.js';
import { readVectorSource } from './source.js';

const repoRoot = new URL('../../../../', import.meta.url).pathname.replace(/\/$/u, '');

const out = Flag.String('out').pipe(
  Flag.withDefault(`${repoRoot}/packages/core/data/vectors.bvi`),
  Flag.withDescription('Destination path for the compiled vector index'),
);

/** Empty means "derive from HOME inside the handler": a default read at module
 *  load would bake one machine's home directory into the flag's help text. */
const writingsDb = Flag.String('writings-db').pipe(
  Flag.withDefault(''),
  Flag.withDescription('Writings database to embed from (default ~/.bible)'),
);

/** §10's guard, as a flag with a safe default rather than a comment.
 *
 *  200 is enough to exercise every part of the writer — multiple books, a
 *  per-book manifest with more than one range, a real embedder — and small
 *  enough that a developer who runs the script by accident waits seconds rather
 *  than hours. `0` means the whole corpus, and is the deliberate act. */
const limit = Flag.Int('limit').pipe(
  Flag.withDefault(200),
  Flag.withDescription('Paragraphs to embed; 0 means the entire EGW scope (hours)'),
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

const json = Flag.Boolean('json').pipe(
  Flag.withDefault(false),
  Flag.withDescription('Emit the manifest as JSON'),
);

export const buildVectors = Command.make(
  'build:vectors',
  { out, writingsDb, limit, json },
  (args) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* Config.String('HOME');
      const writingsFile = Option.match(
        Option.liftPredicate(args.writingsDb, (value) => value.length > 0),
        {
          onNone: () => path.join(home, '.bible', 'egw-paragraphs.db'),
          onSome: (value) => value,
        },
      );

      if (!(yield* fs.exists(writingsFile))) {
        return yield* CompilerInputError.make({
          message: `writings database not found at ${writingsFile} — run 'bible egw sync' first`,
        });
      }

      const rows = yield* readVectorSource({
        filename: writingsFile,
        // `0` is §10's deliberate "whole corpus" act, expressed as the absence
        // of a cap rather than as a sentinel the reader has to carry.
        limit: Option.liftPredicate(args.limit, (value) => value > 0),
      });
      if (rows.length === 0) {
        return yield* CompilerInputError.make({
          message: `no EGW-scope paragraphs in ${writingsFile}`,
        });
      }

      // The same adapter the CLI searches with, so the document side and the
      // query side are embedded by one implementation. An index built by a
      // separate embedding path would agree with the query embedder only by
      // luck, and the fingerprint check cannot detect that — both would report
      // the same pinned string.
      //
      // It embeds through `embedDocument`, not `embedQuery`. EmbeddingGemma is
      // asymmetric: the two sides carry different task prefixes, and a corpus
      // embedded under the *query* prefix lands in the query region of the
      // space — every paragraph then sits equally close to every query, and the
      // ranking degrades to noise with no error anywhere.
      yield* fs.makeDirectory(path.dirname(args.out), { recursive: true });
      const vectors = yield* embedAllResumable(rows, args.out);

      const buffer = encodeVectorIndex({
        fingerprint: MODEL_FINGERPRINT,
        manifest: VectorManifest.make({
          books: bookRanges(rows),
          paragraphIds: paragraphIds(rows),
        }),
        vectors,
      });

      yield* fs.writeFile(args.out, new Uint8Array(buffer));
      yield* clearCheckpoint(args.out);

      const manifest = {
        path: args.out,
        fingerprint: MODEL_FINGERPRINT,
        dimensions: DIMENSIONS,
        vectors: rows.length,
        books: bookRanges(rows).length,
        bytes: buffer.byteLength,
        partial: args.limit !== 0,
      };
      if (args.json) {
        yield* Console.log(yield* encodeJson(manifest));
        return;
      }
      yield* Console.log(`✓ ${manifest.path}`);
      yield* Console.log(`  fingerprint  ${manifest.fingerprint}`);
      yield* Console.log(
        `  vectors      ${String(manifest.vectors)} × ${String(DIMENSIONS)}d int8`,
      );
      yield* Console.log(`  books        ${String(manifest.books)}`);
      yield* Console.log(`  size         ${String(manifest.bytes)} bytes`);
      if (manifest.partial) {
        yield* Console.error(``);
        yield* Console.error(
          `⚠ PARTIAL index: ${String(rows.length)} of the EGW scope, from --limit ${String(args.limit)}.`,
        );
        yield* Console.error(
          `  Search will find only these paragraphs. Use --limit 0 for a release.`,
        );
      }
    }).pipe(Effect.provide(layerBunEmbedder)),
);

const cli = Command.run(buildVectors, { version: '1.0.0' });

cli.pipe(
  Effect.tapCause((cause) =>
    Console.error(`build:vectors failed\n${Cause.pretty(cause)}`).pipe(Effect.ignore),
  ),
  Effect.provide(BunServices.layer),
  Effect.scoped,
  BunRuntime.runMain,
);
