/** §3.6's **install** in the browser, end to end (round-4 F1).
 *
 *  The other suite in this directory proves the *decision* crosses the worker's
 *  port. What it could not prove is the step after it: that accepting the offer
 *  installs anything. It did not.
 *
 *  Two independent reasons, and the fix is one wiring change plus one route:
 *
 *   1. `layerProcedureServer` built its `CorpusSupply` from the writings source
 *      alone, so `topics` was registered nowhere in it. `installFrom` resolves
 *      the corpus through the registry the supply was built with, found
 *      nothing, and the update reported success while the reader's store stayed
 *      exactly as it was.
 *   2. Even wired, the browser's release source always read the *pinned* asset
 *      route. A worker cannot fetch the release host itself — GitHub releases
 *      send no CORS headers — so §3.6's runtime leg needs an address it can
 *      reach that carries the address the manifest named, which is what
 *      `/api/content/artifact` is.
 *
 *  So this file drives the whole chain: a manifest entry, `installFrom`, the
 *  **real** artifact proxy handler over a real socket, the real browser
 *  installer, the real generation store, and then asks the store what it holds.
 *  A test that stubbed the fetch would pass against defect (2), and a test that
 *  built its own supply would pass against defect (1) — so neither is stubbed.
 */

import {
  corpusGeneration,
  corpusStorageIdentity,
  CorpusSupply,
  TopicsArtifact,
} from '@bible/core/corpus-supply';
import { Effect, Layer, Option, Stream } from 'effect';
import { describe, expect, it } from 'effect-bun-test';
import { HttpServerResponse } from 'effect/unstable/http';

import {
  artifactRequestFrom,
  contentArtifactResponse,
} from '../../server/content-artifact-proxy.js';
import { layerBrowserFileArtifacts } from './corpus-artifact-database.js';
import { makeCorpusGenerationStore } from './corpus-generation-store.js';
import type { DatabaseFileDownloader } from './database-file-downloader.js';
import type { GenerationRegistry, GenerationRegistryStore } from './generation-marker.js';
import type { SqliteDatabase, SqliteDatabaseFamily, SqliteRow } from './sqlite-database.js';

/** The bytes the release host serves, and the digest the manifest states for
 *  them. Short, because what is under test is the path they take. */
const ARTIFACT_BYTES = 'the offered topics artifact';
const ARTIFACT_DIGEST = `sha256:${Bun.SHA256.hash(ARTIFACT_BYTES, 'hex')}`;

/** OPFS as this test needs it: filename to `meta` rows, plus what each
 *  generation's install actually received off the wire. The second is the whole
 *  point — a browser that installed the *pinned* asset instead of the offered
 *  one would still end up with a generation, just the wrong bytes in it. */
interface Storage {
  readonly meta: Map<string, Map<string, string>>;
  readonly bytes: Map<string, string>;
}

const makeDatabase = (storage: Storage, target: () => string): SqliteDatabase => {
  const rowsFor = (): Map<string, string> => {
    const filename = target();
    return Option.match(Option.fromUndefinedOr(storage.meta.get(filename)), {
      onNone: () => {
        const created = new Map<string, string>();
        storage.meta.set(filename, created);
        return created;
      },
      onSome: (existing) => existing,
    });
  };
  return {
    isOpen: false,
    open: () => Effect.void,
    close: Effect.void,
    query: (sql) =>
      Effect.sync((): readonly SqliteRow[] => {
        if (sql === 'PRAGMA integrity_check') return [{ integrity_check: 'ok' }];
        if (sql.includes('FROM meta')) {
          return [...rowsFor()].map(([key, value]) => ({ key, value }));
        }
        return [{ count: 1 }];
      }),
    values: () => Effect.succeed([]),
    write: (sql, params) =>
      Effect.sync(() => {
        const rows = rowsFor();
        if (sql.startsWith('DELETE FROM meta')) {
          rows.delete(String(params?.[0]));
          return 1;
        }
        rows.set(String(params?.[0]), String(params?.[1]));
        return 1;
      }),
    exec: () => Effect.void,
  };
};

