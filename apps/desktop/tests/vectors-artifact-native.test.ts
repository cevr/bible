/** §9.2's vector index through the *production* File Corpus lifecycle, on the
 *  runtime Electron main actually ships (round-2 B1, F6 native).
 *
 *  What was broken, and why nothing caught it: `layerNativeFileArtifacts`
 *  defaulted every corpus to the SQLite provenance store, which writes `meta`
 *  rows *into* the artifact. §9.2's index is a flat binary with no `meta` table
 *  and no room for one, so `better-sqlite3` failed to open the candidate
 *  `vectors.bvi.building` and the install aborted **before** the rename —
 *  meaning `CorpusSupply.ensure({ target: Target.vectors() })` on desktop could
 *  never activate a generation. Desktop's own catch-and-warn posture then turned
 *  that into a log line, so the app started, searched lexically, and reported
 *  `absent` exactly as it does on a machine with no index at all. No result
 *  assertion could tell the two apart.
 *
 *  So this test is deliberately about the *lifecycle*, not about a result shape:
 *  a temp userData directory, the real `layerNativeVectorsArtifacts`, the real
 *  `verifyVectorIndexFile` parser gate, the real atomic swap, and then the check
 *  that `SearchService` scans exactly the file that was activated.
 *
 *  It runs in the `test:electron-native` lane because the shipped installer
 *  imports `better-sqlite3` for the *other* corpora's provenance store, and
 *  `bun test` substitutes a `node:sqlite` build that cannot load it — the same
 *  reason `wiki-artifact-native.test.ts` lives in that lane.
 */

import { NodeFileSystem } from '@effect/platform-node';
import { CorpusSupply, Target } from '@bible/core/corpus-supply';
import { layerNativeVectorsArtifacts } from '@bible/core/corpus-supply/node';
import {
  layerFileVectorIndexBytes,
  loadVectorIndex,
  MODEL_FINGERPRINT,
  SearchCorpusSources,
  SearchQuery,
  SearchService,
  encodeVectorIndex,
  VectorBookRange,
  VectorManifest,
  DIMENSIONS,
  quantize,
} from '@bible/core/search';
import { describe, expect, it } from '@effect/vitest';
import { Effect, FileSystem, Layer, Option } from 'effect';

/** A small but *real* index: the shipped writer, so the bytes this installs are
 *  bytes the shipped parser is the authority on. A hand-built buffer would only
 *  prove the test can imitate the format. */
const syntheticIndex = (input: {
  readonly fingerprint?: string;
  readonly ids?: readonly string[];
}): Uint8Array => {
  const ids = input.ids ?? ['GC:GC 425.1', 'GC:GC 425.2', 'DA:DA 311.5'];
  const vectors = new Int8Array(ids.length * DIMENSIONS);
  ids.forEach((_id, row) => {
    const values = Array.from({ length: DIMENSIONS }, (_value, axis) =>
      Math.sin((row + 1) * (axis + 1)),
    );
    let norm = 0;
    for (const value of values) norm += value * value;
    const unit = values.map((value) => value / Math.sqrt(norm));
    vectors.set(quantize(unit), row * DIMENSIONS);
  });
  const gc = ids.filter((id) => id.startsWith('GC:')).length;
  const buffer = encodeVectorIndex({
    fingerprint: input.fingerprint ?? MODEL_FINGERPRINT,
    manifest: VectorManifest.make({
      books: [
        VectorBookRange.make({ bookCode: 'GC', offset: 0, count: gc }),
        VectorBookRange.make({ bookCode: 'DA', offset: gc, count: ids.length - gc }),
      ],
      paragraphIds: ids,
    }),
    vectors,
  });
  return new Uint8Array(buffer);
};

/** The desktop wiring, verbatim in shape: a temp `userData`, the workspace
 *  source slot pointing at a file on disk, no release pin. */
const install = (input: { readonly userData: string; readonly sourceFile: string }) =>
  Effect.gen(function* () {
    const supply = yield* CorpusSupply;
    const receipt = yield* supply.ensure({ target: Target.vectors() });
    return {
      activation: Option.fromUndefinedOr(
        receipt.activated.find((activation) => activation.corpus === 'vectors'),
      ),
      // Where the host reads the generation this install activated. Electron
      // main asks the same question (`supply.activeFile('vectors')`) rather
      // than assuming the destination path, because a flat artifact now lands
      // under a versioned filename behind one atomic pointer (round-4 B2).
      activeFile: yield* supply.activeFile('vectors'),
    };
  }).pipe(
    Effect.provide(
      CorpusSupply.layer.pipe(
        Layer.provide(
          layerNativeVectorsArtifacts({
            destination: `${input.userData}/vectors.bvi`,
            sources: [{ kind: 'workspace', path: input.sourceFile, label: 'workspace' }],
          }),
        ),
      ),
    ),
  );

