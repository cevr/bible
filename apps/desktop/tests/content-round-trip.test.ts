/** §10 Milestone 9 on Electron main: **the update decision crosses this host's
 *  real port unchanged, and this host's adapter answers the same table the
 *  other two do.**
 *
 *  `packages/core/src/content-update/*.test.ts` proves the policy over
 *  `RpcTest`, an in-memory client. What that cannot see is this boundary: §3.6's
 *  status is the most `Option`-dense value the group carries — `installed` is an
 *  `Option`, `floor.pinned` is an `Option` inside a nested class, and `refused`
 *  carries a whole manifest entry — so an encoding that survives `RpcTest` and
 *  not this transport would leave that suite green and this one red.
 *
 *  Paired with `apps/web/src/workers/content-round-trip.test.ts`, which makes
 *  the identical claim on the worker's `MessagePort`, and with
 *  `packages/cli/test/commands/topics.test.ts`, which makes it on the CLI's
 *  stdout. Those three plus `manifest-http.test.ts` are §10 M9's "all three
 *  refuse the same schema-major overrun", compared against one fixture rather
 *  than three copies of it.
 */

import {
  ADAPTER_EXPECTATIONS,
  ADAPTER_ROUTES,
  liveAdapterConformance,
  OVERRUN_REVISION,
  refusingContentUpdate,
} from '@bible/core/content-update/testing';
import * as NodeHttpClient from '@effect/platform-node/NodeHttpClient';
import { Database } from 'bun:sqlite';
import { NodeFileSystem } from '@effect/platform-node';
import {
  ContentActivation,
  ContentManifest,
  ContentManifestEntry,
  ContentManifestSource,
  ContentUpdate,
} from '@bible/core/content-update';
import {
  corpusGeneration,
  corpusRevision,
  CorpusSupply,
  TOPICS_SCHEMA_MAJOR,
  TopicsArtifact,
} from '@bible/core/corpus-supply';
import { layerNativeFileArtifacts } from '@bible/core/corpus-supply/node';
import { layerReloadOnActivation, WikiSectionSources } from '@bible/core/wiki';
import { layerBunReloadable } from '@bible/core/wiki/bun';
import { TopicService } from '@bible/core/topics';
import { BibleProcedureGroup } from '@bible/core/procedure';
import { procedureDependencies } from '@bible/core/procedure/testing';
import { describe, expect, it } from 'effect-bun-test';
import { Effect, Fiber, FileSystem, Layer, Option } from 'effect';
import type {
  FromClientEncoded,
  FromServerEncoded,
  RequestEncoded,
} from 'effect/unstable/rpc/RpcMessage';
import * as RpcClient from 'effect/unstable/rpc/RpcClient';

import {
  layerDesktopProcedureServer,
  type DesktopProcedureServerPort,
} from '../electron/procedure-server.js';
import { layerDesktopProcedureTransport } from '../src/procedure-client-protocol.js';

interface PortTraffic {
  readonly port: DesktopProcedureServerPort;
  readonly requests: () => readonly RequestEncoded[];
}

const instrumentedPort = (channel: MessageChannel): PortTraffic => {
  const requests: RequestEncoded[] = [];
  return {
    requests: () => requests,
    port: {
      subscribe: (listener) => {
        const onMessage = (event: MessageEvent<FromClientEncoded>) => {
          if (event.data._tag === 'Request') requests.push(event.data);
          listener(event.data);
        };
        channel.port2.addEventListener('message', onMessage);
        return () => channel.port2.removeEventListener('message', onMessage);
      },
      onClose: () => () => {},
      send: (message: FromServerEncoded) => channel.port2.postMessage(message),
      start: () => channel.port2.start(),
    },
  };
};

const client = RpcClient.make(BibleProcedureGroup);

const wired = Effect.gen(function* () {
  const channel = yield* Effect.acquireRelease(
    Effect.sync(() => new MessageChannel()),
    (active) =>
      Effect.sync(() => {
        active.port1.close();
        active.port2.close();
      }),
  );
  const traffic = instrumentedPort(channel);
  const server = yield* Effect.forkScoped(
    Layer.launch(
      layerDesktopProcedureServer(traffic.port).pipe(
        Layer.provide(procedureDependencies({ content: refusingContentUpdate })),
      ),
    ),
  );
  yield* Effect.addFinalizer(() => Fiber.interrupt(server));
  return { traffic, clientPort: channel.port1 };
});

/** The fixture cases as a real origin on loopback — loopback both because that
 *  is where a test server belongs and because the origin gate (round-3 F4)
 *  refuses anything else before the request, which would make every case read
 *  `offline` for the wrong reason. */
const serveFixtures = Effect.acquireRelease(
  Effect.sync(() => {
    const routes = new Map(ADAPTER_ROUTES);
    // oxlint-disable-next-line effect/noGlobals -- the point of this suite is a real socket, not a platform service over one
    return Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      fetch: (request) => {
        const route = Option.fromUndefinedOr(routes.get(new URL(request.url).pathname));
        return Option.match(route, {
          onNone: () => new Response('no such fixture', { status: 404 }),
          onSome: (found) => new Response(found.body, { status: found.status }),
        });
      },
    });
  }),
  (server) => Effect.promise(() => server.stop(true)),
);

