/** Resolving an installed `topics.db` into a `WikiService`, driver-agnostically.
 *
 *  The three §3.5 states a host must keep apart — absent, present-and-readable,
 *  present-but-broken — are decided here once rather than per host. Only the
 *  SQLite driver differs between Bun, Electron main and the worker, so only the
 *  driver is a parameter: the file-existence check, the read-only open, and the
 *  mapping from each outcome onto `Absent` / `Live` / `Broken` are shared.
 *
 *  Sharing this matters because the states are easy to conflate in exactly one
 *  direction. Every Node/Bun SQLite driver **creates** a missing file unless
 *  told not to, so a host that opens the artifact without checking first turns
 *  "not installed" into "installed and empty" — the first query then reports a
 *  corrupt artifact, and the file it just created is left on disk. */

import { Cause, Context, Effect, FileSystem, Layer, RcRef, Result } from 'effect';
import type * as SqlClient from 'effect/unstable/sql/SqlClient';

import type { TopicService } from '../topics/service.js';
import type { WikiSectionSources } from './section-composer.js';
import type { UpdatableCorpus } from '../content-update/model.js';
import { ContentActivation } from '../content-update/service.js';
import { WikiService, type WikiServiceApi } from './service.js';

/** Opens the artifact **read-only and without creating it**, in this host's
 *  driver.
 *
 *  Both properties are load-bearing rather than defensive. The artifact is
 *  immutable at rest — only the supply pipeline's atomic swap ever replaces it
 *  — so read-only is the truthful mode; and no-create is what keeps a
 *  driver-level open from manufacturing the very file whose absence the caller
 *  already established. Each driver spells the second differently
 *  (`create: false` on `bun:sqlite`, implied by `readOnly` on `node:sqlite`),
 *  which is exactly why the driver is the parameter and the decision is not. */
export type ArtifactSqlClientLayer = (
  filename: string,
) => Layer.Layer<SqlClient.SqlClient, unknown, never>;

/** Reads an installed artifact through one driver.
 *
 *  A driver failure here is *not* a defect. `layerArtifactOrAbsent` has
 *  established that the file exists, so failing to open it means the file is
 *  there but unreadable — a corrupt or truncated artifact, which §3.5 makes a
 *  reportable state rather than a crash. The failure becomes a `WikiService`
 *  whose every call carries the typed error, so "missing" (absence) and
 *  "present but broken" (`open-failed`) survive all the way to the caller. */
export const layerArtifact = (
  driver: ArtifactSqlClientLayer,
  filename: string,
): Layer.Layer<WikiService, never, TopicService | WikiSectionSources> =>
  WikiService.Live.pipe(
    Layer.provide(driver(filename)),
    Layer.catchCause((cause) =>
      WikiService.Broken({ operation: 'open-artifact', message: Cause.pretty(cause) }),
    ),
  );

/** The layer a host actually wants: the installed artifact when there is one,
 *  and the typed-absence service when there is not. Keeping the choice here
 *  means no caller has to know that "no file" is a legal, non-failing state —
 *  and no caller can skip the check and have its driver create the file.
 *
 *  A failing `exists` is not a defect either. The check is filesystem
 *  reachability, and an unreachable path is exactly the "present but not usable"
 *  state §3.5 makes reportable — so it becomes a `WikiService` whose calls fail
 *  with the typed error, the same shape a corrupt artifact produces. Dying here
 *  would take the whole host down over a stat the wiki alone needed. */
export const layerArtifactOrAbsent = (
  driver: ArtifactSqlClientLayer,
  filename: string,
): Layer.Layer<WikiService, never, FileSystem.FileSystem | TopicService | WikiSectionSources> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const found = yield* fs.exists(filename).pipe(
        Effect.map(Result.succeed),
        Effect.catchCause((cause) => Effect.succeed(Result.fail(Cause.pretty(cause)))),
      );
      if (Result.isFailure(found)) {
        return WikiService.Broken({ operation: 'stat-artifact', message: found.failure });
      }
      if (!found.success) return WikiService.Absent;
      return layerArtifact(driver, filename);
    }),
  );

/** The `file:…?immutable=1` URI this artifact opens under, the same way
 *  `bible.db` does — one shared builder, so the encoding cannot be right for
 *  one artifact and wrong for the other. Re-exported here because every
 *  driver's layer factory reaches for it beside `ArtifactSqlClientLayer`. */
export { immutableFileUri as immutableFilename } from '../db/immutable-uri.js';

