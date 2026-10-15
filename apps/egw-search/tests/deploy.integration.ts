/**
 * The deploy, checked against real Cloudflare: a throwaway `test_$USER` stage
 * is deployed, probed and destroyed in one scope, so a failure destroys it too.
 * The stage reads the shared corpus and vectors, and destroying it leaves them.
 *
 * Outside Bun's test pattern on purpose, so the gate never deploys. Run it with
 * `bun run test:deploy` (it builds first) before handing off a change to the
 * stack, the Worker, or the Alchemy or Effect versions.
 */
import { expect } from 'bun:test';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Test from 'alchemy/Test/Bun';
import { Effect, Option, Schedule, Schema } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';

import Stack, { providers } from '../alchemy.run.ts';

const { test, deploy, destroy } = Test.make({ providers, state: Cloudflare.state() });

const deployed = Effect.acquireRelease(deploy(Stack), () => destroy(Stack).pipe(Effect.orDie));

const Health = Schema.Struct({ ok: Schema.Boolean, vector: Schema.String });

const Searched = Schema.Struct({
  vector: Schema.String,
  hits: Schema.Array(Schema.Struct({ refcode: Schema.NullOr(Schema.String) })),
});

test(
  'the Worker serves the page and answers hybrid searches from D1, Vectorize and Workers AI',
  Effect.gen(function* () {
    const outputs = yield* deployed;
    const url = yield* Effect.fromOption(Option.fromNullishOr(outputs.url));
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.filterStatusOk);
    // A fresh workers.dev host can answer an error for a few seconds after deploy.
    const get = (path: string) =>
      client
        .get(`${url}${path}`)
        .pipe(Effect.retry({ schedule: Schedule.exponential('1 second'), times: 8 }));

    const health = yield* get('/health').pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Health)),
    );
    expect(health).toEqual({ ok: true, vector: 'ready' });

    for (const page of ['/', '/a/deep/link']) {
      const html = yield* get(page).pipe(Effect.flatMap((response) => response.text));
      expect([page, html]).toEqual([page, expect.stringContaining('<title>EGW Search</title>')]);
    }

    // Wordy enough to route hybrid, and broad enough that no lexical hit
    // short-circuits the vector leg.
    const searched = yield* get(
      `/api/search?q=${encodeURIComponent('what happens at the close of probation')}`,
    ).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Searched)));
    expect(searched.vector).toBe('hybrid');
    expect(searched.hits.length).toBeGreaterThan(0);

    const exact = yield* get(`/api/search?q=${encodeURIComponent('"the desire of ages"')}`).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Searched)),
    );
    expect(exact.hits.length).toBeGreaterThan(0);
  }).pipe(Effect.scoped),
  { timeout: 600_000 },
);
