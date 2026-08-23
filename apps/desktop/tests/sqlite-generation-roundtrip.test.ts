/** §3.6's release ordinal through the **real** SQLite provenance store
 *  (round-4 F2 / F7).
 *
 *  A SQLite artifact carries its own provenance: the installer writes
 *  `corpus_generation` into the candidate's `meta` table before the atomic
 *  swap, and the next launch reads it back out of the file. That round trip is
 *  what the generation-aware install decision rests on — a host that could not
 *  read the ordinal back would treat every runtime artifact as unnumbered and
 *  re-floor it with the compiled pin on the very next start.
 *
 *  It cannot be tested under `bun test`: `sqliteProvenanceStore` opens the
 *  candidate with `better-sqlite3`, whose NAPI binding hard-crashes the Bun
 *  canary this repo tests under, which is why every portable suite substitutes
 *  the store. This file runs under `test:electron-native` — the Node runtime
 *  Electron main actually ships — so the store under test is the shipped one,
 *  writing and reading a real file.
 */

import { NodeFileSystem } from '@effect/platform-node';
import { corpusGeneration, CorpusSupply, TopicsArtifact } from '@bible/core/corpus-supply';
import { layerNativeFileArtifacts } from '@bible/core/corpus-supply/node';
import { describe, expect, it } from '@effect/vitest';
import Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { Effect, FileSystem, Layer, Option } from 'effect';

/** A minimal topics artifact: the `meta` table the provenance store writes
 *  into, and nothing else the semantic verifier is asked about (it is a
 *  parameter below, for the reason every other suite makes it one). */
const artifactBytes = (): Buffer => {
  const database = new Database(':memory:');
  database.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  database.exec("INSERT INTO meta (key, value) VALUES ('schema_major', '1')");
  const bytes = database.serialize();
  database.close();
  return bytes;
};

const RELEASE = artifactBytes();
const DIGEST = `sha256:${createHash('sha256').update(RELEASE).digest('hex')}`;

/** One launch: a fresh service graph over a destination that persists. */
const host = (destination: string) =>
  CorpusSupply.layer.pipe(
    Layer.provide(
      layerNativeFileArtifacts({
        artifact: TopicsArtifact,
        destination,
        sources: [],
        // The shipped SQLite provenance store: no `provenanceStore` override,
        // which is the whole point of running this file under Electron's Node.
        fetch: () => Effect.succeed(new Response(new Uint8Array(RELEASE))),
        verify: () => Effect.succeed(1),
      }),
    ),
  );

/** §3.6's runtime install of generation 4, on one launch of the graph. The
 *  layer is provided at this function's own boundary rather than inside a
 *  test's generator. */
const installGeneration4 = (destination: string) =>
  Effect.flatMap(CorpusSupply, (supply) =>
    supply.installFrom({
      corpus: 'topics',
      release: {
        url: 'https://example.test/topics.db',
        revision: 'content-v4',
        digest: DIGEST,
        size: RELEASE.byteLength,
        generation: Option.some(corpusGeneration(4)),
      },
    }),
  ).pipe(Effect.provide(host(destination)), Effect.orDie);

/** What a *fresh* graph over the same path reports — a restart, as far as this
 *  pipeline is concerned. */
const provenanceAfterRestart = (destination: string) =>
  Effect.flatMap(CorpusSupply, (supply) => supply.installed('topics')).pipe(
    Effect.provide(host(destination)),
    Effect.orDie,
  );

/** One startup of the given wiring: what it activated, and what it left behind. */
const startupOver = (layer: Layer.Layer<CorpusSupply>) =>
  Effect.gen(function* () {
    const supply = yield* CorpusSupply;
    const receipt = yield* supply.ensure({ target: { _tag: 'file', corpus: 'topics' } });
    return { receipt, provenance: yield* supply.installed('topics') };
  }).pipe(Effect.provide(layer), Effect.orDie);

describe('native SQLite provenance store', () => {
  it.effect('round-trips a runtime generation through the artifact itself', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-sqlite-generation-' })
        .pipe(Effect.orDie);
      const destination = `${directory}/topics.db`;

      // §3.6 installs generation 4 at runtime.
      yield* installGeneration4(destination);

      // The ordinal is in the file, not in a process. A restart is a new graph
      // over the same path, which is what a restart is to this pipeline.
      const provenance = yield* provenanceAfterRestart(destination);

      expect(Option.getOrUndefined(Option.map(provenance, (p) => String(p.revision)))).toBe(
        'content-v4',
      );
      expect(
        Option.getOrUndefined(Option.flatMap(provenance, (p) => Option.map(p.generation, Number))),
      ).toBe(4);

      // And it is a real row in the artifact's own `meta` table — the thing a
      // future launch, a repair tool, or a support dump can read.
      const opened = new Database(destination, { readonly: true });
      const row = opened.prepare("SELECT value FROM meta WHERE key = 'corpus_generation'").get();
      opened.close();
      expect(row).toEqual({ value: '4' });
    }).pipe(Effect.scoped, Effect.provide(NodeFileSystem.layer)),
  );

  /** The other half of F2, on the SQLite side: a startup whose compiled pin is
   *  older than what §3.6 installed must leave the newer generation alone. */
  it.effect('startup does not re-floor a newer runtime generation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-sqlite-generation-' })
        .pipe(Effect.orDie);
      const destination = `${directory}/topics.db`;

      yield* installGeneration4(destination);

      // A launch whose compiled pin is generation 3 — an older app version, or
      // the same one that shipped before the runtime release.
      const pinned = CorpusSupply.layer.pipe(
        Layer.provide(
          layerNativeFileArtifacts({
            artifact: TopicsArtifact,
            destination,
            sources: [
              {
                kind: 'release',
                url: 'https://example.test/topics-v3.db',
                revision: 'content-v3',
                digest: DIGEST,
                size: RELEASE.byteLength,
                generation: Option.some(corpusGeneration(3)),
              },
            ],
            fetch: () => Effect.succeed(new Response(new Uint8Array(RELEASE))),
            verify: () => Effect.succeed(1),
          }),
        ),
      );

      const after = yield* startupOver(pinned);

      expect(after.receipt.activated).toEqual([]);
      expect(Option.getOrUndefined(Option.map(after.provenance, (p) => String(p.revision)))).toBe(
        'content-v4',
      );
    }).pipe(Effect.scoped, Effect.provide(NodeFileSystem.layer)),
  );
});
