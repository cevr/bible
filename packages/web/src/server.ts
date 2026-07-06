/**
 * Static file server for the built site (packages/web/dist). Zero deps; this
 * is the Railway entrypoint (`bun run src/server.ts`, PORT provided by the
 * platform).
 */

import { join, normalize } from 'node:path';

const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};


const dist = join(new URL('.', import.meta.url).pathname, '..', 'dist');
const port = Number(process.env['PORT'] ?? 3000);

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
};

const contentType = (path: string): string => {
  const dot = path.lastIndexOf('.');
  const ext = dot === -1 ? '' : path.slice(dot).toLowerCase();
  return TYPES[ext] ?? 'application/octet-stream';
};

const resolve = (pathname: string): string | null => {
  const decoded = decodeURIComponent(pathname);
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  if (safe.includes('..')) return null;
  return join(dist, safe);
};

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    const base = resolve(url.pathname);
    if (base === null) return new Response('Bad request', { status: 400 });

    // /path/ → /path/index.html ; /path → try file, then /path/index.html
    const candidates = url.pathname.endsWith('/')
      ? [join(base, 'index.html')]
      : [base, join(base, 'index.html')];

    for (const path of candidates) {
      const file = Bun.file(path);
      if (await file.exists()) {
        const immutable = url.pathname.endsWith('.css') || url.pathname.endsWith('.png');
        return new Response(file, {
          headers: {
            'content-type': contentType(path),
            'cache-control': immutable ? 'public, max-age=3600' : 'public, max-age=300',
          },
        });
      }
    }

    const notFound = Bun.file(join(dist, '404.html'));
    if (await notFound.exists()) {
      return new Response(notFound, {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response('Not found', { status: 404 });
  },
});

log(`The Sure Word serving ${dist} on :${port}`);
