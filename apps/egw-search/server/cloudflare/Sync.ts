/* oxlint-disable effect/noInlineProvide -- each Workflow step is its own boundary: it runs in whatever isolate Cloudflare gives it, after any eviction, so it provides the layers it reads through itself rather than inheriting them from a run that may not be there. */
/**
 * The weekly corpus sync: a Cloudflare Workflow, hosted by its own Worker,
 * that mirrors the EGW library into the search's corpus.
 *
 * The corpus is a mirror of a library that keeps publishing. Without this, the
 * search answers from the last snapshot and silently drifts: new books never
 * appear. Each Sunday the Workflow installs the books the corpus lacks into D1
 * and adds their vectors to Vectorize, so both legs of the search find them.
 *
 * ## Steps
 *
 * Each step is durable: its result is kept, a failed step is retried on its
 * own, and a run that is evicted resumes at the step it reached.
 *
 * 1. `plan` — the remote catalog against D1 (`planEgwSync`).
 * 2. `install <id>` per pending book — download and swap it into D1
 *    (`installEgwBook`). A book the library is known to withhold fails once,
 *    as expected; any other failure is retried, then recorded.
 * 3. `vectors <id> <row>` per page of an installed book — embed its
 *    paragraphs with Workers AI under the index's fingerprint and upsert
 *    them into Vectorize (`./book-vectors.ts`).
 * 4. `optimize` — `PRAGMA optimize`, so D1's planner sees the new rows.
 * 5. `report` — what the run did (`reportEgwSync`). A run with an
 *    unexpected failure ends errored, after doing all the rest, so the
 *    dashboard shows it.
 *
 * ## Only `prod` writes
 *
 * Every stage shares one corpus (`./resources.ts`), so a preview that synced
 * would write production. Only `prod` sets `CORPUS_SYNC=write`; any other
 * stage's Workflow runs the `plan` step alone, which reads the library and D1
 * and writes nothing. That is what the deploy test runs. Every stage carries
 * the cron, so a preview deploy proves the schedule Cloudflare accepts before
 * `prod` meets it.
 *
 * ## Why a Worker of its own
 *
 * The credentials for the library live here and nowhere else: the public
 * search Worker holds none. And a step may use five minutes of CPU here
 * without raising the search's limit.
 */
import { RuntimeContext } from 'alchemy';
import * as Cloudflare from 'alchemy/Cloudflare';
import { Stage } from 'alchemy/Stage';
import * as D1Client from '@effect/sql-d1/D1Client';
import { Config, ConfigProvider, Effect, Layer, Option, Redacted, Schema } from 'effect';
import { HttpServerResponse } from 'effect/http';
import * as SqlClient from 'effect/sql/SqlClient';

import {
  CorpusSupply,
  type EgwBookOutcome,
  type EgwSyncBook,
  type EgwSyncFailure,
  type EgwSyncPlan,
  failureOf,
  installEgwBook,
  isKnownUnavailable,
  layerEgwWritingsAssetSource,
  planEgwSync,
  reportEgwSync,
} from '@bible/core/corpus-supply';
import { EGWApiClient, EGWAuth, EGWTokenStore } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';

import { BOOK_VECTORS_PAGE, type BookVectorsFailed, bookVectorsPage } from './book-vectors.ts';
import { D1Atomic } from './d1-atomic.ts';
import { Corpus, Vectors } from './resources.ts';
import { EMBEDDING_MODEL, workersAiDocuments } from './workers-ai.ts';

/** The prod Worker. Not routed: nothing reaches it but its Workflow. */
export const SYNC_WORKER_NAME = 'egw-sync';

/** The prod Workflow, by a name the dashboard shows plainly. */
export const SYNC_WORKFLOW_NAME = 'egw-corpus-sync';

/** Sundays at 09:00 UTC: 05:00 in Toronto under daylight time, 04:00 under
 *  standard time. Cloudflare's cron runs in UTC only, and numbers the days
 *  1 (Sunday) to 7, so the day is named: a `0` there is refused. */
export const SYNC_SCHEDULE = '0 9 * * SUN';

/** What an instance is asked to do. A scheduled instance carries nothing,
 *  which is a sync on `prod` and a plan anywhere else. `reembed` adds the
 *  vectors of books already installed: the way back for a book whose
 *  vectors failed in an earlier run. */
export const CorpusSyncInput = Schema.Struct({
  mode: Schema.optional(Schema.Literals(['plan', 'sync'])),
  reembed: Schema.optional(Schema.Array(Schema.Finite)),
});
export type CorpusSyncInput = typeof CorpusSyncInput.Type;

const decodeInput = Schema.decodeUnknownOption(CorpusSyncInput);
const NOTHING_ASKED: CorpusSyncInput = {};

