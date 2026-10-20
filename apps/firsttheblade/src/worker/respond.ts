/**
 * The Worker's whole policy, over the site's files (`./assets.ts`):
 *
 * - only GET and HEAD are answered; any other method is 405;
 * - a path that names no file answers with the not-found page, as 404;
 * - every response says how long to keep it: fingerprinted files under
 *   `/assets/` for a year, pages not at all without asking again, and the
 *   rest (icons, link cards, the sitemap) for a day;
 * - every response carries the security headers: the content policy, no
 *   sniffing, no framing, a strict referrer and HTTPS only;
 * - a text file (a page, llms.txt, the sitemap) says it is UTF-8, which
 *   every file the prerender writes is.
 */
import { Effect, Option } from 'effect';
import { Headers, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { Assets } from './assets.ts';

export const CACHE = {
  immutable: 'public, max-age=31536000, immutable',
  page: 'public, max-age=0, must-revalidate',
  day: 'public, max-age=86400',
} as const;

/**
 * The content policy: everything from this origin and nothing else. The
 * pages carry no inline script or style, so neither is allowed.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS = {
  'content-security-policy': CONTENT_SECURITY_POLICY,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'strict-transport-security': 'max-age=31536000',
} as const;

const ALLOWED_METHODS = new Set(['GET', 'HEAD']);

/** The not-found page's path; asked for directly, it is still a 404. */
const NOT_FOUND_PATH = '/404';

const pathnameOf = (request: HttpServerRequest.HttpServerRequest) =>
  new URL(request.url, 'http://localhost').pathname;

const isHtml = (response: HttpServerResponse.HttpServerResponse) =>
  Option.exists(Headers.get(response.headers, 'content-type'), (type) =>
    type.startsWith('text/html'),
  );

/** How long a response may be kept, by what it is. */
export const cacheControl = (
  pathname: string,
  response: HttpServerResponse.HttpServerResponse,
): string => {
  if (response.status >= 300) return CACHE.page;
  if (pathname.startsWith('/assets/')) return CACHE.immutable;
  if (isHtml(response)) return CACHE.page;
  return CACHE.day;
};

const TEXT_TYPES = ['text/', 'application/xml', 'application/json', 'application/manifest+json'];

/** The content type with its charset: a text type the host left without one is UTF-8. */
export const withCharset = (contentType: string) => {
  if (contentType.includes('charset=')) return contentType;
  if (!TEXT_TYPES.some((type) => contentType.startsWith(type))) return contentType;
  return `${contentType}; charset=utf-8`;
};

const finish = (pathname: string, response: HttpServerResponse.HttpServerResponse) =>
  response.pipe(
    HttpServerResponse.setHeaders(SECURITY_HEADERS),
    HttpServerResponse.setHeader('cache-control', cacheControl(pathname, response)),
    (finished) =>
      Option.match(Headers.get(finished.headers, 'content-type'), {
        onNone: () => finished,
        onSome: (type) => HttpServerResponse.setHeader(finished, 'content-type', withCharset(type)),
      }),
  );

/** The request a host's static files answer with the not-found page. */
const notFoundRequest = (request: HttpServerRequest.HttpServerRequest) =>
  HttpServerRequest.fromWeb(new Request(new URL(NOT_FOUND_PATH, request.originalUrl)));

export const respond = Effect.fn('Site.respond')(function* (
  request: HttpServerRequest.HttpServerRequest,
) {
  const pathname = pathnameOf(request);
  if (!ALLOWED_METHODS.has(request.method)) {
    return finish(
      pathname,
      HttpServerResponse.text('Method Not Allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD' },
      }),
    );
  }
  const assets = yield* Assets;
  const response = yield* assets.serve(request);
  if (response.status !== 404 && pathname !== NOT_FOUND_PATH) return finish(pathname, response);
  const page = yield* assets.serve(notFoundRequest(request));
  return finish(NOT_FOUND_PATH, HttpServerResponse.setStatus(page, 404));
});
