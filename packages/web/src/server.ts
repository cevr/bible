/**
 * Static file server for the built site (packages/web/dist). Zero deps; this
 * is the Railway entrypoint (`bun run src/server.ts`, PORT provided by the
 * platform).
 */

import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const log = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const dist = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist');
const port = Number(Bun.env['PORT'] ?? 3000);

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
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null; // malformed percent-encoding → 400, not a thrown 500
  }
  const safe = normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  if (safe.includes('..')) return null;
  return join(dist, safe);
};

Bun.serve({
  port,
  development: false,
  async fetch(req) {
    const url = new URL(req.url);

    // studies moved from /studies/<slug>/ to /<slug>/ — permanent redirects
    // keep printed QR codes and shared links alive. Collapse leading slashes on
    // the target so `/studies//evil.com` can't become a protocol-relative
    // (cross-origin) Location — the redirect must always stay same-origin.
    if (url.pathname === '/studies' || url.pathname.startsWith('/studies/')) {
      const rest = url.pathname.slice('/studies'.length).replace(/^[/\\]+/, '');
      return Response.redirect(`/${rest}${url.search}`, 301);
    }

    const base = resolve(url.pathname);
    if (base === null) return new Response('Bad request', { status: 400 });

    if (!url.pathname.endsWith('/')) {
      const asFile = Bun.file(base);
      if (await asFile.exists()) {
        return new Response(asFile, {
          headers: {
            'content-type': contentType(base),
            'cache-control': 'public, max-age=300',
          },
        });
      }
      // directory hit without trailing slash: redirect so the page's
      // relative links resolve against the directory, not its parent
      if (await Bun.file(join(base, 'index.html')).exists()) {
        return Response.redirect(`${url.pathname}/${url.search}`, 308);
      }
    } else {
      const index = Bun.file(join(base, 'index.html'));
      if (await index.exists()) {
        return new Response(index, {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'public, max-age=300',
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
