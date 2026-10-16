/* oxlint-disable effect/noInlineProvide -- each Workflow step is its own boundary: it runs in whatever isolate Cloudflare gives it, after any eviction, so it provides the layers it reads through itself rather than inheriting them from a run that may not be there. */
/**
 * The weekly corpus sync: a Cloudflare Workflow, hosted by its own Worker,
 * that mirrors the EGW library into the search's corpus.
 *
 * The corpus is a mirror of a library that keeps publishing. Without this, the
 * search answers from the last snapshot and silently drifts: new books never
 * appear, and revised ones keep their old text. Each Sunday the Workflow
 * installs the books the corpus lacks into D1 and adds their vectors to
 * Vectorize, so both legs of the search find them. It also rechecks books
 * whose revision moved (`egwBookRevision`): each is downloaded again, the
 * install records the paragraphs it changed, and only those are embedded
 * again.
 *
 * ## Steps
 *
 * Each step is durable: its result is kept, a failed step is retried on its
 * own, and a run that is evicted resumes at the step it reached.
 *
 * 1. `plan` — the remote catalog against D1 (`planEgwSync`).
 * 2. `install <id>` per book to add or recheck — download and swap it into
 *    D1 (`installEgwBook`). A book the library is known to withhold fails
 *    once, as expected; any other failure is retried, then recorded.
 *    Rechecks are capped (`RECHECK_LIMIT`, or the input's `recheck` up to
 *    `RECHECK_MAX`): the books whose content hash moved first, then the
 *    books installed before revisions were hashes.
 * 3. `vectors <id> <row>` per page of an added book, `changed vectors <id>
 *    <row>` per page of what a recheck added or edited — embed paragraphs
 *    with Workers AI under the index's fingerprint and upsert them into
 *    Vectorize (`./book-vectors.ts`); `unindex <id>` deletes the vectors of
 *    paragraphs a recheck removed.
 * 4. `optimize` — `PRAGMA optimize`, so D1's planner sees the new rows.
 * 5. `report` — what the run did (`reportEgwSync`). A run with an
 *    unexpected failure ends errored, after doing all the rest, so the
 *    dashboard shows it.
 * 6. `publish report` — the full report in Markdown, into R2
 *    (`./sync-report.ts`), served at `egw.cvr.im/sync/<name>`.
 * 7. `mail` — the run's outcome, mailed to its owner (`./sync-mail.ts`):
 *    what was added, what the library updated with its first changes, what
 *    failed, and the report's link; or where a run stopped. Only `prod`
 *    publishes a report and mails.
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
import {
  Cause,
  Config,
  ConfigProvider,
  DateTime,
  Effect,
  Exit,
  Layer,
  Option,
  Predicate,
  Redacted,
  Schema,
} from 'effect';
import { HttpServerResponse } from 'effect/http';
import * as SqlClient from 'effect/sql/SqlClient';

import {
  CorpusSupply,
  type EgwBookOutcome,
  type EgwSyncBook,
  type EgwSyncFailure,
  type EgwSyncPlan,
  failureOf,
  latestParagraphChanges,
  installEgwBook,
  isKnownUnavailable,
  layerEgwWritingsAssetSource,
  planEgwSync,
  reportEgwSync,
} from '@bible/core/corpus-supply';
import { EGWApiClient, EGWAuth, EGWTokenStore } from '@bible/core/egw';
import { EGWParagraphDatabase, type ParagraphChangeRow } from '@bible/core/egw-db';

import {
  BOOK_VECTORS_PAGE,
  type BookVectorsFailed,
  bookVectorsPage,
  type BookVectorsScope,
  deleteVectorIds,
  removedVectorIds,
} from './book-vectors.ts';
import { D1Atomic } from './d1-atomic.ts';
import { Corpus, SyncReports, Vectors } from './resources.ts';
import { DOMAIN } from './site.ts';
import { reportKey, reportPage, reportPageKey } from './sync-pages.ts';
import { MAIL_LIMIT, SyncOutcome, syncMail } from './sync-mail.ts';
import {
  type ChangesByBook,
  changeCount,
  type RecheckedBook,
  syncReport,
  type SyncRun,
  updateChanges,
} from './sync-report.ts';
import { EMBEDDING_MODEL, workersAiDocuments } from './workers-ai.ts';

/** The prod Worker. Not routed: nothing reaches it but its Workflow. */
export const SYNC_WORKER_NAME = 'egw-sync';

/** The prod Workflow, by a name the dashboard shows plainly. */
export const SYNC_WORKFLOW_NAME = 'egw-corpus-sync';