/** The release host and the same-origin server, on one socket.
 *
 *  `/release/*` is the upstream the manifest points at; everything else is the
 *  **shipped** `/api/content/artifact` handler, pointed at that upstream. Real
 *  HTTP between the two halves, because the claim is that a worker's fetch of
 *  a same-origin route ends in the offered bytes — and a handler called
 *  in-process would skip the fetch that is the reason the route exists. */
const serveThroughProxy = Effect.acquireRelease(
  Effect.sync(() =>
    // oxlint-disable-next-line effect/noGlobals -- the point of this suite is a real socket, not a platform service over one
    Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) => {
        const url = new URL(request.url);
        if (url.pathname === '/release/topics.db') {
          return new Response(ARTIFACT_BYTES, { status: 200 });
        }
        // The pinned asset route. Serving *different* bytes here is what makes
        // the address assertion real: an install that read this route would
        // fail the digest gate rather than quietly succeed.
        if (url.pathname === corpusStorageIdentity('topics').assetPath) {
          return new Response('the pinned topics artifact', { status: 200 });
        }
        const artifact = artifactRequestFrom(url);
        if (Option.isNone(artifact)) {
          return new Response('incomplete', { status: 400 });
        }
        return Effect.runPromise(
          contentArtifactResponse({
            request: artifact.value,
            headers: {},
            // The origins this suite bound. Production's list is the release
            // host alone; a fixture states its own rather than widening what
            // every install trusts (round-4 F4).
            origins: [url.origin],
            // oxlint-disable-next-line effect/noGlobals -- the injected upstream this route takes in production
            fetch: (address, init) => fetch(address, init),
          }).pipe(Effect.map((response) => HttpServerResponse.toWeb(response))),
        );
      },
    }),
  ),
  (server) => Effect.promise(() => server.stop(true)),
);

/** The worker's topics File Corpus, over the storage above and a downloader
 *  that records what the source actually streamed it. */
const topicsSupply = (input: { readonly storage: Storage; readonly origin: string }) => {
  let active = Option.none<string>();
  const activeDatabase = makeDatabase(input.storage, () => Option.getOrElse(active, () => 'none'));
  const databases: SqliteDatabaseFamily = {
    active: activeDatabase,
    candidate: (filename) => makeDatabase(input.storage, () => filename),
    activate: (filename) =>
      Effect.sync(() => {
        active = Option.some(filename);
      }),
    deactivate: Effect.sync(() => {
      active = Option.none();
    }),
    get activeFilename() {
      return active;
    },
  };
  let registry: GenerationRegistry = { active: Option.none(), managed: [] };
  const registryStore: GenerationRegistryStore = {
    read: Effect.sync(() => registry),
    write: (next) =>
      Effect.sync(() => {
        registry = next;
      }),
  };
  const downloader: DatabaseFileDownloader = {
    install: (bytes, filename, onProgress) =>
      Effect.gen(function* () {
        const chunks = yield* Stream.runCollect(bytes);
        const whole = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
        let offset = 0;
        for (const chunk of chunks) {
          whole.set(chunk, offset);
          offset += chunk.byteLength;
        }
        input.storage.bytes.set(filename, new TextDecoder().decode(whole));
        onProgress(100);
        return { bytes: whole.byteLength, digest: `sha256:${Bun.SHA256.hash(whole, 'hex')}` };
      }),
  };
  return CorpusSupply.layer.pipe(
    Layer.provide(
      layerBrowserFileArtifacts({
        artifact: TopicsArtifact,
        // No pinned release, which is the shipped state: §3.6's runtime leg is
        // the *only* way a browser gets a topics artifact today, so an install
        // that quietly fell back to the pinned route would install nothing at
        // all — which is exactly what it did.
        release: Option.none(),
        generations: makeCorpusGenerationStore({
          identity: corpusStorageIdentity('topics'),
          databases,
          registry: registryStore,
          discard: (filename) =>
            Effect.sync(() => {
              input.storage.meta.delete(filename);
              input.storage.bytes.delete(filename);
            }),
        }),
        downloader,
        verify: () => Effect.succeed(1),
        // The worker's own fetch of a same-origin route, absolute here because
        // `bun test` has no page origin to resolve against.
        fetch: (path) =>
          // oxlint-disable-next-line effect/noGlobals -- the worker's own same-origin fetch, which is exactly what this route exists to be reached by
          Effect.promise(() => fetch(`${input.origin}${path}`)).pipe(
            Effect.map((response) => ({
              status: response.status,
              bytes: Option.match(Option.fromNullOr(response.body), {
                onNone: () => Stream.empty,
                onSome: (body) =>
                  Stream.fromReadableStream({
                    evaluate: () => body,
                    onError: (cause: unknown) => cause,
                  }),
              }),
            })),
          ),
      }),
    ),
  );
};