/** How a host re-opens its topics artifact after §3.6 installs a new one.
 *
 *  The update swaps `topics.db` with an atomic `rename` over the path. A
 *  connection opened `immutable=1` holds the old *inode*: it keeps serving the
 *  file it opened, and no per-call read can see past that — so a desktop that
 *  accepted an offer went on serving the previous content until the app was
 *  restarted (round-3 F3). Seeing the replacement requires reopening the
 *  handle, and reopening the handle requires a seam that owns the handle's
 *  lifetime.
 *
 *  One service rather than a flag on `WikiService`, because what gets reloaded
 *  is the whole artifact-backed decision — the absence check included. A host
 *  that had *no* artifact and then installed the first one must go from
 *  `Absent` to `Live`, which reopening a connection alone could not do. */
export interface ReloadableArtifactService {
  /** Rebuilds the artifact-backed `WikiService` against whatever is at the path
   *  now. Idempotent, and safe to call when nothing changed — a host that is
   *  unsure has no reason to check first.
   *
   *  It cannot fail. A rebuild that cannot open the new file leaves the
   *  previous generation serving, which is the same stale-fallback posture the
   *  installer itself takes: a host whose content was working keeps working. */
  readonly reload: Effect.Effect<void>;
}

export class ReloadableArtifact extends Context.Service<
  ReloadableArtifact,
  ReloadableArtifactService
>()('@bible/core/wiki/ReloadableArtifact') {
  /** The host that does not reload — the CLI, whose next read is a new process
   *  anyway, and every suite not testing the update seam. `reload` succeeds and
   *  does nothing, which is the truth rather than an omission. */
  static Inert: Layer.Layer<ReloadableArtifact> = Layer.succeed(
    ReloadableArtifact,
    ReloadableArtifact.of({
      reload: Effect.void,
    }),
  );
}

/** Whether a freshly built generation is one worth serving.
 *
 *  `layerArtifactOrAbsent` never *fails*: an unreadable artifact becomes a
 *  `WikiService.Broken` whose every call carries the typed error. So "the
 *  reload failed" is not an `Exit` to inspect — it is a service that answers
 *  every question with `open-failed`, and `availability` is the cheapest
 *  question to ask. `Absent` and `Live` both answer it successfully, which is
 *  right: a host whose artifact was deleted should go back to catalog pages
 *  rather than keep serving a file that is gone.
 *
 *  Probing before the swap is what makes the swap conditional. Without it a
 *  corrupt download would replace a working generation with `Broken`, the
 *  reload would "succeed", and every read after it would fail (round-4 F3). */
const opens = (service: WikiServiceApi): Effect.Effect<boolean> =>
  Effect.match(service.availability, { onFailure: () => false, onSuccess: () => true });

/** The wiki over an artifact this host can re-open, plus the handle that
 *  re-opens it.
 *
 *  Both services come from one effect because they share one piece of state —
 *  the currently built generation. Two layers would be two states, and the
 *  `reload` in one of them would rebuild a graph the other was not reading.
 *
 *  The chooser's whole decision re-runs on **every** build, not only the first,
 *  so absent→live and live→broken are both reachable by reload. That is what
 *  each host was missing in its own dialect: Electron main held an
 *  `immutable=1` inode that a rename could not reach, and the web worker read
 *  `topicsDatabase` once at construction and stayed `Absent` for the life of
 *  the worker after a first install. One seam, two choosers.
 *
 *  The dependencies are provided from the *outer* context rather than rebuilt:
 *  `TopicService` and `WikiSectionSources` read other corpora, and a topics
 *  update has no business closing `bible.db`. */
