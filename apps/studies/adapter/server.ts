import { createApp } from 'astro/app/entrypoint';
import config from 'virtual:studies-adapter:config';

/*
 * Server entrypoint for the in-house Bun adapter (see ./index.ts, docs/adr/0002).
 *
 * Astro 6 `entrypointResolution: 'auto'`: `createApp()` returns a fully-wired App
 * (the SSR manifest is injected by Astro via a virtual module at build time), and
 * our build-time paths come from the `virtual:studies-adapter:config` module the
 * integration's Vite plugin provides. We export named functions directly.
 *
 * Request handling:
 *   1. If the App matches an on-demand route -> app.render() (e.g. /api/grade).
 *   2. Otherwise treat it as a static client asset and stream it from the built
 *      client dir, with a 404.html fallback.
 *
 * Bun implements the Web fetch/Request/Response APIs natively, so the handler is a
 * plain `(req: Request) => Promise<Response>` — no node-http translation needed.
 */

type BunServer = ReturnType<typeof Bun.serve>;

const cfg = config;
const app = createApp();

function resolveHost(host: string | boolean | undefined): string {
  if (typeof host === 'boolean') return host ? '0.0.0.0' : 'localhost';
  return host ?? 'localhost';
}

function ensureLeadingSlash(p: string): string {
  return p.startsWith('/') ? p : `/${p}`;
}

/** Serve a static file from the client dir, or fall back to 404.html. */
async function serveStatic(
  pathname: string,
  fileUrl: URL,
  clientDir: string,
  assetsPrefix: string,
): Promise<Response> {
  const file = Bun.file(fileUrl);
  if (!(await file.exists())) {
    const notFound = Bun.file(new URL('./404.html', clientDir));
    const body = (await notFound.exists()) ? notFound : 'Not found';
    return new Response(body, { status: 404, statusText: 'Not Found' });
  }
  // Hashed assets are immutable; cache them aggressively.
  if (pathname.startsWith(assetsPrefix)) {
    return new Response(file, {
      headers: { 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  }
  return new Response(file);
}

export async function handler(request: Request): Promise<Response> {
  const clientDir = cfg.client; // file:// URL of built client dir
  const assetsPrefix = `/${cfg.assets}/`;

  const routeData = app.match(request);
  if (routeData) {
    return app.render(request, { addCookieHeader: true, routeData });
  }

  // No on-demand match -> static asset (or prerendered page) from the client dir.
  const url = new URL(request.url);
  const relative = app.removeBase(url.pathname);
  // Files have an extension and no trailing slash; everything else maps to index.html.
  const looksLikeFile = /\.[^/]+$/.test(relative) && !url.pathname.endsWith('/');
  const target = looksLikeFile
    ? new URL(`.${ensureLeadingSlash(relative)}`, clientDir)
    : new URL(`.${ensureLeadingSlash(relative)}/index.html`.replace(/\/{2,}/g, '/'), clientDir);

  return serveStatic(url.pathname, target, clientDir, assetsPrefix);
}

let server: BunServer | null = null;

export function start(): void {
  if (server) return;
  const logger = app.adapterLogger;
  const host = Bun.env.HOST ?? resolveHost(cfg.host);
  const port = Bun.env.PORT ? Number.parseInt(Bun.env.PORT, 10) : (cfg.port ?? 4321);

  server = Bun.serve({
    hostname: host,
    port,
    fetch: handler,
    error: (error: Error) =>
      new Response(`<pre>${error.message}\n${error.stack ?? ''}</pre>`, {
        headers: { 'Content-Type': 'text/html' },
        status: 500,
      }),
  });

  const shutdown = () => {
    void server?.stop();
    process.exit();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  logger.info(`Server listening on http://${host}:${port}`);
}

export function running(): boolean {
  return server !== null;
}

export function stop(): void {
  if (server) {
    void server.stop();
    server = null;
  }
}