/** An install that failed for a reason other than the library withholding
 *  the book: the step's failure, so the step is retried. */
class InstallFailed extends Schema.TaggedError<InstallFailed>()('InstallFailed', {
  id: Schema.Finite,
  code: Schema.String,
  title: Schema.String,
  error: Schema.String,
}) {}

/** A run that finished with something to act on. */
class CorpusSyncIncomplete extends Schema.TaggedError<CorpusSyncIncomplete>()(
  'CorpusSyncIncomplete',
  {
    message: Schema.String,
  },
) {}

const RETRIES = { limit: 3, delay: '1 minute', backoff: 'exponential' } as const;

/** The props, by stage. The running Worker reads them without one. */
const props = Effect.gen(function* () {
  const stage = yield* Effect.serviceOption(Stage);
  const base = {
    main: import.meta.url,
    workersDev: false,
    observability: { enabled: true },
    // A step installs a whole book: decoding its archive is the CPU.
    limits: { cpuMs: 300_000 },
  };
  if (!Option.contains(stage, 'prod')) return base;
  return { ...base, name: SYNC_WORKER_NAME, env: { CORPUS_SYNC: 'write' } };
});

/** The Workflow's props, by stage: the cron everywhere, the plain name on
 *  `prod`. */
const workflowProps = Effect.map(Effect.serviceOption(Stage), (stage) => {
  const schedules = [SYNC_SCHEDULE];
  if (!Option.contains(stage, 'prod')) return { schedules };
  return { workflowName: SYNC_WORKFLOW_NAME, schedules };
});

