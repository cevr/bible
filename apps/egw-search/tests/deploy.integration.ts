/**
 * The deploy, checked against real Cloudflare: a throwaway `test_$USER` stage
 * is deployed, probed and destroyed in one scope, so a failure destroys it too.
 * The stage reads the shared corpus and vectors, and destroying it leaves them.
 *
 * The sync is run too, as an instance of the stage's Workflow. A stage other
 * than `prod` only plans (`server/cloudflare/Sync.ts`), so the run reads the
 * library and the corpus and writes nothing. Deploying needs `EGW_CLIENT_ID`
 * and `EGW_CLIENT_SECRET` in the environment.
 *
 * Outside Bun's test pattern on purpose, so the gate never deploys. Run it with
 * `bun run test:deploy` (it builds first) before handing off a change to the
 * stack, the Worker, or the Alchemy or Effect versions.
 */
import { expect } from 'bun:test';
import * as workers from '@distilled.cloud/cloudflare/workers';
import * as workflows from '@distilled.cloud/cloudflare/workflows';
import * as Cloudflare from 'alchemy/Cloudflare';
import * as Test from 'alchemy/Test/Bun';
import * as TestCore from 'alchemy/Test/Core';
import { Effect, Option, Schedule, Schema } from 'effect';
import { HttpClient, HttpClientResponse } from 'effect/http';

import Stack, { providers } from '../alchemy.run.ts';
import { CorpusSyncInput } from '../server/cloudflare/Sync.ts';

const options = { providers, state: Cloudflare.state() };
const { test, deploy, destroy } = Test.make(options);

const deployed = Effect.acquireRelease(deploy(Stack), () => destroy(Stack).pipe(Effect.orDie));

const Health = Schema.Struct({ ok: Schema.Boolean, vector: Schema.String });

/** What a plan-only run of the sync answers. */
const Planned = Schema.Struct({
  mode: Schema.Literal('plan'),
  remote: Schema.Finite,
  installedBefore: Schema.Finite,
  pending: Schema.Array(Schema.String),
});
const decodePlanned = Schema.decodeUnknownEffect(
  Schema.Union([Planned, Schema.fromJsonString(Planned)]),
);

const encodeInput = Schema.encodeSync(Schema.fromJsonString(CorpusSyncInput));

/** Start an instance of the sync Worker's Workflow and wait for it to end. */
const runSync = (scriptName: string) =>
  TestCore.withProviders(
    Effect.gen(function* () {
      const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;
      const settings = yield* workers.getScriptScriptAndVersionSetting({ accountId, scriptName });
      const workflowName = yield* Effect.fromOption(
        Option.fromNullishOr(
          (settings.bindings ?? []).find(
            (binding): binding is Extract<typeof binding, { type: 'workflow' }> =>
              binding.type === 'workflow',
          ),
        ),
      ).pipe(Effect.map((binding) => binding.workflowName));
      const created = yield* workflows.createInstance({
        accountId,
        workflowName,
        params: encodeInput({ mode: 'plan' }),
      });
      return yield* workflows
        .getInstance({ accountId, workflowName, instanceId: created.id, simple: true })
        .pipe(
          Effect.repeat({
            schedule: Schedule.spaced('5 seconds'),
            until: (instance) => !['queued', 'running', 'waiting'].includes(instance.status),
            times: 60,
          }),
        );
    }),
    options,
    'egw-search',
  );

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

    // The sync's reports are read from R2 on the Worker, ahead of the assets.
    const reports = yield* get('/sync/').pipe(Effect.flatMap((response) => response.text));
    expect(reports).toContain('<h1>EGW sync reports</h1>');

    // The sync reaches the library with the deployed credentials and reads
    // the corpus from a Workflow step; on this stage it stops there.
    const syncWorker = yield* Effect.fromOption(Option.fromNullishOr(outputs.syncWorker));
    const run = yield* runSync(syncWorker);
    expect({ status: run.status, error: run.error }).toMatchObject({ status: 'complete' });
    const planned = yield* decodePlanned(run.output);
    expect(planned.remote).toBeGreaterThan(1000);
    expect(planned.installedBefore).toBeGreaterThan(1000);
  }).pipe(Effect.scoped),
  { timeout: 600_000 },
);
