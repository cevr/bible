/**
 * The deploy, checked against real Railway: a throwaway `test_$USER` stage is
 * deployed, probed and destroyed in one scope, so a failure destroys it too.
 *
 * Outside Bun's test pattern on purpose, so the gate never deploys. Run it with
 * `bun run test:deploy` (it builds first) before handing off a change to the
 * stack, the server, or the Alchemy or Effect versions. About a minute.
 */
import { expect } from 'bun:test';
import * as Alchemy from 'alchemy';
import * as Test from 'alchemy/Test/Bun';
import { Effect, Option, Schedule } from 'effect';
import { HttpClient } from 'effect/http';

import Stack, { providers } from '../alchemy.run.ts';

const { test, deploy, destroy } = Test.make({ providers, state: Alchemy.localState() });

const deployed = Effect.acquireRelease(deploy(Stack), () => destroy(Stack).pipe(Effect.orDie));

test(
  'the site serves its pages, assets and health check from Railway',
  Effect.gen(function* () {
    const outputs = yield* deployed;
    const url = yield* Effect.fromOption(Option.fromNullishOr(outputs.url));
    const raw = yield* HttpClient.HttpClient;
    const client = raw.pipe(HttpClient.filterStatusOk);
    // A fresh service answers 404 or 502 for a few seconds after it deploys.
    const get = (path: string) =>
      client
        .get(`${url}${path}`)
        .pipe(Effect.retry({ schedule: Schedule.exponential('1 second'), times: 8 }));

    const health = yield* get('/health');
    expect(yield* health.text).toBe('ok');

    const home = yield* get('/');
    const html = yield* home.text;
    expect(html).toContain('Tried Gold');

    const post = yield* get('/blog/the-refining-process');
    expect(yield* post.text).toContain('The Refining Process');

    const asset = /\/assets\/[^"]+\.css/.exec(html)?.[0] ?? '/missing.css';
    const css = yield* get(asset);
    expect(css.headers['cache-control']).toBe('public, max-age=31536000, immutable');

    const missing = yield* raw.get(`${url}/nope`);
    expect(missing.status).toBe(404);
  }).pipe(Effect.scoped),
  { timeout: 600_000 },
);
