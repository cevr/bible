/**
 * The weekly corpus sync, run in-process beside the search server.
 *
 * The corpus is a mirror of a library that keeps publishing. Without this, the
 * deployed searcher answers from whatever snapshot was last pushed by hand and
 * silently drifts: new books never appear, and a book whose code changes
 * upstream (`ChS` is served as `1ChS`) stops matching the classification
 * backfill until somebody notices. A scheduled sync makes the deployment
 * self-maintaining.
 *
 * ## Why in-process rather than a Railway cron service
 *
 * Railway volumes are single-attach — measured, not assumed: `railway config
 * plan` accepts one volume on two services and `apply` reports success, but the
 * second service ends up with no volume and a re-plan shows the same pending
 * change forever. A second service therefore cannot reach `/data`, and the
 * corpus lives on `/data`. Railway's own cron also expects the process to exit,
 * which a web server does not do.
 *
 * ## Why the server's own SqlClient
 *
 * `EGWDbBun.Default` resolves its file from `EGW_PARAGRAPH_DB` while this app
 * resolves `BIBLE_CORPUS_DIR`, so composing the CLI's `FullLayer` here would
 * either open a *second* connection to the same 4.2 GB file or write to an
 * entirely different database. Two connections over one WAL file is the defect
 * behind the desktop reader's schema-rebuild bug, and `book-database.ts` drops
 * and rebuilds `paragraphs` when it believes the schema is stale — which would
 * take the corpus out from under live search. One process, one connection.
 *
 * Concurrent reads are safe: the client opens WAL with a five-second busy
 * timeout, so searches keep answering while the sync writes.
 *
 * ## Overlap
 *
 * None possible. `Schedule.cron` computes its delay as `next - now` where `now`
 * is the time the *previous* effect finished, and `Effect.repeat` is
 * sequential, so a sync that overruns its window pushes the next run to the
 * following boundary rather than stacking a second writer.
 */

import { EGWApiClient, EGWAuth } from '@bible/core/egw';
import { EGWParagraphDatabase } from '@bible/core/egw-db';
import {
  CorpusSupply,
  layerEgwWritingsAssetSource,
  syncEgwCorpus,
} from '@bible/core/corpus-supply';
import { BunServices } from '@effect/platform-bun';
import { Config, Cron, DateTime, Duration, Effect, Layer, Option, Schedule } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import type { SqlClient } from 'effect/unstable/sql';

/** Sundays at 05:00 Toronto time — the low-traffic window, and far enough from
 *  midnight that a run crossing a DST boundary still lands on a real hour. */
const SCHEDULE = '0 5 * * 0';
const TIMEZONE = 'America/Toronto';

/** Two concurrent downloads, matching the CLI's default. The bound is the
 *  library's tolerance, not ours; a weekly job has no reason to hurry. */
const CONCURRENCY = 2;

const AuthLayer = EGWAuth.layerLiveFs().pipe(Layer.provide(FetchHttpClient.layer));

const ApiClientLayer = EGWApiClient.Live.pipe(
  Layer.provide(AuthLayer),
  Layer.provide(FetchHttpClient.layer),
);

/** The supply chain, built over *this* app's database connection.
 *
 *  `EGWParagraphDatabase.layerCore` takes the `SqlClient` from context rather
 *  than opening its own, which is the whole point — see the module note. */
const SupplyLayer = CorpusSupply.layer.pipe(
  Layer.provide(layerEgwWritingsAssetSource.pipe(Layer.provide(ApiClientLayer))),
  Layer.provide(EGWParagraphDatabase.layerCore),
);

const runSync = Effect.gen(function* () {
  yield* Effect.log('egw_sync_start', `schedule=${SCHEDULE} tz=${TIMEZONE}`);

  const report = yield* syncEgwCorpus({
    lang: 'en',
    concurrency: CONCURRENCY,
    refresh: false,
    // Per-book progress is noise in a server log; the report below is the
    // event worth keeping. Failures are still reported individually.
    onProgress: () => Effect.void,
  });

  yield* Effect.log(
    'egw_sync_done',
    `remote=${String(report.remote)} installed=${String(report.installed)}` +
      ` failed=${String(report.failed)} unexpected=${String(report.unexpectedFailures)}` +
      ` present=${String(report.present)} missing=${String(report.missing.length)}`,
  );

  // `failed` is never zero — eighteen books are withheld by the library on
  // purpose (`KNOWN_UNAVAILABLE`). Only the unexpected ones are worth a log
  // level that a reader should act on.
  for (const failure of report.failures) {
    if (failure.expected) continue;
    yield* Effect.logError(
      'egw_sync_book_failed',
      `code=${failure.code} id=${String(failure.id)} error=${failure.error}`,
    );
  }
});