/** One topics artifact carrying exactly one authored page.
 *
 *  The slug is the parameter, so "the content that exists only in the new
 *  artifact" is a slug the old file does not contain — an observable no stale
 *  SQLite connection can fake. */
const writeTopicsArtifact = (file: string, slug: string, title: string): void => {
  const database = new Database(file, { create: true });
  // The literal an empty AST array encodes to. Written out rather than encoded,
  // because this is a fixture writer filling a column, not a domain value
  // crossing a boundary.
  const empty = '[]';
  database.exec(`
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE topics (slug TEXT PRIMARY KEY, title TEXT NOT NULL, thesis_ast TEXT NOT NULL, body_ast TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE topic_aliases (alias TEXT PRIMARY KEY, display TEXT NOT NULL, slug TEXT NOT NULL, canonical INTEGER NOT NULL);
    CREATE TABLE topic_edges (from_slug TEXT NOT NULL, to_slug TEXT NOT NULL, kind TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (from_slug, to_slug, kind));
    CREATE TABLE topic_catalog_keys (slug TEXT PRIMARY KEY, catalog_id TEXT NOT NULL, matched_by TEXT NOT NULL);
    INSERT INTO meta (key, value) VALUES ('schema_major', '1');
  `);
  database
    .prepare(
      'INSERT INTO topics (slug, title, thesis_ast, body_ast, position) VALUES (?, ?, ?, ?, ?)',
    )
    .run(slug, title, empty, empty, 0);
  database.close();
  return;
};

