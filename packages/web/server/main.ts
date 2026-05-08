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
import { BibleDatabase } from '@bible/core/bible-db';
import { EGWParagraphDatabase } from '@bible/core/egw-db';

import { BibleGroupLive } from './api/groups/BibleGroupLive.js';
import { EGWGroupLive } from './api/groups/EGWGroupLive.js';
import { BibleServiceLive } from './services/BibleService.js';
import { EGWServiceLive } from './services/EGWService.js';

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
  Layer.provide(BibleServiceLive),
  Layer.provide(BibleDatabase.Default),
);

const EGWGroupLayer = EGWGroupLive.pipe(
  Layer.provide(EGWServiceLive),
  Layer.provide(EGWParagraphDatabase.Default),
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

const serveStaticFile = (filePath: string, contentType: string) =>
  Effect.gen(function* () {
    const file = Bun.file(filePath);
    const exists = yield* Effect.promise(() => file.exists());
    if (!exists) {
      return yield* Effect.fail('not-found' as const);
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

const BIBLE_DB_PATH = join(homedir(), '.bible', 'bible.db');
const EGW_DB_PATH = join(homedir(), '.bible', 'egw-paragraphs.db');
const SYNC_DIR = join(homedir(), '.bible', 'sync');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SYNC_BODY = 5 * 1024 * 1024; // 5MB

const serveBibleDb = Effect.gen(function* () {
  const file = Bun.file(BIBLE_DB_PATH);
  const exists = yield* Effect.promise(() => file.exists());
  if (!exists) {
    return HttpServerResponse.text('bible.db not found', { status: 404 });
  }
  const size = file.size;
  const stream = file.stream();
  return HttpServerResponse.raw(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
      'Cache-Control': 'public, max-age=86400',
      ...CROSS_ORIGIN_HEADERS,
    },
  });
});
const serveEgwDb = Effect.gen(function* () {
  const file = Bun.file(EGW_DB_PATH);
  const exists = yield* Effect.promise(() => file.exists());
  if (!exists) {
    return HttpServerResponse.text('egw-paragraphs.db not found', { status: 404 });
  }
  const size = file.size;
  const stream = file.stream();
  return HttpServerResponse.raw(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(size),
      'Cache-Control': 'public, max-age=86400',
      ...CROSS_ORIGIN_HEADERS,
    },
  });
});

const StaticFilesMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;

    // Serve bible.db download
    if (pathname === '/api/db/bible') {
      const response = yield* serveBibleDb;
      return response;
    }

    // Serve egw-paragraphs.db download
    if (pathname === '/api/db/egw') {
      const response = yield* serveEgwDb;
      return response;
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
        const buf = yield* request.arrayBuffer.pipe(Effect.catch(() => Effect.succeed(null)));

        if (!buf || buf.byteLength === 0 || buf.byteLength > MAX_SYNC_BODY) {
          return HttpServerResponse.text('Missing or oversized body', {
            status: 400,
            headers: CROSS_ORIGIN_HEADERS,
          });
        }

        const dir = join(SYNC_DIR, deviceId);
        const filePath = join(dir, 'state.db');
        yield* Effect.sync(() => mkdirSync(dir, { recursive: true }));
        yield* Effect.promise(() => Bun.write(filePath, new Uint8Array(buf)));

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
    const filePath = `${distDir}${pathname === '/' ? '/index.html' : pathname}`;
    const contentType = getContentType(filePath);

    const result = yield* serveStaticFile(filePath, contentType).pipe(
      Effect.catch(() =>
        // SPA fallback: serve index.html for non-file routes
        pathname.includes('.')
          ? Effect.fail('not-found' as const)
          : serveStaticFile(`${distDir}/index.html`, 'text/html'),
      ),
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
  Effect.tapError(Effect.logError),
);

console.log(`Starting Bible Tools server on port ${PORT}...`);
console.log(`  Mode: ${IS_PRODUCTION ? 'production' : 'development'}`);
console.log(`  API: http://localhost:${PORT}/api`);
console.log(`  Docs: http://localhost:${PORT}/docs`);
if (IS_PRODUCTION) {
  console.log(`  Static: http://localhost:${PORT}/`);
}

BunRuntime.runMain(program);
