import { describe, expect, it } from 'effect-bun-test';
import { Effect, Layer, Option } from 'effect';
import { Headers, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { Assets } from './assets.ts';
import { CACHE, CONTENT_SECURITY_POLICY, respond, withCharset } from './respond.ts';

/** The site's files as a map from path to body and type. */
const FILES = new Map<string, readonly [string, string]>([
  ['/', ['<h1>home</h1>', 'text/html; charset=utf-8']],
  ['/about', ['<h1>about</h1>', 'text/html; charset=utf-8']],
  ['/404', ['<h1>Page not found</h1>', 'text/html; charset=utf-8']],
  ['/assets/client-abc12345.css', ['body{}', 'text/css']],
  ['/favicon.ico', ['ico', 'image/x-icon']],
  ['/llms.txt', ['# First the Blade', 'text/plain']],
]);

const AssetsTest = Layer.succeed(
  Assets,
  Assets.of({
    serve: (request) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;
      const file = Option.fromNullishOr(FILES.get(pathname));
      return Effect.succeed(
        Option.match(file, {
          onNone: () => HttpServerResponse.text('Not Found', { status: 404 }),
          onSome: ([body, contentType]) => HttpServerResponse.text(body, { contentType }),
        }),
      );
    },
  }),
);

const get = (path: string, method = 'GET') =>
  respond(HttpServerRequest.fromWeb(new Request(`https://firsttheblade.test${path}`, { method })));

const header = (response: HttpServerResponse.HttpServerResponse, name: string) =>
  Option.getOrElse(Headers.get(response.headers, name), () => '');

const test = it.effect.layer(AssetsTest);

describe('the Worker policy', () => {
  test('serves a page that is never kept without asking again', () =>
    Effect.gen(function* () {
      const response = yield* get('/about');
      expect(response.status).toBe(200);
      expect(header(response, 'cache-control')).toBe(CACHE.page);
    }));

  test('keeps fingerprinted files for a year and other files for a day', () =>
    Effect.gen(function* () {
      const asset = yield* get('/assets/client-abc12345.css');
      expect(header(asset, 'cache-control')).toBe(CACHE.immutable);
      const icon = yield* get('/favicon.ico');
      expect(header(icon, 'cache-control')).toBe(CACHE.day);
    }));

  test('answers a path with no file with the not-found page, as 404', () =>
    Effect.gen(function* () {
      const response = yield* get('/no/such/page');
      expect(response.status).toBe(404);
      expect(header(response, 'content-type')).toStartWith('text/html');
      expect(header(response, 'cache-control')).toBe(CACHE.page);
    }));

  test('answers the not-found page itself as 404', () =>
    Effect.gen(function* () {
      const response = yield* get('/404');
      expect(response.status).toBe(404);
    }));

  test('refuses methods other than GET and HEAD', () =>
    Effect.gen(function* () {
      const response = yield* get('/', 'POST');
      expect(response.status).toBe(405);
      expect(header(response, 'allow')).toBe('GET, HEAD');
      const head = yield* get('/', 'HEAD');
      expect(head.status).toBe(200);
    }));

  test('puts the security headers on every response', () =>
    Effect.gen(function* () {
      for (const path of ['/', '/assets/client-abc12345.css', '/missing']) {
        const response = yield* get(path);
        expect(header(response, 'content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
        expect(header(response, 'x-content-type-options')).toBe('nosniff');
        expect(header(response, 'x-frame-options')).toBe('DENY');
        expect(header(response, 'strict-transport-security')).toBe('max-age=31536000');
      }
    }));

  test('a text file says it is UTF-8, and a picture is left as it is', () =>
    Effect.gen(function* () {
      expect(header(yield* get('/llms.txt'), 'content-type')).toBe('text/plain; charset=utf-8');
      expect(header(yield* get('/favicon.ico'), 'content-type')).toBe('image/x-icon');
      expect(withCharset('application/xml')).toBe('application/xml; charset=utf-8');
      expect(withCharset('text/html; charset=utf-8')).toBe('text/html; charset=utf-8');
    }));
});