export default class Sync extends Cloudflare.Worker<Sync>()(
  'Sync',
  props,
  Effect.gen(function* () {
    const corpus = yield* Cloudflare.D1.QueryDatabase(yield* Corpus);
    const vectors = yield* Cloudflare.Vectorize.SearchIndex(yield* Vectors);
    const ai = yield* Cloudflare.Workers.AI();
    const embed = workersAiDocuments((inputs) =>
      ai.run(EMBEDDING_MODEL, inputs).pipe(Effect.provide(RuntimeContext.phantom)),
    );

    yield* Cloudflare.Workflow(
      'CorpusSync',
      yield* workflowProps,
      Effect.gen(function* () {
        // Read at deploy, they become the Worker's secrets; read at run time,
        // they come back from them.
        const clientId = yield* Config.Redacted('EGW_CLIENT_ID');
        const clientSecret = yield* Config.Redacted('EGW_CLIENT_SECRET');

        /** The corpus in D1, written through batches (`D1Atomic`). */
        const corpusLayer = Layer.unwrap(
          Effect.map(corpus.raw, (db) =>
            EGWParagraphDatabase.layerExisting.pipe(
              Layer.provide(D1Atomic),
              Layer.provideMerge(D1Client.layer({ db })),
            ),
          ),
        );
        /** The library, with a token held for the step's life. */
        const library = EGWApiClient.Live.pipe(
          Layer.provide(
            EGWAuth.Live.pipe(
              Layer.provide(EGWTokenStore.layerMemory()),
              Layer.provide(
                ConfigProvider.layer(
                  ConfigProvider.fromUnknown({
                    EGW_CLIENT_ID: Redacted.value(clientId),
                    EGW_CLIENT_SECRET: Redacted.value(clientSecret),
                  }),
                ),
              ),
            ),
          ),
        );
        // A layer that cannot be built (an unreachable token endpoint, a
        // missing binding) is a defect of the step, which stops its retries.
        const planLayer = Layer.mergeAll(library, corpusLayer).pipe(Layer.orDie);
        const installLayer = CorpusSupply.layer.pipe(
          Layer.provide(layerEgwWritingsAssetSource.pipe(Layer.provide(library))),
          Layer.provideMerge(corpusLayer),
          Layer.orDie,
        );
        const readLayer = corpusLayer.pipe(Layer.orDie);

        /** Install one book. An expected failure is the step's result; an
         *  unexpected one is its failure, so it is retried. */
        const install = (book: EgwSyncBook) =>
          Cloudflare.Workflows.task(
            `install ${String(book.id)}`,
            installEgwBook(book, { refresh: false }).pipe(
              Effect.provide(installLayer),
              Effect.flatMap((outcome) =>
                Option.match(
                  Option.filter(failureOf(outcome), (failure) => !failure.expected),
                  {
                    onNone: () => Effect.succeed(outcome),
                    onSome: (failure) =>
                      Effect.fail(
                        InstallFailed.make({
                          id: failure.id,
                          code: failure.code,
                          title: failure.title,
                          error: failure.error,
                        }),
                      ),
                  },
                ),
              ),
            ),
            { retries: RETRIES, timeout: '15 minutes' },
          ).pipe(
            Effect.catchTag('InstallFailed', (failed) => {
              const outcome: EgwBookOutcome = {
                _tag: 'Failed',
                failure: {
                  id: failed.id,
                  code: failed.code,
                  title: failed.title,
                  error: failed.error,
                  expected: isKnownUnavailable(failed.id),
                },
              };
              return Effect.succeed(outcome);
            }),
          );

        /** Every page of a book's vectors, a step each. */
        const vectorsOf = Effect.fn('CorpusSync.vectors')(function* (bookId: number) {
          let after = 0;
          let upserted = 0;
          while (true) {
            const page = yield* Cloudflare.Workflows.task(
              `vectors ${String(bookId)} ${String(after)}`,
              Effect.gen(function* () {
                const index = yield* vectors.raw;
                return yield* bookVectorsPage({ bookId, after }, embed, index);
              }).pipe(Effect.provide(readLayer)),
              { retries: RETRIES, timeout: '10 minutes' },
            );
            upserted += page.upserted;
            after = page.after;
            if (page.read < BOOK_VECTORS_PAGE) return upserted;
          }
        });

        const planned = planEgwSync({ lang: 'en', refresh: false }).pipe(Effect.provide(planLayer));
        const planStep = Cloudflare.Workflows.task('plan', planned, { retries: RETRIES });
        const optimized = Effect.flatMap(SqlClient.SqlClient, (sql) => sql`PRAGMA optimize`).pipe(
          Effect.asVoid,
          Effect.provide(readLayer),
          Effect.orDie,
        );
        const optimizeStep = Cloudflare.Workflows.task('optimize', optimized);
        const reportStep = (plan: EgwSyncPlan, failures: readonly EgwSyncFailure[]) =>
          Cloudflare.Workflows.task(
            'report',
            reportEgwSync(plan, failures).pipe(Effect.provide(readLayer), Effect.orDie),
          );

        // A scheduled instance carries no payload at all, so the input is
        // read as nothing until it decodes.
        return Effect.fn('CorpusSync.run')(function* (payload: CorpusSyncInput) {
          const env = yield* Cloudflare.WorkerEnvironment;
          const input = Option.getOrElse(
            Option.flatMap(Option.fromNullishOr(payload), decodeInput),
            () => NOTHING_ASKED,
          );
          const writes = env['CORPUS_SYNC'] === 'write' && input.mode !== 'plan';

          const plan = yield* planStep;
          yield* Effect.log(
            'egw_sync_plan',
            `writes=${String(writes)} remote=${String(plan.remote.length)}` +
              ` installed=${String(plan.installedBefore)} pending=${String(plan.pending.length)}`,
          );
          if (!writes) {
            return {
              mode: 'plan' as const,
              remote: plan.remote.length,
              installedBefore: plan.installedBefore,
              pending: plan.pending.map((book) => book.code),
            };
          }

          const failures: EgwSyncFailure[] = [];
          const vectorFailures: { readonly id: number; readonly reason: string }[] = [];
          const addVectors = (bookId: number) =>
            vectorsOf(bookId).pipe(
              Effect.catchTag('BookVectorsFailed', (failed: BookVectorsFailed) =>
                Effect.sync(() => {
                  vectorFailures.push({ id: failed.bookId, reason: failed.reason });
                  return 0;
                }),
              ),
            );
          for (const book of plan.pending) {
            const outcome = yield* install(book);
            const failure = failureOf(outcome);
            if (Option.isSome(failure)) {
              failures.push(failure.value);
              continue;
            }
            yield* addVectors(book.id);
          }
          for (const id of input.reembed ?? []) yield* addVectors(id);

          yield* optimizeStep;
          const report = yield* reportStep(plan, failures);
          yield* Effect.log(
            'egw_sync_done',
            `installed=${String(report.installed)} failed=${String(report.failed)}` +
              ` unexpected=${String(report.unexpectedFailures)}` +
              ` vector_failures=${String(vectorFailures.length)}`,
          );
          if (report.unexpectedFailures > 0 || vectorFailures.length > 0) {
            return yield* CorpusSyncIncomplete.make({
              message:
                `unexpected install failures: ${report.failures
                  .filter((failure) => !failure.expected)
                  .map((failure) => `${failure.code} (${failure.error})`)
                  .join(', ')}; ` +
                `vector failures: ${vectorFailures.map((failed) => `${String(failed.id)} (${failed.reason})`).join(', ')}`,
            });
          }
          return { mode: 'sync' as const, report };
        });
      }),
    );

    return { fetch: Effect.succeed(HttpServerResponse.text('Not Found', { status: 404 })) };
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        Cloudflare.D1.QueryDatabaseBinding,
        Cloudflare.Vectorize.SearchIndexBinding,
        Cloudflare.Workers.AIBinding,
      ),
    ),
  ),
) {}
