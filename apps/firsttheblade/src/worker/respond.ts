/**
 * The Worker's whole policy, over the email list's routes
 * (`../mail/routes.ts`) and the site's files (`./assets.ts`):
 *
 * - the list's routes answer first, each with the methods it takes, and
 *   none of their answers is kept (`no-store`);
 * - a file is answered to GET and HEAD only; any other method is 405;
 * - a series' former path answers a 301 to its page, query kept, so a
 *   link shared before a rename still lands (`formerSlugs` in
 *   `../content.ts`);
 * - a path that names no file answers with the not-found page, as 404;
 * - every response says how long to keep it: fingerprinted files under
 *   `/assets/` for a year, pages not at all without asking again, and the
 *   rest (icons, link cards, the sitemap) for a day;
 * - every response carries the security headers: the content policy, no
 *   sniffing, no framing, a strict referrer and HTTPS only; a request the
 *   policy dies on (a file read that fails) answers an empty 500 that
 *   carries them too;
 * - a text file (a page, llms.txt, the sitemap) says it is UTF-8, which
 *   every file the prerender writes is.
 */
import { Effect, Option, Predicate } from 'effect';
import { Headers, type HttpServerRequest, HttpServerResponse } from 'effect/http';

import { SERIES } from '../content.ts';
import { mailRoute } from '../mail/routes.ts';
import { Assets, pageRequest, requestUrl } from './assets.ts';

export const CACHE = {
  immutable: 'public, max-age=31536000, immutable',
  page: 'public, max-age=0, must-revalidate',
  day: 'public, max-age=86400',
  never: 'no-store',
} as const;

/**
 * The content policy: everything from this origin and nothing else. The
 * pages carry no inline script or style, so neither is allowed, and a form
 * posts only to this site (the sign-up and the leave button).
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
  "form-action 'self'",
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

/**
 * Each series' former path, to the path of its page. The assets answer a
 * path with or without its trailing slash, so a former path does too.
 */
export const MOVED: ReadonlyMap<string, string> = new Map(
  SERIES.flatMap((series) =>
    series.formerSlugs.map((former) => [`/series/${former}`, `/series/${series.slug}`] as const),
  ),
);

const pathnameOf = (request: HttpServerRequest.HttpServerRequest) => requestUrl(request).pathname;

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

const finish = (
  pathname: string,
  response: HttpServerResponse.HttpServerResponse,
  cache = cacheControl(pathname, response),
) =>
  response.pipe(
    HttpServerResponse.setHeaders(SECURITY_HEADERS),
    HttpServerResponse.setHeader('cache-control', cache),
    (finished) =>
      Option.match(Headers.get(finished.headers, 'content-type'), {
        onNone: () => finished,
        onSome: (type) => HttpServerResponse.setHeader(finished, 'content-type', withCharset(type)),
      }),
  );

const answer = Effect.fn('Site.answer')(function* (request: HttpServerRequest.HttpServerRequest) {
  const pathname = pathnameOf(request);
  const route = mailRoute(request, pathname);
  if (Option.isSome(route)) return finish(pathname, yield* route.value, CACHE.never);
  if (!ALLOWED_METHODS.has(request.method)) {
    return finish(
      pathname,
      HttpServerResponse.text('Method Not Allowed', {
        status: 405,
        headers: { allow: 'GET, HEAD' },
      }),
    );
  }
  const moved = Option.fromNullishOr(MOVED.get(pathname.replace(/(?<=.)\/$/, '')));
  if (Option.isSome(moved)) {
    const search = requestUrl(request).search;
    return finish(
      pathname,
      HttpServerResponse.empty({ status: 301, headers: { location: `${moved.value}${search}` } }),
    );
  }
  const assets = yield* Assets;
  const response = yield* assets.serve(request);
  if (response.status !== 404 && pathname !== NOT_FOUND_PATH) return finish(pathname, response);
  const page = yield* assets.serve(pageRequest(request, NOT_FOUND_PATH));
  return finish(NOT_FOUND_PATH, HttpServerResponse.setStatus(page, 404));
});

/**
 * The policy's answer to `request`. A defect (a file read the host fails)
 * is logged by its kind and answered as an empty 500 with the security
 * headers, so no response the Worker sends goes without its content policy.
 */
export const respond = (request: HttpServerRequest.HttpServerRequest) =>
  answer(request).pipe(
    // The log line names the defect's class, never its message, which may hold a path or a query.
    Effect.catchDefect((defect) =>
      Effect.logError(
        `[site] defect status=500 kind=${Option.match(Option.liftPredicate(defect, Predicate.isError), { onNone: () => 'thrown', onSome: (error) => error.name })}`,
      ).pipe(Effect.as(finish('/', HttpServerResponse.empty({ status: 500 })))),
    ),
  );
