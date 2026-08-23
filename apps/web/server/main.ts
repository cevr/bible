/**
 * Bible Tools Web Server
 *
 * Serves Bible and EGW data via Effect HttpApi, plus static files in production.
 * In development, Vite handles static files and proxies /api to this server.
 *
 * Run with: bun run server (production) or bun run server:dev (development)
 */
import {
  Etag,
  Headers,
  HttpMiddleware,
  HttpPlatform,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/unstable/http';
import { HttpApiBuilder, HttpApiScalar } from 'effect/unstable/httpapi';
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer, Option } from 'effect';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

import { BibleToolsApi } from '@bible/api';
import {
  CONTENT_ARTIFACT_PROXY_PATH,
  CONTENT_MANIFEST_PROXY_PATH,
  contentManifestUrl,
} from '@bible/core/content-update';
import { BIBLE_ARTIFACT_RELEASE, TOPICS_ARTIFACT_RELEASE } from '@bible/core/corpus-supply';
import { VECTORS_ARTIFACT_RELEASE } from '@bible/core/search';
import { BibleService } from '@bible/core/bible/service';
import * as BibleDbBun from '@bible/core/bible-db/bun';
import * as EGWDbBun from '@bible/core/egw-db/bun';
import { failureCategory } from '@bible/core/observability';
import { WritingsArchive } from '@bible/core/writings/archive-service';
import { WritingsService } from '@bible/core/writings/service';

import { BibleGroupLive } from './api/groups/BibleGroupLive.js';
import { artifactRequestFrom, contentArtifactResponse } from './content-artifact-proxy.js';
import { contentManifestResponse } from './content-manifest-proxy.js';
import { EGWGroupLive } from './api/groups/EGWGroupLive.js';

// ============================================================================
// Configuration
// ============================================================================

const PORT = Number(process.env['PORT'] ?? 3001);
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ============================================================================
// API Implementation Layer
// ============================================================================

// Compose all group handlers
const BibleGroupLayer = BibleGroupLive.pipe(
  Layer.provide(BibleService.Live),
  Layer.provide(BibleDbBun.Default),
);

const WritingsServiceLive = WritingsService.Live.pipe(Layer.provide(EGWDbBun.Default));
const WritingsArchiveLive = WritingsArchive.Live.pipe(
  Layer.provide(Layer.merge(WritingsServiceLive, EGWDbBun.Default)),
);
const EGWGroupLayer = EGWGroupLive.pipe(
  Layer.provide(Layer.merge(WritingsServiceLive, WritingsArchiveLive)),
);

const ApiLive = HttpApiBuilder.layer(BibleToolsApi).pipe(
  Layer.provide(BibleGroupLayer),
  Layer.provide(EGWGroupLayer),
);

// COOP/COEP headers required for SharedArrayBuffer (wa-sqlite OPFS)
const CROSS_ORIGIN_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'credentialless',
};

type StaticFileMiss = 'not-found';
const NOT_FOUND: StaticFileMiss = 'not-found';

const serveStaticFile = (filePath: string, contentType: string) =>
  Effect.gen(function* () {
    const file = Bun.file(filePath);
    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      return yield* Effect.fail(NOT_FOUND);
    }
    const content = yield* Effect.promise(() => file.arrayBuffer());
    return HttpServerResponse.raw(content, {
      headers: { 'Content-Type': contentType, ...CROSS_ORIGIN_HEADERS },
    });
  });

const getContentType = (path: string): string => {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.js')) return 'application/javascript';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.ico')) return 'image/x-icon';
  if (path.endsWith('.woff')) return 'font/woff';
  if (path.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
};

const SYNC_DIR = join(homedir(), '.bible', 'sync');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SYNC_BODY = 5 * 1024 * 1024; // 5MB

const StaticFilesMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;

    if (pathname === '/api/assets/bible' && request.method === 'GET') {
      const upstream = yield* Effect.tryPromise(() => fetch(BIBLE_ARTIFACT_RELEASE.url)).pipe(
        Effect.map(Option.some),
        Effect.orElseSucceed(() => Option.none<Response>()),
      );
      const upstreamBody = upstream.pipe(
        Option.filter((response) => response.ok),
        Option.flatMap((response) => Option.fromNullOr(response.body)),
      );
      if (Option.isNone(upstreamBody)) {
        return HttpServerResponse.text('Bible Artifact unavailable', {
          status: 502,
          headers: CROSS_ORIGIN_HEADERS,
        });
      }
      return HttpServerResponse.raw(upstreamBody.value, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(BIBLE_ARTIFACT_RELEASE.size),
          'X-Artifact-Digest': BIBLE_ARTIFACT_RELEASE.digest,
          ...CROSS_ORIGIN_HEADERS,
        },
      });
    }

    // The Topics proxy mirrors the Bible one, with one difference the §3.5
    // posture requires: no Topics release is published yet, so the route
    // answers 404 rather than 502. A browser that cannot get topics falls back
    // to catalog pages, and "not published" is not a gateway failure.
    if (pathname === '/api/assets/topics' && request.method === 'GET') {
      if (Option.isNone(TOPICS_ARTIFACT_RELEASE)) {
        return HttpServerResponse.text('No Topics Artifact release is published', {
          status: 404,
          headers: CROSS_ORIGIN_HEADERS,
        });
      }
      const release = TOPICS_ARTIFACT_RELEASE.value;
      const upstream = yield* Effect.tryPromise(() => fetch(release.url)).pipe(
        Effect.map(Option.some),
        Effect.orElseSucceed(() => Option.none<Response>()),
      );
      const upstreamBody = upstream.pipe(
        Option.filter((response) => response.ok),
        Option.flatMap((response) => Option.fromNullOr(response.body)),
      );
      if (Option.isNone(upstreamBody)) {
        return HttpServerResponse.text('Topics Artifact unavailable', {
          status: 502,
          headers: CROSS_ORIGIN_HEADERS,
        });
      }
      return HttpServerResponse.raw(upstreamBody.value, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(release.size),
          'X-Artifact-Digest': release.digest,
          ...CROSS_ORIGIN_HEADERS,
        },
      });
    }

    // §9.2's index, proxied exactly as topics is: the browser cannot reach the
    // release host directly (no CORS), and mirroring the topics route rather
    // than inventing a second shape is what keeps one artifact pipeline.
    if (pathname === '/api/assets/vectors' && request.method === 'GET') {
      if (Option.isNone(VECTORS_ARTIFACT_RELEASE)) {
        return HttpServerResponse.text('No Vectors Artifact release is published', {
          status: 404,
          headers: CROSS_ORIGIN_HEADERS,
        });
      }
      const release = VECTORS_ARTIFACT_RELEASE.value;
      const upstream = yield* Effect.tryPromise(() => fetch(release.url)).pipe(
        Effect.map(Option.some),
        Effect.orElseSucceed(() => Option.none<Response>()),
      );
      const upstreamBody = upstream.pipe(
        Option.filter((response) => response.ok),
        Option.flatMap((response) => Option.fromNullOr(response.body)),
      );
      if (Option.isNone(upstreamBody)) {
        return HttpServerResponse.text('Vectors Artifact unavailable', {
          status: 502,
          headers: CROSS_ORIGIN_HEADERS,
        });
      }
      return HttpServerResponse.raw(upstreamBody.value, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(release.size),
          'X-Artifact-Digest': release.digest,
          ...CROSS_ORIGIN_HEADERS,
        },
      });
    }

    // §3.6's runtime manifest, proxied exactly as the three artifacts are: the
    // browser cannot reach the release host directly (no CORS). The route's
    // trust rules live in `content-manifest-proxy.ts`, where a suite can run a
    // real client at them.
    if (pathname === CONTENT_MANIFEST_PROXY_PATH && request.method === 'GET') {
      return yield* contentManifestResponse({
        url: yield* contentManifestUrl,
        headers: CROSS_ORIGIN_HEADERS,
        fetch: (url, init) => fetch(url, init),
      });
    }

    // §3.6's runtime artifact. Same trust rules as the manifest route above,
    // over an address the manifest named rather than one this build compiled
    // in — which is exactly why the rules have to be the same (round-4 F1).
    if (pathname === CONTENT_ARTIFACT_PROXY_PATH && request.method === 'GET') {
      const artifact = artifactRequestFrom(url);
      if (Option.isNone(artifact)) {
        return HttpServerResponse.text('Content artifact request is incomplete', {
          status: 400,
          headers: CROSS_ORIGIN_HEADERS,
        });
      }
      return yield* contentArtifactResponse({
        request: artifact.value,
        headers: CROSS_ORIGIN_HEADERS,
        fetch: (address, init) => fetch(address, init),
      });
    }

    // Sync state backup
    if (pathname === '/api/sync/state') {
      const deviceIdOpt = Headers.get(request.headers, 'x-device-id');
      if (Option.isNone(deviceIdOpt) || !UUID_RE.test(deviceIdOpt.value)) {
        return HttpServerResponse.text('Missing or invalid X-Device-Id', {
          status: 400,
          headers: CROSS_ORIGIN_HEADERS,
        });
      }
      const deviceId = deviceIdOpt.value;

      if (request.method === 'POST') {
        const buf = yield* request.arrayBuffer.pipe(
          Effect.map(Option.some),
          Effect.orElseSucceed(() => Option.none<ArrayBuffer>()),
        );
        const body = Option.filter(
          buf,
          (bytes) => bytes.byteLength > 0 && bytes.byteLength <= MAX_SYNC_BODY,
        );
        if (Option.isNone(body)) {
          return HttpServerResponse.text('Missing or oversized body', {
            status: 400,
            headers: CROSS_ORIGIN_HEADERS,
          });
        }

        const dir = join(SYNC_DIR, deviceId);
        const filePath = join(dir, 'state.db');
        yield* Effect.sync(() => mkdirSync(dir, { recursive: true }));
        yield* Effect.promise(() => Bun.write(filePath, new Uint8Array(body.value)));

        return HttpServerResponse.empty({ status: 204, headers: CROSS_ORIGIN_HEADERS });
      }

      if (request.method === 'GET') {
        const filePath = join(SYNC_DIR, deviceId, 'state.db');
        const file = Bun.file(filePath);
        const exists = yield* Effect.promise(() => file.exists());
        if (!exists) {
          return HttpServerResponse.text('Not found', {
            status: 404,
            headers: CROSS_ORIGIN_HEADERS,
          });
        }
        return HttpServerResponse.raw(file.stream(), {
          status: 200,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': String(file.size),
            ...CROSS_ORIGIN_HEADERS,
          },
        });
      }

      return HttpServerResponse.text('Method not allowed', {
        status: 405,
        headers: CROSS_ORIGIN_HEADERS,
      });
    }

    // Skip API routes
    if (pathname.startsWith('/api') || pathname.startsWith('/docs')) {
      return yield* app;
    }

    // Only serve static files in production
    if (!IS_PRODUCTION) {
      return yield* app;
    }

    const distDir = new URL('../dist', import.meta.url).pathname;

    // Try to serve the exact file
    let staticPath = pathname;
    if (pathname === '/') staticPath = '/index.html';
    const filePath = `${distDir}${staticPath}`;
    const contentType = getContentType(filePath);

    const result = yield* serveStaticFile(filePath, contentType).pipe(
      Effect.catch(() => {
        // SPA fallback: serve index.html for non-file routes
        if (pathname.includes('.')) return Effect.fail(NOT_FOUND);
        return serveStaticFile(`${distDir}/index.html`, 'text/html');
      }),
      Effect.catch(() => app),
    );

    return result;
  }),
);