export const layerReloadableWiki = <R>(
  /** The whole three-state decision, re-run on every reload. A *thunk* rather
   *  than a layer value because the decision must be re-made against the world
   *  as it is now: a layer built once would freeze whichever branch was true at
   *  startup, which is precisely the absent→live case the web worker was stuck
   *  in. */
  choose: () => Layer.Layer<WikiService, never, R>,
): Layer.Layer<WikiService | ReloadableArtifact, never, R> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const outer = yield* Effect.context<R>();

      /** One build of the artifact-backed service into whichever scope the
       *  caller supplies, so the connection's lifetime is the scope's. */
      const build = Effect.suspend(() =>
        Layer.build(choose()).pipe(
          Effect.provideContext(outer),
          Effect.map((built) => Context.get(built, WikiService)),
        ),
      );

      /** The shared generation, reference-counted.
       *
       *  `RcRef` is what the hand-rolled `Scope`-in-a-`Ref` was reaching for,
       *  and got wrong in three ways (round-4 F3/B1). The outer finalizer owned
       *  only the *first* scope, so the last generation leaked at shutdown and
       *  the first could be closed twice. Readers took no lease, so a reload
       *  could close a connection out from under a query already reading it.
       *  And the swap was unconditional, so a corrupt artifact replaced a
       *  working service with `Broken`.
       *
       *  The first two are properties `RcRef` already has: `get` increments the
       *  count and releases through the *borrower's* scope, `invalidate` defers
       *  the close until the last borrow lets go, and the ref's own scope
       *  finalizer closes whatever generation is live at shutdown — once,
       *  whichever generation that is, first or fifth. The third is `opens`,
       *  below.
       *
       *  `idleTimeToLive` is what keeps this a *shared* connection rather than
       *  a per-call open. Without it the count reaches zero between calls and
       *  the generation is torn down and rebuilt for every `list` — correct,
       *  and needlessly so. With it the connection survives the gaps and is
       *  retired only when it goes unused for a while, or when `invalidate`
       *  marks it superseded and the last borrow lets go.
       *
       *  The interval is short deliberately: it is a coalescing window for
       *  bursts of reads, not a cache. An artifact that §3.6 replaced is not
       *  something to keep an old inode open for. */
      const generations = yield* RcRef.make({ acquire: build, idleTimeToLive: '30 seconds' });

      /** One borrow, for the duration of one call. The lease is the point: a
       *  reload that lands mid-query cannot close the connection the query is
       *  reading from, because the count does not reach zero until this scope
       *  does. */
      const on = <A, E>(use: (service: WikiServiceApi) => Effect.Effect<A, E>) =>
        Effect.scoped(Effect.flatMap(RcRef.get(generations), use));

      const reload = Effect.gen(function* () {
        // The candidate is opened and *asked a question* before anything is
        // retired. Only a generation that answers gets to replace one that is
        // already serving — the same stale-fallback posture the installer takes
        // when it refuses a candidate.
        const usable = yield* Effect.scoped(Effect.flatMap(build, opens));
        if (!usable) return;
        // `invalidate` rather than a swap: the generation serving now is closed
        // when its last in-flight call lets go, and the next call builds the
        // new one. Nothing is closed underneath a reader, and nothing is opened
        // that no reader will use.
        yield* RcRef.invalidate(generations);
      }).pipe(
        // The chooser's declared failures are the driver's, which
        // `layerArtifactOrAbsent` already turns into a `Broken` service rather
        // than a failure — so what is left here is a defect in building a
        // scope. A host whose content was working keeps working.
        Effect.ignoreCause,
      );

      return Context.empty().pipe(
        Context.add(
          WikiService,
          WikiService.of({
            list: (input) => on((service) => service.list(input)),
            topic: (slug) => on((service) => service.topic(slug)),
            dictionary: on((service) => service.dictionary),
            availability: on((service) => service.availability),
          }),
        ),
        Context.add(ReloadableArtifact, ReloadableArtifact.of({ reload })),
      );
    }),
  );

/** The host wiring §3.6's activation onto this seam.
 *
 *  `ContentUpdate` says *when* a reader must reopen; `ReloadableArtifact` knows
 *  *how*. Neither should import the other — the update policy has no business
 *  knowing the wiki exists, and the wiki has no business knowing about
 *  manifests — so the join lives here, in one layer both hosts provide, rather
 *  than as two copies of the same `Layer.effect` in Electron main and the
 *  worker.
 *
 *  Only `topics` reloads because only `topics` has a runtime artifact behind
 *  this service; a future corpus adds its own arm rather than being reloaded by
 *  accident. */
export const layerReloadOnActivation: Layer.Layer<ContentActivation, never, ReloadableArtifact> =
  Layer.effect(
    ContentActivation,
    Effect.map(ReloadableArtifact, (artifact) => ({
      onActivated: (corpus: UpdatableCorpus) => {
        if (corpus === 'topics') return artifact.reload;
        return Effect.void;
      },
    })),
  );

/** The file-backed host's reloadable wiki: Electron main, whose artifact is a
 *  path on disk that §3.6 renames over. The `immutable=1` connection holds the
 *  old inode, so seeing the swap means rebuilding — including the existence
 *  check, so a first install goes from `Absent` to `Live` too. */
export const layerReloadableArtifact = (
  driver: ArtifactSqlClientLayer,
  filename: string,
): Layer.Layer<
  WikiService | ReloadableArtifact,
  never,
  FileSystem.FileSystem | TopicService | WikiSectionSources
> => layerReloadableWiki(() => layerArtifactOrAbsent(driver, filename));