/** Sundays at 09:00 UTC: 05:00 in Toronto under daylight time, 04:00 under
 *  standard time. Cloudflare's cron runs in UTC only, and numbers the days
 *  1 (Sunday) to 7, so the day is named: a `0` there is refused. */
export const SYNC_SCHEDULE = '0 9 * * SUN';

/** Who the run's mail is from and to. The recipient is the cvr.im address
 *  Email Routing forwards to the owner, so no personal address is in the
 *  source. */
const SYNC_MAIL = { from: 'egw-sync@cvr.im', to: 'hello@cvr.im' } as const;

/** The `send_email` binding the run's mail goes through. */
const SyncMailer = Cloudflare.Email.SendEmail('SyncMailer');

/** The longest cause a stopped run's mail carries. */
const MAIL_CAUSE_LIMIT = 4000;

/** Installed books a scheduled run downloads again, at most. A recheck is
 *  about three steps (install, changed vectors, unindex), well inside a
 *  Workflow's 10,000. */
const RECHECK_LIMIT = 250;

/** The most rechecks one run takes when asked for more (`recheck`): the
 *  whole library's worth, about 4,500 steps at three a book, so a run asked
 *  to check everything at once still fits a Workflow. */
const RECHECK_MAX = 1500;

/** Where a published report is read: the search's own page for it. */
const REPORT_PAGE = `https://${DOMAIN}/sync/`;

/** The most changes a report's page quotes. The rest are in its whole
 *  Markdown, which the page links: a page stays small enough to load in well
 *  under a second however many paragraphs a run changed. */
const PAGE_QUOTES = 300;

/** A report's name: its run's time, sortable, so the newest lists last. */
const reportName = (at: string) => at.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

/** What an instance is asked to do. A scheduled instance carries nothing,
 *  which is a sync on `prod` and a plan anywhere else. `reembed` adds the
 *  vectors of books already installed: the way back for a book whose
 *  vectors failed in an earlier run. */
export const CorpusSyncInput = Schema.Struct({
  mode: Schema.optional(Schema.Literals(['plan', 'sync'])),
  reembed: Schema.optional(Schema.Array(Schema.Finite)),
  /** Installed books to download again in this run, in place of
   *  `RECHECK_LIMIT`; at most `RECHECK_MAX`. */
  recheck: Schema.optional(Schema.Finite),
});
export type CorpusSyncInput = typeof CorpusSyncInput.Type;

const NOTHING_ASKED: CorpusSyncInput = {};

/** An instance's payload as it arrives: the input, or its JSON as a string
 *  (the API and `cf workflows instances create` pass `params` that way). */
const CorpusSyncPayload = Schema.Union([CorpusSyncInput, Schema.fromJsonString(CorpusSyncInput)]);
export type CorpusSyncPayload = typeof CorpusSyncPayload.Encoded;

const decodeInput = Schema.decodeUnknownEffect(CorpusSyncPayload);

/** What an instance was asked. A scheduled instance carries no payload, so
 *  it asks nothing. A payload that reads as neither form fails, so a request
 *  to plan is never taken for a sync. */