// ============================================================================
// Server Configuration
// ============================================================================

// OpenAPI docs at /docs
const DocsLive = HttpApiScalar.layer(BibleToolsApi).pipe(Layer.provide(ApiLive));

// Build the full app layer (ApiLive + Docs provide HttpRouter)
const AppLayer = ApiLive.pipe(Layer.provideMerge(DocsLive));

// Convert the app layer to an HTTP handler effect, wrap with middleware, and serve
const HttpLive = Layer.unwrap(
  HttpRouter.toHttpEffect(AppLayer).pipe(
    Effect.map((httpApp) =>
      HttpServer.serve(StaticFilesMiddleware)(httpApp).pipe(
        HttpServer.withLogAddress,
        Layer.provide(BunHttpServer.layer({ port: PORT })),
      ),
    ),
  ),
);

// ============================================================================
// Start Server
// ============================================================================

const PlatformLive = Layer.mergeAll(
  Etag.layer,
  HttpPlatform.layer.pipe(Layer.provide(BunServices.layer)),
  BunServices.layer,
);

const program = Layer.launch(HttpLive).pipe(
  Effect.provide(PlatformLive),
  Effect.tapError((cause) =>
    Effect.sync(() => {
      console.error(`[api] startup-failed category=${failureCategory(cause)}`);
    }),
  ),
);

let mode = 'development';
let staticRoot = 'vite';
if (IS_PRODUCTION) {
  mode = 'production';
  staticRoot = '/';
}
console.log(
  `[api] listening port=${String(PORT)} mode=${mode} api=/api docs=/docs static=${staticRoot}`,
);

BunRuntime.runMain(program);