/** A failed week must not kill the schedule.
 *
 *  The library going down, a token refresh failing, a truncated archive — all
 *  are transient by nature, and the correct response is to log and wait for the
 *  next Sunday. An unhandled failure here would instead terminate the fiber and
 *  silently end the sync forever, with the server still serving and nothing to
 *  indicate the mirror had stopped updating. */
const guarded = runSync.pipe(
  Effect.catchCause((cause) => Effect.logError('egw_sync_failed', `cause=${String(cause)}`)),
);

/** The parsed schedule, for computing the first fire time ourselves.
 *
 *  Parsed once at module load; the expression is a literal, so a parse failure
 *  is a programming error rather than a runtime condition. */
const parsedCron = Cron.parseUnsafe(SCHEDULE, TIMEZONE);

/** When the schedule next fires, read through the Clock so a test can move it. */
const nextFireTime = Effect.map(DateTime.nowAsDate, (now) => Cron.next(parsedCron, now));

/** Sleep until the next boundary.
 *
 *  This is what stops a deploy from triggering a sync — see the call site. */
const sleepUntilNextFire = Effect.gen(function* () {
  const now = yield* DateTime.nowAsDate;
  const next = Cron.next(parsedCron, now);
  yield* Effect.sleep(Duration.millis(next.getTime() - now.getTime()));
});

/**
 * Forks the weekly sync as a daemon fiber.
 *
 * Dormant without credentials rather than failing: a deployment with no
 * `EGW_CLIENT_ID` still serves search perfectly, and refusing to boot over a
 * missing *background* job would take the site down for a reason unrelated to
 * answering queries. The log line is what tells an operator why nothing syncs.
 */
const ScheduledLive: Layer.Layer<never, never, SqlClient.SqlClient> = Layer.effectDiscard(
  Effect.gen(function* () {
    const firstRun = yield* nextFireTime;
    yield* Effect.log(
      'egw_sync_scheduled',
      `schedule="${SCHEDULE}" tz=${TIMEZONE} next=${firstRun.toISOString()}`,
    );

    // `sleepUntilNextFire` runs once, outside the repeat: `Effect.repeat`
    // executes its effect immediately and only *then* consults the schedule,
    // so without this every deploy would start a full sync. Deploys are
    // frequent; Sundays are not.
    yield* sleepUntilNextFire.pipe(
      Effect.andThen(guarded.pipe(Effect.repeat(Schedule.cron(SCHEDULE, TIMEZONE)))),
      Effect.interruptible,
      // Detached rather than a child fiber: the sync outlives the layer's own
      // construction scope, and must not be torn down when that scope closes.
      Effect.forkDetach,
    );
  }),
).pipe(
  // The supply chain is provided to the layer, not inside the effect: one
  // boundary, built once when the server starts.
  Layer.provide(
    Layer.mergeAll(SupplyLayer, ApiClientLayer, EGWParagraphDatabase.layerCore).pipe(
      Layer.provideMerge(BunServices.layer),
    ),
  ),
  // Building that chain reads the token file and contacts the token endpoint,
  // so it can fail even with both secrets present. A background job that cannot
  // start is a log line, not a reason to stop the server from serving search.
  Layer.catchCause((cause) =>
    Layer.effectDiscard(Effect.logError('egw_sync_unavailable', `cause=${String(cause)}`)),
  ),
);

/**
 * Forks the weekly sync as a daemon fiber, when there are credentials to run it
 * with.
 *
 * The credential check is a `Layer.unwrap` rather than a branch *inside* the
 * layer because `EGWAuth` resolves the client id and secret while it is being
 * *constructed*: a check inside would run after the failure it is meant to
 * explain, and an operator would see a generic construction cause instead of
 * the one fact they need. Gating here means the supply chain is never built at
 * all without credentials.
 *
 * Dormant rather than fatal: a deployment with no `EGW_CLIENT_ID` still serves
 * search perfectly, and refusing to boot over a missing *background* job would
 * take the site down for a reason unrelated to answering queries.
 */
export const EgwSyncLive: Layer.Layer<never, never, SqlClient.SqlClient> = Layer.unwrap(
  Effect.gen(function* () {
    const clientId = yield* Config.string('EGW_CLIENT_ID').pipe(Config.option);

    if (Option.isNone(clientId)) {
      return Layer.effectDiscard(
        Effect.logWarning(
          'egw_sync_disabled',
          'reason=no_credentials detail=set EGW_CLIENT_ID and EGW_CLIENT_SECRET to enable the weekly sync',
        ),
      );
    }

    return ScheduledLive;
  }).pipe(
    // A malformed config is the same operational story as a missing one: the
    // sync cannot start, and search is unaffected.
    Effect.catchCause((cause) =>
      Effect.succeed(
        Layer.effectDiscard(Effect.logError('egw_sync_unavailable', `cause=${String(cause)}`)),
      ),
    ),
  ),
);