describe('desktop runtime content updates', () => {
  /** The install case writes a real artifact through the real atomic swap, so
   *  it needs a real filesystem. Provided to the whole describe because the
   *  other cases neither need it nor are harmed by it. */
  const hosted = it.scopedLive.layer(NodeFileSystem.layer);
  it.scopedLive('carries the schema-major refusal across the port whole', () =>
    Effect.gen(function* () {
      const { traffic, clientPort } = yield* wired;

      const status = yield* Effect.gen(function* () {
        const procedures = yield* client;
        return yield* procedures['v1.content.status']({ corpus: 'topics' });
      }).pipe(Effect.provide(layerDesktopProcedureTransport(clientPort)));

      expect(status.decision._tag).toBe(ADAPTER_EXPECTATIONS.overrun);
      if (status.decision._tag !== 'refused') return;
      expect(status.decision.reason).toBe('schema-major');
      // The nested entry survived the encoder, not just the tag: a settings
      // entry has to name the version that needs a newer app.
      expect(String(status.decision.available.revision)).toBe(String(OVERRUN_REVISION));
      // And the two `Option` fields arrived as `Option`s rather than as the
      // `null` a lossy codec would leave behind.
      expect(Option.isNone(status.installed)).toBe(true);
      expect(Option.isNone(status.floor.pinned)).toBe(true);

      // One crossing for the whole status. A client that had to ask for the
      // installed revision separately would raise this.
      expect(traffic.requests().length).toBe(1);
      expect(traffic.requests()[0]?.tag).toBe('v1.content.status');
    }),
  );

  it.scopedLive('a refused update installs nothing and says so', () =>
    Effect.gen(function* () {
      const { clientPort } = yield* wired;

      const outcome = yield* Effect.gen(function* () {
        const procedures = yield* client;
        return yield* procedures['v1.content.update']({ corpus: 'topics' });
      }).pipe(Effect.provide(layerDesktopProcedureTransport(clientPort)));

      // §3.6: a refusal is a reported state, not an error the caller catches,
      // and it activates nothing.
      expect(Option.isNone(outcome.activated)).toBe(true);
      expect(outcome.status.decision._tag).toBe('refused');
    }),
  );

  /** The same single assertion `manifest-live.test.ts` and the web worker suite
   *  make, over **this host's real client** (round-3 F5).
   *
   *  Electron main composes `NodeHttpClient`, not `fetch`, and reads the
   *  manifest directly rather than through a proxy — so this is the only place
   *  the Node transport is exercised against §3.6's five outcomes. It ran
   *  against stub clients before, which meant the Node client itself was never
   *  in the picture and the "all three hosts" claim rested on one transport. */
  /** **The reader serves the new artifact, with no restart** (round-3 F3), over
   *  this host's real transport.
   *
   *  Everything in the path is production code: the shipped native installer
   *  and its atomic swap, the `immutable=1` SQLite driver Electron main opens
   *  with, the reloadable wiki seam main composes, the real RPC handlers, and
   *  the real `MessagePort` pair. Only the manifest and the release bytes are
   *  the test's.
   *
   *  The sequence is the finding: read a topic that exists **only in the new
   *  artifact** and get nothing; run `v1.content.update` across the port; read
   *  the same topic again and get it. Before the fix the second read returned
   *  the first answer forever, because the connection held the old inode and
   *  nothing reopened it — the update reported success the whole time. */
  hosted('serves the newly installed artifact over the real port, without a restart', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'desktop-content-' });
      const destination = `${directory}/topics.db`;
      const release = `${directory}/release.db`;

      // What this host has now, and what the release will replace it with.
      yield* Effect.sync(() => writeTopicsArtifact(destination, 'sanctuary', 'The Sanctuary'));
      yield* Effect.sync(() =>
        writeTopicsArtifact(release, 'investigative-judgment', 'The Judgment'),
      );
      // Read through the platform's own filesystem service, like everything
      // else in this suite. `Uint8Array` is not a `BodyInit`, so the buffer
      // behind it is what the fixture `Response` carries.
      const bytes = yield* fs.readFile(release);
      // A fresh, definitely-`ArrayBuffer`-backed copy. `fs.readFile` returns a
      // `Uint8Array<ArrayBufferLike>`, whose buffer may be a
      // `SharedArrayBuffer` as far as the types know, and neither it nor a
      // `Blob` built from it is a `BodyInit`.
      const body = Uint8Array.from(bytes);

      // The *shipped* Bun composition, `immutable=1` and all — the URI is what
      // causes round-3 F3, so a driver written for this test could let the
      // suite pass against the very code that shipped the bug.
      const wiki = layerBunReloadable(destination).pipe(
        Layer.provide(TopicService.Test([])),
        Layer.provide(WikiSectionSources.NotWired),
        Layer.provide(NodeFileSystem.layer),
      );

      const artifacts = layerNativeFileArtifacts({
        artifact: TopicsArtifact,
        destination,
        provenanceStore: {
          read: () => Effect.fail('provenance is unavailable'),
          write: () => Effect.void,
        },
        // No compiled source: the only path from the offered entry to the
        // installer is the release source `installFrom` builds (round-3 F1).
        sources: [],
        fetch: () => Effect.succeed(new Response(body)),
        // The shipped semantic verifier opens the candidate through
        // `better-sqlite3`, which hard-crashes the Bun canary this repo tests
        // under — the same substitution `file-corpus-lifecycle.test.ts` makes.
        // The digest and size gates above it are the real ones.
        verify: () => Effect.succeed(1),
      });

      const content = ContentUpdate.Live.pipe(
        Layer.provide(CorpusSupply.layer.pipe(Layer.provide(artifacts))),
        Layer.provide(
          ContentManifestSource.layerOf({
            _tag: 'fetched',
            manifest: ContentManifest.make({
              revision: corpusRevision('manifest-1'),
              artifacts: {
                topics: ContentManifestEntry.make({
                  revision: corpusRevision('content-v4'),
                  url: 'https://example.test/topics.db',
                  sha256: `sha256:${new Bun.CryptoHasher('sha256').update(bytes).digest('hex')}`,
                  size: bytes.byteLength,
                  schema_major: TOPICS_SCHEMA_MAJOR,
                  generation: corpusGeneration(4),
                }),
              },
            }),
          }),
        ),
        // The wiring under test: an activation reopens the reader. The same
        // `wiki` layer is given to the handlers below, and layer memoization by
        // tag is what makes this the live handle rather than a second copy.
        Layer.provide(layerReloadOnActivation.pipe(Layer.provide(wiki))),
        Layer.provide(ContentActivation.Inert),
      );

      const channel = yield* Effect.acquireRelease(
        Effect.sync(() => new MessageChannel()),
        (active) =>
          Effect.sync(() => {
            active.port1.close();
            active.port2.close();
          }),
      );
      const traffic = instrumentedPort(channel);
      const server = yield* Effect.forkScoped(
        Layer.launch(
          layerDesktopProcedureServer(traffic.port).pipe(
            Layer.provide(procedureDependencies({ content, wiki })),
          ),
        ),
      );
      yield* Effect.addFinalizer(() => Fiber.interrupt(server));

      const slugs = yield* Effect.gen(function* () {
        const procedures = yield* client;
        const before = yield* procedures['v1.wiki.topics.list']({});
        const outcome = yield* procedures['v1.content.update']({ corpus: 'topics' });
        const after = yield* procedures['v1.wiki.topics.list']({});
        return {
          before: before.map((page) => String(page.slug)),
          activated: outcome.activated,
          after: after.map((page) => String(page.slug)),
        };
      }).pipe(Effect.provide(layerDesktopProcedureTransport(channel.port1)));

      // The generation this host opened at startup.
      expect(slugs.before).toEqual(['sanctuary']);
      expect(Option.isSome(slugs.activated)).toBe(true);
      // The page that exists only in the new artifact, over the same live port
      // and the same live process.
      expect(slugs.after).toEqual(['investigative-judgment']);
      // And the bytes really did land: this was an install, not a stub.
      expect(yield* fs.readFile(destination)).toEqual(bytes);
    }),
  );

  it.scopedLive("this host's real Node client answers the cross-host table", () =>
    Effect.gen(function* () {
      const server = yield* serveFixtures;
      const table = yield* liveAdapterConformance({
        client: NodeHttpClient.layerNodeHttp,
        baseUrl: `http://127.0.0.1:${String(server.port)}`,
        closedUrl: 'http://127.0.0.1:1/manifest.json',
      });
      expect(table).toEqual(ADAPTER_EXPECTATIONS);
    }),
  );
});
