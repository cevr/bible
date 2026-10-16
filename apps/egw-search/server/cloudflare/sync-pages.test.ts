import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { HttpRouter } from 'effect/http';

import {
  nameOfKey,
  reportKey,
  reportPage,
  reportPageKey,
  type ReportStore,
  syncRoutes,
} from './sync-pages.ts';

const REPORTS = new Map([
  ['20261011T090000Z', '# EGW sync, 2026-10-11\n\nNothing.\n'],
  [
    '20261018T090012Z',
    '# EGW sync, 2026-10-18\n\n> he went ~~to~~ **into** the mount\n\n<script>x</script>\n',
  ],
]);

/** The newer report also has its page stored; the older one has only its
 *  Markdown, as a report published before pages were. */
const FILES = new Map([
  ...[...REPORTS].map(([name, text]) => [reportKey(name), text] as const),
  [reportPageKey('20261018T090012Z'), '<!doctype html><p>stored page</p>'],
]);

const store: ReportStore = {
  names: Effect.succeed([...REPORTS.keys()]),
  open: (key) =>
    Effect.succeed(
      Option.map(Option.fromNullishOr(FILES.get(key)), (text) => ({
        body: text,
        text: Effect.succeed(text),
      })),
    ),
};

/** The routes as the Worker mounts them. */
const { handler } = HttpRouter.toWebHandler(syncRoutes(store), { disableLogger: true });

/** The answer to a path, as the browser gets it. */
const answer = (path: string) =>
  Effect.gen(function* () {
    const web = yield* Effect.promise(() => handler(new Request(`https://egw.test${path}`)));
    const body = yield* Effect.promise(() => web.text());
    return {
      status: web.status,
      type: web.headers.get('content-type') ?? '',
      cache: web.headers.get('cache-control') ?? '',
      location: web.headers.get('location') ?? '',
      body,
    };
  });

const run = <A>(effect: Effect.Effect<A>) => Effect.runPromise(effect);

describe('the sync report pages', () => {
  test('a report key names its report, and nothing else does', () => {
    expect(nameOfKey(reportKey('20261018T090012Z'))).toEqual(Option.some('20261018T090012Z'));
    expect(nameOfKey('reports/../secret.md')).toEqual(Option.none());
  });

  test('the index lists the newest report first', () =>
    run(
      Effect.gen(function* () {
        const page = yield* answer('/sync/');
        expect(page.status).toBe(200);
        expect((yield* answer('/sync')).body).toBe(page.body);
        expect(page.body.indexOf('2026-10-18 09:00 UTC')).toBeLessThan(
          page.body.indexOf('2026-10-11 09:00 UTC'),
        );
      }),
    ));

  test('a report page renders its Markdown, its HTML escaped', () => {
    const page = reportPage('20261018T090012Z', REPORTS.get('20261018T090012Z') ?? '');
    expect(page).toContain('<title>EGW sync, 2026-10-18 09:00 UTC</title>');
    expect(page).toContain('<del>to</del> <strong>into</strong>');
    expect(page).toContain('&lt;script&gt;');
    expect(page).not.toContain('<script>');
  });

  test('a report with a stored page answers that page, cached', () =>
    run(
      Effect.gen(function* () {
        const page = yield* answer('/sync/20261018T090012Z');
        expect(page.type).toContain('text/html');
        expect(page.body).toBe('<!doctype html><p>stored page</p>');
        expect(page.cache).toContain('max-age=86400');
      }),
    ));

  test('a report with no stored page is rendered from its Markdown', () =>
    run(
      Effect.gen(function* () {
        const page = yield* answer('/sync/20261011T090000Z');
        expect(page.status).toBe(200);
        expect(page.body).toBe(
          reportPage('20261011T090000Z', REPORTS.get('20261011T090000Z') ?? ''),
        );
        expect(page.cache).toContain('max-age=86400');
      }),
    ));

  test("a report's Markdown answers as text", () =>
    run(
      Effect.gen(function* () {
        const page = yield* answer('/sync/20261018T090012Z.md');
        expect(page.type).toContain('text/plain');
        expect(page.body).toStartWith('# EGW sync, 2026-10-18');
      }),
    ));

  test('latest redirects to the newest report, either way', () =>
    run(
      Effect.gen(function* () {
        const page = yield* answer('/sync/latest');
        expect(page.status).toBe(302);
        expect(page.location).toBe('/sync/20261018T090012Z');
        expect((yield* answer('/sync/latest.md')).location).toBe('/sync/20261018T090012Z.md');
        expect(page.cache).toContain('max-age=60');
      }),
    ));

  test('an unknown or malformed name is not found', () =>
    run(
      Effect.gen(function* () {
        expect((yield* answer('/sync/20991231T000000Z')).status).toBe(404);
        expect((yield* answer('/sync/..%2Fsecret')).status).toBe(404);
      }),
    ));
});
