import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { HttpRouter } from 'effect/http';

import { nameOfKey, reportKey, type ReportStore, syncRoutes } from './sync-pages.ts';

const REPORTS = new Map([
  ['20261011T090000Z', '# EGW sync, 2026-10-11\n\nNothing.\n'],
  [
    '20261018T090012Z',
    '# EGW sync, 2026-10-18\n\n> he went ~~to~~ **into** the mount\n\n<script>x</script>\n',
  ],
]);

const store: ReportStore = {
  names: Effect.succeed([...REPORTS.keys()]),
  read: (name) => Effect.succeed(Option.fromNullishOr(REPORTS.get(name))),
};

/** The routes as the Worker mounts them. */
const { handler } = HttpRouter.toWebHandler(syncRoutes(store), { disableLogger: true });

/** The answer to a path, as the browser gets it. */
const answer = (path: string) =>
  Effect.gen(function* () {
    const web = yield* Effect.promise(() => handler(new Request(`https://egw.test${path}`)));
    const body = yield* Effect.promise(() => web.text());
    return { status: web.status, type: web.headers.get('content-type') ?? '', body };
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

  test('a report renders, its HTML escaped', () =>
    run(
      Effect.gen(function* () {
        const page = yield* answer('/sync/20261018T090012Z');
        expect(page.body).toContain('<del>to</del> <strong>into</strong>');
        expect(page.body).toContain('&lt;script&gt;');
        expect(page.body).not.toContain('<script>');
      }),
    ));

  test('latest.md answers the newest report as text', () =>
    run(
      Effect.gen(function* () {
        const page = yield* answer('/sync/latest.md');
        expect(page.type).toContain('text/plain');
        expect(page.body).toStartWith('# EGW sync, 2026-10-18');
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