describe('electron main vectors artifact (native)', () => {
  it.effect('installs and activates a flat BVI through the production lifecycle', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const userData = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-electron-vectors-' })
        .pipe(Effect.orDie);
      const sourceFile = `${userData}/source-vectors.bvi`;
      const destination = `${userData}/vectors.bvi`;
      yield* fs.writeFile(sourceFile, syntheticIndex({})).pipe(Effect.orDie);

      const { activation, activeFile } = yield* install({ userData, sourceFile }).pipe(
        Effect.orDie,
      );

      // The whole point: an activation, not a caught warning. Against the
      // SQLite provenance store this is `None` — the install fails opening the
      // candidate as a database, long before the rename.
      expect(Option.isSome(activation)).toBe(true);
      if (Option.isNone(activation)) return;
      expect(activation.value.corpus).toBe('vectors');
      // The verifier's own count, which is the shipped parser's `index.count`.
      expect(activation.value.installed).toBe(3);

      // The atomic swap landed. The bytes are under a versioned filename and
      // the sidecar beside the destination is the pointer that names it — one
      // rename, last, is what makes a generation active (round-4 B2). The
      // destination path itself holds nothing: a reader that assumed it would
      // find nothing there, which is why `activeFile` exists.
      expect(Option.isSome(activeFile)).toBe(true);
      if (Option.isNone(activeFile)) return;
      expect(activeFile.value.startsWith(`${destination}.g-`)).toBe(true);
      expect(yield* fs.exists(activeFile.value).pipe(Effect.orDie)).toBe(true);
      expect(yield* fs.exists(destination).pipe(Effect.orDie)).toBe(false);
      expect(yield* fs.exists(`${destination}.building`).pipe(Effect.orDie)).toBe(false);
      expect(yield* fs.exists(`${destination}.building.provenance.json`).pipe(Effect.orDie)).toBe(
        false,
      );
      expect(yield* fs.exists(`${destination}.provenance.json`).pipe(Effect.orDie)).toBe(true);

      // The installed file is byte-identical to the source: a flat artifact must
      // not be mutated by the install, and the SQLite store's whole failure mode
      // was that it tried to.
      const installed = yield* fs.readFile(activeFile.value).pipe(Effect.orDie);
      const source = yield* fs.readFile(sourceFile).pipe(Effect.orDie);
      expect(installed.byteLength).toBe(source.byteLength);
      expect(Buffer.from(installed).equals(Buffer.from(source))).toBe(true);

      // And the search layer scans exactly what was activated: the same three
      // paragraph ids, under the fingerprint this build embeds with.
      const loaded = yield* loadVectorIndex.pipe(
        Effect.provide(layerFileVectorIndexBytes(activeFile.value)),
      );
      expect(loaded._tag).toBe('index');
      if (loaded._tag !== 'index') return;
      expect(loaded.index.count).toBe(3);
      expect(loaded.index.fingerprint).toBe(MODEL_FINGERPRINT);
      expect([...loaded.index.manifest.paragraphIds]).toEqual([
        'GC:GC 425.1',
        'GC:GC 425.2',
        'DA:DA 311.5',
      ]);

      // A second `ensure` over the same source is a no-op rather than a second
      // install: the sidecar provenance is readable, so `readCurrent` reports
      // the generation that is already active.
      const again = yield* install({ userData, sourceFile }).pipe(Effect.orDie);
      expect(Option.isNone(again.activation)).toBe(true);
      // And the pointer still names the same generation — a no-op install must
      // not have retired and re-landed the bytes.
      expect(again.activeFile).toEqual(activeFile);

      // The service composes over the activated file, so a query built against
      // this host reaches the index the installer swapped in. `NotWired`
      // sources answer with no rows, which is the point: what is under test is
      // that the layer *built* against the activated file, which it cannot do
      // if the file was never activated.
      const search = SearchService.Live.pipe(
        Layer.provide(SearchCorpusSources.NotWired),
        Layer.provide(layerFileVectorIndexBytes(activeFile.value)),
      );
      yield* Effect.gen(function* () {
        const service = yield* SearchService;
        const result = yield* service.query(
          SearchQuery.make({
            text: 'what happens at the close of probation',
            scope: Option.none(),
            bookCode: Option.none(),
            limit: Option.none(),
          }),
        );
        expect(result.query).toBe('what happens at the close of probation');
      }).pipe(Effect.provide(search));
    }).pipe(Effect.provide(NodeFileSystem.layer), Effect.scoped),
  );

  it.effect('refuses a foreign-fingerprint index before the swap', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const userData = yield* fs
        .makeTempDirectoryScoped({ prefix: 'bible-electron-vectors-bad-' })
        .pipe(Effect.orDie);
      const sourceFile = `${userData}/source-vectors.bvi`;
      const destination = `${userData}/vectors.bvi`;
      // Intact bytes, correct format, wrong model. The digest gate cannot see
      // this; the semantic verifier is the only thing that can, and §3.5
      // requires it to run before activation rather than at read time.
      yield* fs
        .writeFile(sourceFile, syntheticIndex({ fingerprint: 'other-model/512d/int8' }))
        .pipe(Effect.orDie);

      const outcome = yield* Effect.exit(install({ userData, sourceFile }));

      // Either a failure or no activation — what must *not* happen is a swap.
      const activated = outcome._tag === 'Success' && Option.isSome(outcome.value.activation);
      expect(activated).toBe(false);
      // Nothing was left behind: no active file, no candidate, no sidecar.
      expect(yield* fs.exists(destination).pipe(Effect.orDie)).toBe(false);
      expect(yield* fs.exists(`${destination}.building`).pipe(Effect.orDie)).toBe(false);
      expect(yield* fs.exists(`${destination}.provenance.json`).pipe(Effect.orDie)).toBe(false);
      expect(yield* fs.exists(`${destination}.building.provenance.json`).pipe(Effect.orDie)).toBe(
        false,
      );
    }).pipe(Effect.provide(NodeFileSystem.layer), Effect.scoped),
  );
});
