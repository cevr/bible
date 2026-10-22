import { BunServices } from '@effect/platform-bun';
import { describe, expect, it } from 'effect-bun-test';
import { Array as Arr, Effect, Layer, Option } from 'effect';
import { Headers, HttpServerRequest, HttpServerResponse } from 'effect/http';

import { layerSite } from '../mail/films.ts';
import { layerTest } from '../mail/local.ts';
import { Assets } from './assets.ts';
import { MAIL_ROUTES } from '../mail/paths.ts';
import { CACHE, CONTENT_SECURITY_POLICY, MOVED, respond, withCharset } from './respond.ts';

/** The site's files as a map from path to body and type: a file of each kind the build writes. */
const FILES = new Map<string, readonly [string, string]>([
  ['/', ['<h1>home</h1>', 'text/html; charset=utf-8']],
  ['/about', ['<h1>about</h1>', 'text/html; charset=utf-8']],
  ['/404', ['<h1>Page not found</h1>', 'text/html; charset=utf-8']],
  ['/assets/client-abc12345.css', ['body{}', 'text/css']],
  ['/assets/client-abc12345.js', ['export{}', 'text/javascript']],
  ['/assets/emblem-path-abc12345.svg', ['<svg/>', 'image/svg+xml']],
  ['/assets/field-768-abc12345.webp', ['RIFF', 'image/webp']],
  ['/assets/Newsreader-abc12345.woff2', ['wOF2', 'font/woff2']],
  ['/og/home.jpg', ['jpeg', 'image/jpeg']],
  ['/icon-192.png', ['png', 'image/png']],
  ['/favicon.ico', ['ico', 'image/x-icon']],
  ['/site.webmanifest', ['{}', 'application/manifest+json']],
  ['/sitemap.xml', ['<urlset/>', 'application/xml']],
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

/** A seeded draw in [0, 1). */
const draws = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const pick = <A>(next: () => number, from: readonly [A, ...ReadonlyArray<A>]): A =>
  from[Math.floor(next() * from.length)] ?? from[0];

/**
 * A content policy's directives, as a browser reads them (CSP Level 3): by
 * `;`, each name in any case, and the first of a name the one that holds.
 */
const directivesOf = (policy: string): ReadonlyMap<string, ReadonlyArray<string>> => {
  const directives = new Map<string, ReadonlyArray<string>>();
  for (const written of policy.split(';')) {
    const [first = '', ...sources] = written.trim().split(/\s+/u);
    const name = first.toLowerCase();
    if (name !== '' && !directives.has(name)) directives.set(name, sources);
  }
  return directives;
};

/**
 * The directives through which a page can paint a picture, each with the
 * ones a browser falls back to when it is not written: an image (`img`, a
 * stylesheet's `url()`, an icon, a poster), an `<object>` or `<embed>`, a
 * frame, and a video.
 */
const PICTURE_DIRECTIVES: ReadonlyArray<ReadonlyArray<string>> = [
  ['img-src', 'default-src'],
  ['object-src', 'default-src'],
  ['frame-src', 'child-src', 'default-src'],
  ['fenced-frame-src', 'frame-src', 'child-src', 'default-src'],
  ['media-src', 'default-src'],
];

/** The sources that let in only what this origin serves. */
const SELF_ONLY = new Set(["'self'", "'none'"]);

/**
 * Each way `policy` lets a picture in from anywhere but this origin: a
 * picture directive (or the one it falls back to) holding a source other
 * than `'self'` or `'none'` (`data:`, `blob:`, `*`, a scheme or a host), or
 * none of them written, so anything loads.
 */
const foreignPictures = (policy: string): ReadonlyArray<string> => {
  const directives = directivesOf(policy);
  return PICTURE_DIRECTIVES.flatMap((chain) => {
    const holding = Arr.findFirst(chain, (name) =>
      Option.map(Option.fromNullishOr(directives.get(name)), (sources) => [name, sources] as const),
    );
    return Option.match(holding, {
      onNone: () => [`${chain[0]}: nothing written, so anything loads`],
      onSome: ([holding, sources]) => {
        if (sources.length === 0) return [`${chain[0]}: ${holding} lists no source`];
        return sources
          .filter((source) => !SELF_ONLY.has(source.toLowerCase()))
          .map((source) => `${chain[0]}: ${holding} lets in ${source}`);
      },
    });
  });
};

/** Characters a drawn path's segments are made of, escapes, dots and words beyond ASCII among them. */
const PATH_CHARACTERS: readonly [string, ...ReadonlyArray<string>] = [
  'a',
  'z',
  '0',
  '-',
  '_',
  '.',
  '%20',
  '%2F',
  '%2e',
  'é',
  '~',
  'data:',
  '..',
];

/** A path no file is at: up to four segments drawn from `PATH_CHARACTERS`, a trailing slash or not. */
const strayPath = (next: () => number) => {
  const segments = Array.from({ length: 1 + Math.floor(next() * 4) }, () =>
    Array.from({ length: 1 + Math.floor(next() * 6) }, () => pick(next, PATH_CHARACTERS)).join(''),
  );
  return `/${segments.join('/')}${pick(next, ['/', '', ''])}`;
};

/** A query, or none. */
const query = (next: () => number) =>
  pick(next, ['', '?utm_source=youtube', '?token=x', '?a=data:image/png;base64,AA']);

/**
 * A request of each kind the Worker answers, drawn at random: a file the
 * build writes (a page, a script, a stylesheet, a font, a picture, a
 * manifest), a path with no file (the not-found page) and the not-found page
 * itself, a series' former path (a 301), an email list route under each
 * method, and any path under a method no file takes (a 405).
 */
const drawnRequest = (next: () => number): readonly [string, string] => {
  const files = [...FILES.keys()] as [string, ...Array<string>];
  const methods = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'] as const;
  const moved: readonly [string, ...Array<string>] = ['/about', ...MOVED.keys()];
  const kinds: readonly [
    () => readonly [string, string],
    ...Array<() => readonly [string, string]>,
  ] = [
    () => [`${pick(next, files)}${query(next)}`, pick(next, ['GET', 'HEAD'])],
    () => [strayPath(next) + query(next), pick(next, ['GET', 'HEAD'])],
    () => ['/404', 'GET'],
    () => [`${pick(next, moved)}${pick(next, ['/', ''])}${query(next)}`, 'GET'],
    () => [
      pick(next, [
        MAIL_ROUTES.subscribe,
        MAIL_ROUTES.confirm,
        MAIL_ROUTES.unsubscribe,
        MAIL_ROUTES.send,
      ]) + query(next),
      pick(next, methods),
    ],
    () => [
      pick(next, [...files, strayPath(next)] as [string, ...Array<string>]),
      pick(next, methods),
    ],
  ];
  return pick(next, kinds)();
};

const header = (response: HttpServerResponse.HttpServerResponse, name: string) =>
  Option.getOrElse(Headers.get(response.headers, name), () => '');

const test = it.effect.layer(
  Layer.mergeAll(AssetsTest, layerTest(layerSite)).pipe(Layer.provide(BunServices.layer)),
);

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

  test("answers the health series' former path, with or without its trailing slash, with a 301 to its page, query kept", () =>
    Effect.gen(function* () {
      const response = yield* get('/series/the-true-remedies');
      expect(response.status).toBe(301);
      expect(header(response, 'location')).toBe('/series/health-and-cure');
      expect(header(response, 'cache-control')).toBe(CACHE.page);
      expect(header(response, 'content-security-policy')).toBe(CONTENT_SECURITY_POLICY);
      const tagged = yield* get('/series/the-true-remedies?utm_source=youtube', 'HEAD');
      expect(tagged.status).toBe(301);
      expect(header(tagged, 'location')).toBe('/series/health-and-cure?utm_source=youtube');
      const slashed = yield* get('/series/the-true-remedies/?utm_source=youtube');
      expect(slashed.status).toBe(301);
      expect(header(slashed, 'location')).toBe('/series/health-and-cure?utm_source=youtube');
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

  test('every response, of each kind the Worker sends over random paths and methods, carries a content policy that lets no picture in from anywhere but this origin, so a data URL never paints', () =>
    Effect.gen(function* () {
      const next = draws(41);
      const seen = new Set<number>();
      for (let round = 0; round < 400; round += 1) {
        const [path, method] = drawnRequest(next);
        const response = yield* get(path, method);
        seen.add(response.status);
        const policies = Option.toArray(Headers.get(response.headers, 'content-security-policy'));
        expect([path, method, policies.length]).toEqual([path, method, 1]);
        expect([path, method, foreignPictures(policies[0] ?? '')]).toEqual([path, method, []]);
      }
      // Each kind of answer was drawn: a file, a redirect, a refused method, the not-found page.
      expect([200, 301, 404, 405].filter((status) => !seen.has(status))).toEqual([]);
    }));

  test('the policy reader refuses each way a policy lets a foreign picture in, and passes one that keeps to this origin', () =>
    Effect.sync(() => {
      const refused = [
        "default-src 'self'; img-src 'self' data:",
        "default-src 'self'; img-src 'self' blob:",
        "default-src 'self'; IMG-SRC *",
        "default-src 'self'; img-src https:",
        "default-src 'self'; img-src cdn.example.com",
        "default-src data:; script-src 'self'",
        "script-src 'self'",
        "default-src 'self'; img-src data:; img-src 'self'",
        "default-src 'self'; object-src data:",
        "default-src 'self'; child-src data:",
        "default-src 'self'; frame-src blob:",
        "default-src 'self'; media-src data:",
        "default-src 'self'; img-src",
      ];
      for (const policy of refused)
        expect([policy, foreignPictures(policy)]).not.toEqual([policy, []]);
      const passed = [
        CONTENT_SECURITY_POLICY,
        "default-src 'none'",
        "default-src 'self'; img-src 'self'; img-src data:",
        "Default-Src 'SELF'",
      ];
      for (const policy of passed) expect([policy, foreignPictures(policy)]).toEqual([policy, []]);
    }));

  test('the content policy lets a form post to this site and nowhere else', () =>
    Effect.sync(() => {
      const directives = CONTENT_SECURITY_POLICY.split('; ');
      expect(directives).toContain("form-action 'self'");
      expect(directives.filter((directive) => directive.startsWith('form-action'))).toHaveLength(1);
    }));

  test('a text file says it is UTF-8, and a picture is left as it is', () =>
    Effect.gen(function* () {
      expect(header(yield* get('/llms.txt'), 'content-type')).toBe('text/plain; charset=utf-8');
      expect(header(yield* get('/favicon.ico'), 'content-type')).toBe('image/x-icon');
      expect(withCharset('application/xml')).toBe('application/xml; charset=utf-8');
      expect(withCharset('text/html; charset=utf-8')).toBe('text/html; charset=utf-8');
    }));
});
