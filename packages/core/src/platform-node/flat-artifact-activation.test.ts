/** §3.6's activation for a **flat** artifact: one atomic pointer, and a startup
 *  that will not re-floor a newer generation.
 *
 *  Two round-4 findings meet in this file, and both are about the same
 *  mechanism — that what a host reads is decided by a *pointer*, not by a path
 *  it assumed.
 *
 *  - **B2.** A flat artifact has no `meta` table, so its provenance lives in a
 *    sidecar. Activating it used to be two renames over two fixed paths, and a
 *    crash between them left the old bytes wearing the new provenance — a wrong
 *    receipt rather than an absent one, and nothing could tell, because the
 *    sidecar was believed rather than checked. The bytes now land under a
 *    digest-derived filename and the sidecar is renamed last, so the pointer's
 *    rename *is* the activation; and `current` verifies the file against the
 *    digest the pointer states.
 *  - **F2.** `ensure` walks the compiled source list in priority order, and a
 *    packaged copy outranks a release. Right for a fresh machine; wrong for a
 *    host that accepted §3.6's offer last week, which launch N+1 silently put
 *    back a version. The generation ordinal now travels on the candidate, and a
 *    candidate that does not outrank what is installed is skipped.
 *
 *  Everything is the shipped native lifecycle over real files: the real
 *  installer, the **real** `sidecarProvenanceStore`, real renames. Only the
 *  semantic verifier is a parameter, which it already was — the flat verifier
 *  is §9.2's index parser and these bytes are not an index.
 */

import { BunFileSystem } from '@effect/platform-bun';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { Effect, FileSystem, Layer, Option } from 'effect';
import { describe, expect, it } from 'effect-bun-test';

import { VectorsArtifact } from '../search/vector-artifact.js';
import { corpusGeneration } from '../corpus-supply/model.js';
import { CorpusSupply } from '../corpus-supply/service.js';
import { layerNativeFileArtifacts, type NativeFileArtifactSource } from './bible-artifact.js';

const digestOf = (bytes: string): string =>
  `sha256:${bytesToHex(sha256(new TextEncoder().encode(bytes)))}`;

/** The versioned filename an activation lands on, derived exactly as the
 *  installer derives it — from the digest of the bytes. Restated here rather
 *  than exported from the adapter, because the claim is that a *reader* can
 *  find the file from the digest alone, which an exported helper would hide. */
const generationPath = (destination: string, bytes: string): string =>
  `${destination}.g-${digestOf(bytes).slice('sha256:'.length, 'sha256:'.length + 12)}`;

const sidecarPath = (filename: string): string => `${filename}.provenance.json`;

/** One host wired the way Electron main wires §9.2's index: the flat layout,
 *  the real sidecar store, and whichever sources the case declares. */
const hostFor = (input: {
  readonly destination: string;
  readonly sources: readonly NativeFileArtifactSource[];
  readonly bytesFor: (url: string) => string;
}): Layer.Layer<CorpusSupply> =>
  CorpusSupply.layer.pipe(
    Layer.provide(
      layerNativeFileArtifacts({
        artifact: VectorsArtifact,
        destination: input.destination,
        sources: input.sources,
        layout: 'flat',
        fetch: (url) => Effect.succeed(new Response(input.bytesFor(url))),
        // §9.2's parser stands in: these bytes are not an index, and what is
        // under test is the activation rather than the format gate. The digest
        // and size checks above it are the shipped ones.
        verify: () => Effect.succeed(1),
      }),
    ),
  );

const releaseAt = (input: {
  readonly url: string;
  readonly bytes: string;
  readonly revision: string;
  readonly generation?: number;
}): NativeFileArtifactSource => ({
  kind: 'release',
  url: input.url,
  revision: input.revision,
  digest: digestOf(input.bytes),
  size: input.bytes.length,
  generation: Option.map(Option.fromUndefinedOr(input.generation), corpusGeneration),
});

const RUNTIME_BYTES = 'the runtime generation four index';
const PIN_BYTES = 'the compiled pin generation three index';