export const corpusSyncInput = (payload: Option.Option<CorpusSyncPayload>) =>
  Option.match(payload, {
    onNone: () => Effect.succeed(NOTHING_ASKED),
    onSome: decodeInput,
  });

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
  return {
    ...base,
    name: SYNC_WORKER_NAME,
    env: {
      CORPUS_SYNC: 'write',
      SYNC_REPORTS: 'publish',
      SYNC_MAIL_FROM: SYNC_MAIL.from,
      SYNC_MAIL_TO: SYNC_MAIL.to,
    },
  };
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
    const mailer = yield* Cloudflare.Email.Send(SyncMailer);
    const reports = yield* Cloudflare.R2.WriteBucket(yield* SyncReports);
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

        /** Every page of a book's vectors in a scope, a step each. */
        const vectorsOf = Effect.fn('CorpusSync.vectors')(function* (
          bookId: number,
          scope: BookVectorsScope,
        ) {
          let after = 0;
          let upserted = 0;
          let name = 'vectors';
          if (scope === 'changed') name = 'changed vectors';
          while (true) {
            const page = yield* Cloudflare.Workflows.task(
              `${name} ${String(bookId)} ${String(after)}`,
              Effect.gen(function* () {
                const index = yield* vectors.raw;
                return yield* bookVectorsPage({ bookId, after, scope }, embed, index);
              }).pipe(Effect.provide(readLayer)),
              { retries: RETRIES, timeout: '10 minutes' },
            );
            upserted += page.upserted;
            after = page.after;
            if (page.read < BOOK_VECTORS_PAGE) return upserted;
          }
        });

        /** Forget the vectors of the paragraphs a recheck removed. */
        const unindex = (bookId: number) =>
          Cloudflare.Workflows.task(
            `unindex ${String(bookId)}`,
            Effect.gen(function* () {
              const ids = yield* removedVectorIds(bookId);
              return yield* deleteVectorIds(bookId, ids, yield* vectors.raw);
            }).pipe(Effect.provide(readLayer)),
            { retries: RETRIES },
          );

        const planStep = (recheckLimit: number) =>
          Cloudflare.Workflows.task(
            'plan',
            planEgwSync({ lang: 'en', refresh: false, recheckLimit }).pipe(
              Effect.provide(planLayer),
            ),
            { retries: RETRIES },
          );
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

        /** Mail the outcome, where this stage names a sender and a recipient.
         *  A mail that cannot be sent is logged: the run's own result stands. */
        const mailStep = Effect.fn('CorpusSync.mail')(function* (outcome: SyncOutcome) {
          const env = yield* Cloudflare.WorkerEnvironment;
          const from: unknown = env['SYNC_MAIL_FROM'];
          const to: unknown = env['SYNC_MAIL_TO'];
          if (!Predicate.isString(from) || !Predicate.isString(to)) return;
          const message = syncMail(outcome);
          const sent = yield* Effect.exit(
            Cloudflare.Workflows.task(
              'mail',
              mailer.send({ from, to, ...message }).pipe(Effect.as({ subject: message.subject })),
              { retries: RETRIES },
            ),
          );
          if (Exit.isFailure(sent)) {
            yield* Effect.logError('egw_sync_mail_failed', Cause.pretty(sent.cause));
          }
        });

        /** The full report into R2: what the mail links to, and the first
         *  of the library's changes for the mail itself. */
        const publishStep = (run: SyncRun) =>
          Cloudflare.Workflows.task(
            'publish report',
            Effect.gen(function* () {
              const changedIn = (books: readonly RecheckedBook[]) =>
                books.filter(({ changes }) => changeCount(changes) > 0);
              // A verified book's added paragraphs are counted, not quoted
              // (`syncReport`), so only its edits and removals are kept.
              const read = (
                books: readonly RecheckedBook[],
                keep: (row: ParagraphChangeRow) => boolean,
              ) =>
                Effect.forEach(changedIn(books), ({ book }) =>
                  Effect.map(
                    latestParagraphChanges(book.id),
                    (rows) => [book.id, rows.filter(keep)] as const,
                  ),
                );
              const changes: ChangesByBook = new Map([
                ...(yield* read(run.updated, () => true)),
                ...(yield* read(run.verified, (row) => row.kind !== 'added')),
              ]);
              const at = DateTime.formatIso(yield* DateTime.now);
              const name = reportName(at);
              yield* reports.put(reportKey(name), syncReport(run, changes, at), {
                httpMetadata: { contentType: 'text/markdown; charset=utf-8' },
              });
              const pageForm = {
                quoteLimit: Option.some(PAGE_QUOTES),
                markdownHref: `${name}.md`,
              };
              yield* reports.put(
                reportPageKey(name),
                reportPage(name, syncReport(run, changes, at, pageForm)),
                { httpMetadata: { contentType: 'text/html; charset=utf-8' } },
              );
              const all = updateChanges(run, changes);
              return {
                url: `${REPORT_PAGE}${name}`,
                excerpt: all.slice(0, MAIL_LIMIT),
                total: all.length,
              };
            }).pipe(Effect.provide(readLayer)),
            { retries: RETRIES },
          );

        /** The report, where this stage publishes one. A report that cannot
         *  be written is logged: the mail goes without its link. */
        const reportOf = Effect.fn('CorpusSync.reportOf')(function* (run: SyncRun) {
          const env = yield* Cloudflare.WorkerEnvironment;
          const nothing = { excerpt: [], updateChanges: 0, report: Option.none<string>() };
          if (env['SYNC_REPORTS'] !== 'publish') return nothing;
          const published = yield* Effect.exit(publishStep(run));
          if (Exit.isFailure(published)) {
            yield* Effect.logError('egw_sync_report_failed', Cause.pretty(published.cause));
            return nothing;
          }
          const { url, excerpt, total } = published.value;
          return { excerpt, updateChanges: total, report: Option.some(url) };
        });

        /** The run up to its report: what happened, and what the run returns. */
        const runOnce = Effect.fn('CorpusSync.runOnce')(function* (input: CorpusSyncInput) {
          const env = yield* Cloudflare.WorkerEnvironment;
          const writes = env['CORPUS_SYNC'] === 'write' && input.mode !== 'plan';

          const plan = yield* planStep(
            Math.min(RECHECK_MAX, Math.max(0, input.recheck ?? RECHECK_LIMIT)),
          );
          yield* Effect.log(
            'egw_sync_plan',
            `writes=${String(writes)} remote=${String(plan.remote.length)}` +
              ` installed=${String(plan.installedBefore)} pending=${String(plan.pending.length)}` +
              ` changed=${String(plan.changed.length)} verify=${String(plan.verify.length)}` +
              ` recheck_left=${String(plan.recheckLeft)}`,
          );
          if (!writes) {
            return SyncOutcome.Planned({
              remote: plan.remote.length,
              installedBefore: plan.installedBefore,
              pending: plan.pending,
              changed: plan.changed,
              verify: plan.verify.length,
              recheckLeft: plan.recheckLeft,
            });
          }

          const failures: EgwSyncFailure[] = [];
          const added: EgwSyncBook[] = [];
          const vectorFailures: { readonly id: number; readonly reason: string }[] = [];
          const keepVectorFailure = (failed: BookVectorsFailed) =>
            Effect.sync(() => {
              vectorFailures.push({ id: failed.bookId, reason: failed.reason });
              return 0;
            });
          const addVectors = (bookId: number, scope: BookVectorsScope) =>
            vectorsOf(bookId, scope).pipe(Effect.catchTag('BookVectorsFailed', keepVectorFailure));
          for (const book of plan.pending) {
            const outcome = yield* install(book);
            if (outcome._tag === 'Failed') {
              failures.push(outcome.failure);
              continue;
            }
            added.push(book);
            yield* addVectors(book.id, 'book');
          }
          /** Install the books of a recheck, and bring their vectors along. */
          const recheck = Effect.fn('CorpusSync.recheck')(function* (
            books: readonly EgwSyncBook[],
          ) {
            const done: RecheckedBook[] = [];
            for (const book of books) {
              const outcome = yield* install(book);
              if (outcome._tag === 'Failed') {
                failures.push(outcome.failure);
                continue;
              }
              done.push({ book, changes: outcome.changes });
              if (outcome.changes.added + outcome.changes.edited > 0) {
                yield* addVectors(book.id, 'changed');
              }
              if (outcome.changes.removed > 0) {
                yield* unindex(book.id).pipe(
                  Effect.catchTag('BookVectorsFailed', keepVectorFailure),
                );
              }
            }
            return done;
          });
          const updated = yield* recheck(plan.changed);
          const verified = yield* recheck(plan.verify);
          for (const id of input.reembed ?? []) yield* addVectors(id, 'book');

          yield* optimizeStep;
          const report = yield* reportStep(plan, failures);
          yield* Effect.log(
            'egw_sync_done',
            `installed=${String(report.installed)} failed=${String(report.failed)}` +
              ` unexpected=${String(report.unexpectedFailures)}` +
              ` updated=${String(updated.length)} verified=${String(verified.length)}` +
              ` vector_failures=${String(vectorFailures.length)}`,
          );
          const run: SyncRun = {
            counts: report,
            added,
            updated,
            verified,
            recheckLeft: plan.recheckLeft,
            vectorFailures,
          };
          return SyncOutcome.Synced({ run, ...(yield* reportOf(run)) });
        });

        return Effect.fn('CorpusSync.run')(function* (payload: CorpusSyncInput) {
          const exit = yield* Effect.exit(
            Effect.flatMap(corpusSyncInput(Option.fromNullishOr(payload)), runOnce),
          );
          if (Exit.isFailure(exit)) {
            // Mailed, then failed with the same cause, so the dashboard and
            // the engine see the run exactly as it stopped.
            const reason = Cause.pretty(exit.cause).slice(0, MAIL_CAUSE_LIMIT);
            yield* mailStep(SyncOutcome.Stopped({ reason }));
            return yield* Effect.failCause(exit.cause);
          }
          const outcome = exit.value;
          yield* mailStep(outcome);
          if (outcome._tag === 'Planned') {
            return {
              mode: 'plan' as const,
              remote: outcome.remote,
              installedBefore: outcome.installedBefore,
              pending: outcome.pending.map((book) => book.code),
              changed: outcome.changed.map((book) => book.code),
              verify: outcome.verify,
              recheckLeft: outcome.recheckLeft,
            };
          }
          const { counts: report, vectorFailures } = outcome.run;
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
          return {
            mode: 'sync' as const,
            report,
            published: Option.getOrUndefined(outcome.report),
          };
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
        Cloudflare.Email.SendBinding,
        Cloudflare.R2.WriteBucketBinding,
      ),
    ),
  ),
) {}
