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
} from 'effect/http';
import { HttpApiBuilder, HttpApiScalar } from 'effect/http-api';
import { BunHttpServer, BunRuntime, BunServices } from '@effect/platform-bun';
import { Effect, Layer, Option, type Config } from 'effect';
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

const textResponse = (message: string, status: number) =>
  HttpServerResponse.text(message, { status, headers: CROSS_ORIGIN_HEADERS });

/** The address and identity of one published artifact release. */
interface ArtifactRelease {
  readonly url: string;
  readonly size: number;
  readonly digest: string;
}

/** Streams a release's bytes from its host, or answers 502 when the host is
 *  unreachable or does not hand back a body. */
const proxyRelease = Effect.fn('web.proxyRelease')(function* (
  release: ArtifactRelease,
  label: string,
) {
  const upstream = yield* Effect.tryPromise(() => fetch(release.url)).pipe(
    Effect.asSome,
    Effect.orElseSucceed(() => Option.none<Response>()),
  );
  const upstreamBody = upstream.pipe(
    Option.filter((response) => response.ok),
    Option.flatMap((response) => Option.fromNullOr(response.body)),
  );
  if (Option.isNone(upstreamBody)) return textResponse(`${label} Artifact unavailable`, 502);
  return HttpServerResponse.raw(upstreamBody.value, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(release.size),
      'X-Artifact-Digest': release.digest,
      ...CROSS_ORIGIN_HEADERS,
    },
  });
});

/** The Topics and Vectors proxies mirror the Bible one, with one difference
 *  the §3.5 posture requires: a release that is not published yet answers 404
 *  rather than 502. A browser that cannot get topics falls back to catalog
 *  pages, and "not published" is not a gateway failure. */
const proxyPublishedRelease = (release: Option.Option<ArtifactRelease>, label: string) =>
  Option.match(release, {
    onNone: () => Effect.succeed(textResponse(`No ${label} Artifact release is published`, 404)),
    onSome: (published) => proxyRelease(published, label),
  });

// §3.6's runtime manifest, proxied exactly as the three artifacts are: the
// browser cannot reach the release host directly (no CORS). The route's
// trust rules live in `content-manifest-proxy.ts`, where a suite can run a
// real client at them.
const proxyContentManifest = Effect.fn('web.proxyContentManifest')(function* () {
  return yield* contentManifestResponse({
    url: yield* contentManifestUrl,
    headers: CROSS_ORIGIN_HEADERS,
    fetch: (url, init) => fetch(url, init),
  });
});

// §3.6's runtime artifact. Same trust rules as the manifest route above,
// over an address the manifest named rather than one this build compiled
// in — which is exactly why the rules have to be the same (round-4 F1).
const proxyContentArtifact = (url: URL) =>
  Option.match(artifactRequestFrom(url), {
    onNone: () => Effect.succeed(textResponse('Content artifact request is incomplete', 400)),
    onSome: (request) =>
      contentArtifactResponse({
        request,
        headers: CROSS_ORIGIN_HEADERS,
        fetch: (address, init) => fetch(address, init),
      }),
  });

/** The GET routes this server answers itself rather than handing to the API
 *  router. §9.2's vectors index is proxied exactly as topics is: the browser
 *  cannot reach the release host directly (no CORS), and mirroring the topics
 *  route rather than inventing a second shape is what keeps one artifact
 *  pipeline. */
type ProxyRoute = (
  url: URL,
) => Effect.Effect<HttpServerResponse.HttpServerResponse, Config.ConfigError>;

const PROXY_ROUTES: ReadonlyMap<string, ProxyRoute> = new Map<string, ProxyRoute>([
  ['/api/assets/bible', () => proxyRelease(BIBLE_ARTIFACT_RELEASE, 'Bible')],
  ['/api/assets/topics', () => proxyPublishedRelease(TOPICS_ARTIFACT_RELEASE, 'Topics')],
  ['/api/assets/vectors', () => proxyPublishedRelease(VECTORS_ARTIFACT_RELEASE, 'Vectors')],
  [CONTENT_MANIFEST_PROXY_PATH, () => proxyContentManifest()],
  [CONTENT_ARTIFACT_PROXY_PATH, proxyContentArtifact],
]);

const writeSyncState = Effect.fn('web.writeSyncState')(function* (
  request: HttpServerRequest.HttpServerRequest,
  deviceId: string,
) {
  const buf = yield* request.arrayBuffer.pipe(
    Effect.asSome,
    Effect.orElseSucceed(() => Option.none<ArrayBuffer>()),
  );
  const body = Option.filter(
    buf,
    (bytes) => bytes.byteLength > 0 && bytes.byteLength <= MAX_SYNC_BODY,
  );
  if (Option.isNone(body)) return textResponse('Missing or oversized body', 400);

  const dir = join(SYNC_DIR, deviceId);
  const filePath = join(dir, 'state.db');
  yield* Effect.sync(() => mkdirSync(dir, { recursive: true }));
  yield* Effect.promise(() => Bun.write(filePath, new Uint8Array(body.value)));

  return HttpServerResponse.empty({ status: 204, headers: CROSS_ORIGIN_HEADERS });
});

const readSyncState = Effect.fn('web.readSyncState')(function* (deviceId: string) {
  const filePath = join(SYNC_DIR, deviceId, 'state.db');
  const file = Bun.file(filePath);
  const exists = yield* Effect.promise(() => file.exists());
  if (!exists) return textResponse('Not found', 404);
  return HttpServerResponse.raw(file.stream(), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(file.size),
      ...CROSS_ORIGIN_HEADERS,
    },
  });
});

// Sync state backup
const syncState = Effect.fn('web.syncState')(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const deviceId = Headers.get(request.headers, 'x-device-id').pipe(
    Option.filter((value) => UUID_RE.test(value)),
  );
  if (Option.isNone(deviceId)) return textResponse('Missing or invalid X-Device-Id', 400);
  if (request.method === 'POST') return yield* writeSyncState(request, deviceId.value);
  if (request.method === 'GET') return yield* readSyncState(deviceId.value);
  return textResponse('Method not allowed', 405);
});

/** Serves a production build file, falling back to the SPA shell for non-file
 *  routes and to the app when neither exists. */
const serveDist = <E, R>(
  pathname: string,
  app: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
) => {
  const distDir = new URL('../dist', import.meta.url).pathname;

  // Try to serve the exact file
  let staticPath = pathname;
  if (pathname === '/') staticPath = '/index.html';
  const filePath = `${distDir}${staticPath}`;
  const contentType = getContentType(filePath);

  return serveStaticFile(filePath, contentType).pipe(
    Effect.catch(() => {
      // SPA fallback: serve index.html for non-file routes
      if (pathname.includes('.')) return Effect.fail(NOT_FOUND);
      return serveStaticFile(`${distDir}/index.html`, 'text/html');
    }),
    Effect.catch(() => app),
  );
};

const StaticFilesMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;

    const proxy = Option.fromUndefinedOr(PROXY_ROUTES.get(pathname)).pipe(
      Option.filter(() => request.method === 'GET'),
    );
    if (Option.isSome(proxy)) return yield* proxy.value(url);

    if (pathname === '/api/sync/state') return yield* syncState(request);

    // Skip API routes
    if (pathname.startsWith('/api') || pathname.startsWith('/docs')) {
      return yield* app;
    }

    // Only serve static files in production
    if (!IS_PRODUCTION) {
      return yield* app;
    }

    return yield* serveDist(pathname, app);
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