describe('§3.6 flat artifact activation', () => {
  const test = it.scopedLive.layer(BunFileSystem.layer);

  /** **The pointer names what the host reads** (round-4 B2).
   *
   *  The bytes never land on the destination path itself: they land under a
   *  name derived from their digest, and the sidecar beside the destination is
   *  what says which of those names is live. */
  test('activates a versioned file behind one pointer', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;

      const active = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        yield* supply.ensure({ target: { _tag: 'file', corpus: 'vectors' } });
        return yield* supply.activeFile('vectors');
      }).pipe(
        Effect.provide(
          hostFor({
            destination,
            sources: [
              releaseAt({
                url: 'https://example.test/vectors.bvi',
                bytes: RUNTIME_BYTES,
                revision: 'vectors-v4',
                generation: 4,
              }),
            ],
            bytesFor: () => RUNTIME_BYTES,
          }),
        ),
      );

      const versioned = generationPath(destination, RUNTIME_BYTES);
      expect(Option.getOrUndefined(active)).toBe(versioned);
      expect(yield* fs.readFileString(versioned)).toBe(RUNTIME_BYTES);
      // The pointer is beside the destination, where a host looks; the bytes
      // are not *at* the destination, which is what makes the rename atomic.
      expect(yield* fs.exists(sidecarPath(destination))).toBe(true);
      expect(yield* fs.exists(destination)).toBe(false);
    }));

  /** **The crash window** (round-4 B2).
   *
   *  The install is simulated at the point the old order failed: the artifact
   *  bytes are in place under their versioned name, and the pointer has not
   *  been renamed yet. A host that started here must report the generation it
   *  already had — not the one whose bytes happen to be on disk, and not
   *  nothing at all.
   *
   *  Before versioned filenames this state was unreachable to observe: the new
   *  bytes had already replaced the destination, so "the old generation" no
   *  longer existed anywhere to be reported. */
  test('a torn install reports the generation the pointer still names', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;
      const pinned = releaseAt({
        url: 'https://example.test/pin.bvi',
        bytes: PIN_BYTES,
        revision: 'vectors-v3',
        generation: 3,
      });

      // A host with generation 3 activated, cleanly.
      const host = hostFor({ destination, sources: [pinned], bytesFor: () => PIN_BYTES });
      yield* Effect.flatMap(CorpusSupply, (supply) =>
        supply.ensure({ target: { _tag: 'file', corpus: 'vectors' } }),
      ).pipe(Effect.provide(host));

      // The crash: the newer generation's bytes are in place under their own
      // versioned name, and the pointer rename never happened.
      yield* fs.writeFileString(generationPath(destination, RUNTIME_BYTES), RUNTIME_BYTES);

      const torn = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        return {
          provenance: yield* supply.installed('vectors'),
          file: yield* supply.activeFile('vectors'),
        };
      }).pipe(Effect.provide(host));

      // The old generation, whole: its revision, its ordinal, and its file.
      expect(Option.getOrUndefined(Option.map(torn.provenance, (p) => String(p.revision)))).toBe(
        'vectors-v3',
      );
      expect(
        Option.getOrUndefined(
          Option.flatMap(torn.provenance, (p) => Option.map(p.generation, Number)),
        ),
      ).toBe(3);
      expect(Option.getOrUndefined(torn.file)).toBe(generationPath(destination, PIN_BYTES));
    }));

  /** The pointer is **checked**, not believed. A sidecar naming a file whose
   *  bytes are not the ones it describes is not an activation, and a host must
   *  say it has none rather than report a generation it does not hold. */
  test('a pointer whose file does not match its digest reports no generation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;
      const pinned = releaseAt({
        url: 'https://example.test/pin.bvi',
        bytes: PIN_BYTES,
        revision: 'vectors-v3',
        generation: 3,
      });
      const host = hostFor({ destination, sources: [pinned], bytesFor: () => PIN_BYTES });

      yield* Effect.flatMap(CorpusSupply, (supply) =>
        supply.ensure({ target: { _tag: 'file', corpus: 'vectors' } }),
      ).pipe(Effect.provide(host));

      // The file the live pointer names, overwritten with something else — a
      // truncated write, a half-copied file, bit rot.
      yield* fs.writeFileString(generationPath(destination, PIN_BYTES), 'not that generation');

      const provenance = yield* Effect.flatMap(CorpusSupply, (supply) =>
        supply.installed('vectors'),
      ).pipe(Effect.provide(host));

      expect(Option.isNone(provenance)).toBe(true);
    }));

  /** **A newer runtime generation survives a restart** (round-4 F2).
   *
   *  The exact scenario the finding names: runtime generation 4 is active, the
   *  app restarts, and `ensure` runs against a compiled pin at generation 3.
   *  Startup must install nothing and leave generation 4 serving.
   *
   *  The restart is a *new* service graph over the same directory, which is
   *  what a restart is to this pipeline — the pointer on disk is the only thing
   *  that carries across. */
  test('startup does not re-floor a runtime generation with an older pin', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;

      // Launch one: §3.6 installs runtime generation 4.
      yield* Effect.flatMap(CorpusSupply, (supply) =>
        supply.installFrom({
          corpus: 'vectors',
          release: {
            url: 'https://example.test/runtime.bvi',
            revision: 'vectors-v4',
            digest: digestOf(RUNTIME_BYTES),
            size: RUNTIME_BYTES.length,
            generation: Option.some(corpusGeneration(4)),
          },
        }),
      ).pipe(Effect.provide(hostFor({ destination, sources: [], bytesFor: () => RUNTIME_BYTES })));

      // Launch two: a fresh graph whose compiled pin is generation 3.
      const restarted = hostFor({
        destination,
        sources: [
          releaseAt({
            url: 'https://example.test/pin.bvi',
            bytes: PIN_BYTES,
            revision: 'vectors-v3',
            generation: 3,
          }),
        ],
        bytesFor: () => PIN_BYTES,
      });
      const after = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        const receipt = yield* supply.ensure({ target: { _tag: 'file', corpus: 'vectors' } });
        return {
          receipt,
          provenance: yield* supply.installed('vectors'),
          file: yield* supply.activeFile('vectors'),
        };
      }).pipe(Effect.provide(restarted));

      // Nothing was activated, and generation 4 is still what this host reads.
      expect(after.receipt.activated).toEqual([]);
      expect(
        Option.getOrUndefined(
          Option.flatMap(after.provenance, (p) => Option.map(p.generation, Number)),
        ),
      ).toBe(4);
      expect(Option.getOrUndefined(after.file)).toBe(generationPath(destination, RUNTIME_BYTES));
      expect(yield* fs.readFileString(generationPath(destination, RUNTIME_BYTES))).toBe(
        RUNTIME_BYTES,
      );
      // And the pin's bytes were never even fetched onto this machine.
      expect(yield* fs.exists(generationPath(destination, PIN_BYTES))).toBe(false);
    }));

  /** The same rule against a **local** source, which is the shape every host
   *  actually ships today: a packaged copy states no ordinal at all, and a
   *  source that is not a published content version cannot outrank one. */
  test('a local source does not replace a runtime generation', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;
      const packaged = `${directory}/packaged.bvi`;
      yield* fs.writeFileString(packaged, PIN_BYTES);

      yield* Effect.flatMap(CorpusSupply, (supply) =>
        supply.installFrom({
          corpus: 'vectors',
          release: {
            url: 'https://example.test/runtime.bvi',
            revision: 'vectors-v4',
            digest: digestOf(RUNTIME_BYTES),
            size: RUNTIME_BYTES.length,
            generation: Option.some(corpusGeneration(4)),
          },
        }),
      ).pipe(Effect.provide(hostFor({ destination, sources: [], bytesFor: () => RUNTIME_BYTES })));

      const after = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        yield* supply.ensure({ target: { _tag: 'file', corpus: 'vectors' } });
        return yield* supply.installed('vectors');
      }).pipe(
        Effect.provide(
          hostFor({
            destination,
            sources: [{ kind: 'packaged', path: packaged, label: 'packaged' }],
            bytesFor: () => PIN_BYTES,
          }),
        ),
      );

      expect(Option.getOrUndefined(Option.map(after, (p) => String(p.revision)))).toBe(
        'vectors-v4',
      );
    }));

  /** The other direction, so the rule is a comparison rather than a refusal to
   *  ever install again: a pin **above** what is installed is what a fresh app
   *  version ships, and it must take. */
  test('a pin above the installed generation still installs', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'flat-activation-' });
      const destination = `${directory}/vectors.bvi`;

      yield* Effect.flatMap(CorpusSupply, (supply) =>
        supply.installFrom({
          corpus: 'vectors',
          release: {
            url: 'https://example.test/old.bvi',
            revision: 'vectors-v3',
            digest: digestOf(PIN_BYTES),
            size: PIN_BYTES.length,
            generation: Option.some(corpusGeneration(3)),
          },
        }),
      ).pipe(Effect.provide(hostFor({ destination, sources: [], bytesFor: () => PIN_BYTES })));

      const after = yield* Effect.gen(function* () {
        const supply = yield* CorpusSupply;
        yield* supply.ensure({ target: { _tag: 'file', corpus: 'vectors' } });
        return yield* supply.installed('vectors');
      }).pipe(
        Effect.provide(
          hostFor({
            destination,
            sources: [
              releaseAt({
                url: 'https://example.test/new.bvi',
                bytes: RUNTIME_BYTES,
                revision: 'vectors-v5',
                generation: 5,
              }),
            ],
            bytesFor: () => RUNTIME_BYTES,
          }),
        ),
      );

      expect(Option.getOrUndefined(Option.map(after, (p) => String(p.revision)))).toBe(
        'vectors-v5',
      );
      // The generation it replaced was retired, only after the pointer that
      // named it was gone.
      expect(yield* fs.exists(generationPath(destination, PIN_BYTES))).toBe(false);
    }));
});