/** Run an effect against a freshly wired `CorpusSupply`. The layer is provided
 *  at this function's own boundary rather than inside a test's generator. */
const withSupply = <A, E>(
  input: { readonly storage: Storage; readonly origin: string },
  ask: Effect.Effect<A, E, CorpusSupply>,
) => ask.pipe(Effect.provide(topicsSupply(input)));

describe('§3.6 install in the web worker', () => {
  it.scopedLive('installs the offered artifact through the same-origin proxy', () =>
    Effect.gen(function* () {
      const server = yield* serveThroughProxy;
      const origin = `http://127.0.0.1:${String(server.port)}`;
      const storage: Storage = { meta: new Map(), bytes: new Map() };

      const installed = yield* withSupply(
        { storage, origin },
        Effect.gen(function* () {
          const supply = yield* CorpusSupply;
          yield* supply.installFrom({
            corpus: 'topics',
            release: {
              url: `${origin}/release/topics.db`,
              revision: 'topics-v4',
              digest: ARTIFACT_DIGEST,
              size: ARTIFACT_BYTES.length,
              generation: Option.some(corpusGeneration(4)),
            },
          });
          return {
            provenance: yield* supply.installed('topics'),
            file: yield* supply.activeFile('topics'),
          };
        }),
      );

      // A generation is active, and it is the one the manifest offered.
      expect(Option.isSome(installed.file)).toBe(true);
      expect(
        Option.getOrUndefined(Option.map(installed.provenance, (p) => String(p.revision))),
      ).toBe('topics-v4');
      expect(
        Option.getOrUndefined(
          Option.flatMap(installed.provenance, (p) => Option.map(p.generation, Number)),
        ),
      ).toBe(4);

      // And it holds the **offered** bytes, not the pinned route's. This is the
      // assertion the whole file exists for: an install that read
      // `/api/assets/topics` would have landed the other string here, or — as
      // shipped, with no pin published — nothing at all.
      if (Option.isNone(installed.file)) return;
      expect(storage.bytes.get(installed.file.value)).toBe(ARTIFACT_BYTES);
    }),
  );

  /** The proxy is a fetcher for an address its client supplies, so the origin
   *  gate is the whole of its safety. An offer naming a host outside the
   *  allowlist must not be fetched at all — and the install must fail rather
   *  than activate something. */
  it.scopedLive('refuses an offer whose address is off the allowlist', () =>
    Effect.gen(function* () {
      const server = yield* serveThroughProxy;
      const origin = `http://127.0.0.1:${String(server.port)}`;
      const storage: Storage = { meta: new Map(), bytes: new Map() };

      const outcome = yield* withSupply(
        { storage, origin },
        Effect.gen(function* () {
          const supply = yield* CorpusSupply;
          yield* supply.installFrom({
            corpus: 'topics',
            release: {
              url: 'https://artifacts.attacker.test/topics.db',
              revision: 'topics-v4',
              digest: ARTIFACT_DIGEST,
              size: ARTIFACT_BYTES.length,
              generation: Option.some(corpusGeneration(4)),
            },
          });
        }),
      ).pipe(Effect.result);

      expect(outcome._tag).toBe('Failure');
      expect(storage.bytes.size).toBe(0);
    }),
  );
});
