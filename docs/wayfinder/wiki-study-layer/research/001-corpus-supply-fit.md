# Research 001 — Corpus-supply fit for a topics artifact

Ticket: `docs/wayfinder/wiki-study-layer/tickets/001-corpus-supply-fit.md`.
Question: what does a `topics.db`-style artifact need from the existing
corpus-supply pipeline, and what is the release/update flow end to end.

## How the pipeline works today (baseline)

The pipeline has two corpus shapes, and they are structurally different:

1. **Bible = one verified file artifact.** A recipe holds an ordered list of
   byte-stream sources (`packaged` → `workspace` → `runtime` → `release`). The
   release source is pinned in code: `BIBLE_ARTIFACT_RELEASE` declares URL,
   revision `db-v2`, exact size, and SHA-256
   (`packages/core/src/corpus-supply/bible-artifact.ts:9-14`). An installer
   streams bytes, hashes them, rejects a digest mismatch, runs semantic
   verification (row counts), writes provenance into the file's `meta` table,
   and swaps atomically.
2. **Writings = per-publication archives.** Sources decode EGW API responses
   into `PublicationArchive` values; provenance is the SHA-256 of the encoded
   archive (`packages/core/src/corpus-supply/model.ts:78-96`,
   `packages/core/src/corpus-supply/writings-egw-source.ts`). Installation is a
   SQL transaction into `EGWParagraphDatabase`
   (`packages/core/src/corpus-supply/service.ts:44-96`).

A topics artifact matches shape 1, not shape 2. It is a compiled, versioned,
digest-verified single SQLite file, exactly like `bible.db`.

`CorpusSupply.ensure(input?)` is the single application-facing operation
(`packages/core/src/corpus-supply/service.ts:19-160`). It dispatches on a
target union (`bootstrap` | `bible` | `writings`) and reports a
`CorpusSupplyReceipt` of activations. Consumers today:

- Desktop main process: builds the four-source recipe and awaits `ensure()`
  before the first window (`apps/desktop/electron/main.ts:160-201`).
- Web db worker: one `release` source behind the `/api/assets/bible` proxy,
  `ensure()` during worker init (`apps/web/src/workers/db-worker.ts:165-181`,
  `apps/web/src/workers/bible-database.ts:127-226`,
  `apps/web/server/main.ts:128-143`).
- CLI `init`: same node layer, `ensure({ refresh: args.force })`
  (`packages/cli/src/commands/init.ts:12-68`).

The stated contract and release procedure live in
`docs/architecture/corpus-supply.md`.

## (a) Minimal new modules and config for a topics artifact

Build-side (not runtime):

1. **A compiler script** that turns the in-repo markdown topic pages into
   `topics.db` (tables + FTS + a `meta` table). This is the analog of
   `sync:bible` (`packages/core/package.json:48-49`,
   `packages/core/src/sync/bible-sync-main.ts`). It runs at authoring time;
   corpus-supply never sees markdown, only the compiled artifact.

Core (`packages/core/src/corpus-supply/`):

2. **A topics artifact manifest + recipe + installer pair.** Copy the shape of
   `bible-artifact.ts` (74 lines): `TOPICS_ARTIFACT_RELEASE`
   (url/revision/digest/size), `TopicsArtifactRecipe`,
   `TopicsArtifactInstaller` as `Context.Service` tags. Alternative: generalize
   `bible-artifact.ts` into one file-artifact module parameterized by corpus id
   — see (d).
3. **Model widening in three closed unions**: add a `TopicsTarget` to
   `CorpusTarget` (`packages/core/src/corpus-supply/model.ts:31-47`); widen
   `CorpusActivation.corpus` from `Schema.Literals(['bible','writings'])`
   (`model.ts:54-60`); widen the `corpus` literal in `CorpusInstallationError`
   (`packages/core/src/corpus-supply/errors.ts:21-28`). The receipt identity
   union (`'canonical' | PublicationId`, `model.ts:62-65`) also needs a topics
   identity.
4. **An `ensureTopics` branch in `service.ts`** — today a near-copy of
   `ensureBible` (`service.ts:98-143`): iterate sources, compare installed
   provenance to acquired provenance, install on mismatch or `refresh`. Plus a
   bootstrap-policy decision: `ensure()` with no target currently means
   Bible-only (`service.ts:145-155`).
5. **A topics semantic verifier**: the analog of `verifyBibleDatabase` row-count
   checks (`packages/core/src/platform-node/bible-artifact.ts:143-181`, mirrored
   for the browser in `apps/web/src/workers/bible-database.ts:36-66`). For
   example: page count > 0, phrase-dictionary count > 0, FTS index populated.

Adapters:

6. **Native**: `layerNativeBibleArtifacts` already injects `destination`,
   `sources`, `verify`, and `provenanceStore`
   (`packages/core/src/platform-node/bible-artifact.ts:239-321`), so it is
   ~90% reusable. The bible-specific residue is the default verifier, the
   `'bible-release'` source id (`platform-node/bible-artifact.ts:97`), and the
   `corpus: 'bible'` error tag (`:280,:315`). A topics variant needs a
   destination such as `userData/topics.db` and its own source list.
7. **Browser**: a second generation store instance. The store logic is generic
   (`apps/web/src/workers/bible-generation-store.ts`), but its filename pattern
   (`bible-<rev>-<digest12>.db`, `:7`), generation name builder
   (`apps/web/src/workers/bible-database.ts:88-95`), and IndexedDB registry key
   (`'active-bible-generation'`, `apps/web/src/workers/db-worker.ts:168-171`)
   are bible-branded and need topics equivalents. `DatabaseFileDownloader`
   (OPFS stream and IndexedDB atomic page import) is fully corpus-agnostic
   (`apps/web/src/workers/database-file-downloader.ts`).
8. **Web server proxy route**: `/api/assets/topics` mirroring
   `/api/assets/bible` (`apps/web/server/main.ts:128-143`), which exists to
   keep GitHub CORS behavior out of the worker.
9. **Host wiring**: desktop adds the topics layer next to the bible layer in
   `app.whenReady` (`apps/desktop/electron/main.ts:160-189`) and passes a
   topics database path into runtime construction (`main.ts:215`); the web
   worker adds the layer and a second `ensure` call in `initializeDatabases`
   (`db-worker.ts:157-216`); CLI `init` adds the same
   (`packages/cli/src/commands/init.ts:62-68`). CLI provisioning comes almost
   free once the node layer is parameterized.

No new transport, hashing, verification, or swap machinery is required. All of
it exists and is proven for `bible.db`.

## (b) Release/update flow and atomic activation

End-to-end release flow, mirroring `docs/architecture/corpus-supply.md:32-38`:

1. Author or edit topic markdown in-repo; review the git diff.
2. Run the topics compiler to build `topics.db`; run the gate plus the semantic
   verifier against the built file.
3. Compute size and SHA-256; publish a new GitHub release tag and asset
   (`topics-v1`, `topics-v2`, …). Never replace bytes under an existing tag —
   the digest pin makes that a hard failure at every client.
4. Update the single manifest constant (`TOPICS_ARTIFACT_RELEASE`).
5. Deploy: on next startup, each host's `ensure()` sees that installed
   provenance (source + revision + digest) no longer matches the manifest
   (`service.ts:114-125`) and reinstalls.

Atomic swap mechanics, already implemented for Bible and directly reusable:

- **Native**: stream to `<destination>.building`, hash while writing, reject a
  manifest-digest mismatch, semantically verify the building file, write
  provenance into its `meta` table, then `fs.rename` over the destination;
  on any error the building file is removed and the active file is untouched
  (`packages/core/src/platform-node/bible-artifact.ts:282-317`).
- **Browser**: register a candidate generation in a durable registry before any
  bytes land, stream and hash, verify digest and semantics, write provenance,
  switch the active database handle, then durably commit the marker with
  rollback to the previous generation on failure; startup reconciliation
  retires orphaned candidates (`apps/web/src/workers/bible-generation-store.ts:45-140`,
  `apps/web/src/workers/bible-database.ts:172-222`).

**One honest caveat on "independently of app releases": the current design pins
the manifest in compiled code.** A content update therefore requires a code
change (one constant) and a deploy of the hosts. For the web app this is cheap
(redeploy; the worker re-ensures on next load). For desktop it means an app
update carries the new pin. Truly app-release-independent content updates would
need a small remote manifest (a JSON the client fetches at runtime, which then
pins digest+size for the artifact download) — a deliberate deviation from the
pin-in-code invariant (`docs/architecture/corpus-supply.md:12`,
`corpus-supply/CONTEXT.md:41`), and the correct home for the map's open
"release cadence / in-app update prompt" question. Note also that both hosts
call `ensure()` only at startup (`apps/desktop/electron/main.ts:184`,
`apps/web/src/workers/db-worker.ts:179-181`); mid-session update prompts would
be new work regardless of where the manifest lives.

## (c) Degradation with a partial or missing topics artifact

Two existing precedents, and they differ:

- **Bible is fail-closed at startup.** Desktop awaits `ensure()` with no error
  handling before creating a window (`apps/desktop/electron/main.ts:184-189`);
  the web worker's `ensure()` failure fails the whole
  `initializeDatabases` effect (`apps/web/src/workers/db-worker.ts:179-181`).
  No Bible, no app.
- **Writings degrade gracefully.** The web worker catches writings
  initialization failure and only warns
  (`apps/web/src/workers/db-worker.ts:182-188`); the library surface renders
  per-publication `pending`/`failed` states from whatever is local
  (`packages/core/src/corpus-supply/writings-library.ts:100-147`).

A topics artifact should take the writings posture: wrap its `ensure` in a
catch, log, and let the app start. Missing recipe layers already degrade to a
typed `CorpusRecipeUnavailableError` rather than a defect
(`packages/core/src/corpus-supply/service.ts:48-50,:99-101` via
`Effect.serviceOption`), so a host that simply does not wire the topics layer
keeps working.

"Partial" cannot happen silently. The digest covers exact bytes, semantic
verification runs before activation, and both installers preserve the current
active generation on any failure (`platform-node/bible-artifact.ts:311-313`;
`bible-generation-store.ts:112-128`). So the only observable states are:
current artifact active, stale-but-verified previous artifact active, or no
artifact. The wiki layer therefore needs exactly one UI-level degradation
seam: "topics unavailable / out of date", falling back to the catalog-only
landing pages the map already guarantees (the `topics` table ships inside
`bible.db` and is a verified requirement —
`platform-node/bible-artifact.ts:175-177`,
`apps/web/src/workers/bible-database.ts:62-64`).

## (d) Friction a third corpus exposes (for the architecture audit)

1. **Corpus identity is a closed enum in four places, not a registry.** Adding
   a corpus edits `CorpusTarget` (`model.ts:46`), `CorpusActivation.corpus`
   (`model.ts:56`), `CorpusInstallationError.corpus` (`errors.ts:25`), and the
   `ensure` dispatch (`service.ts:145-155`). Every future corpus (the map
   already anticipates an embeddings artifact) pays this again.
2. **The file-artifact machinery is bible-branded but generic.** `bible.db` and
   `topics.db` share the whole lifecycle: pinned manifest, ordered byte
   sources, hash-while-stream, semantic verify, provenance in `meta`, atomic
   swap, generation retirement. Today that lifecycle is spread across
   `packages/core/src/corpus-supply/bible-artifact.ts`,
   `packages/core/src/platform-node/bible-artifact.ts`,
   `apps/web/src/workers/bible-database.ts`, and
   `apps/web/src/workers/bible-generation-store.ts`, all with `Bible` in the
   type names, source ids, registry keys, and filename regexes. Without a
   refactor, a third corpus means copying roughly 600 lines and renaming. The
   audit-worthy move: one `FileCorpusArtifact` abstraction parameterized by
   corpus id, manifest, semantic verifier, destination/generation prefix — with
   `ensureBible`/`ensureTopics` collapsing into one loop over registered file
   corpora.
3. **Pin-in-code couples content cadence to app releases** (see the caveat in
   (b)). Acceptable for Bible (rare revisions); friction for topics, whose
   whole point is frequent, git-reviewed content updates.
4. **Bootstrap semantics are Bible-only.** `ensure()`/`bootstrap` ensures only
   Bible (`service.ts:148-150`), and `CorpusSupply.ensure()` ≡ Bible bootstrap
   is a stated invariant (`corpus-supply/CONTEXT.md:37`). Adding topics forces
   a decision: is topics required-for-first-use (bootstrap member) or
   best-effort (separate target)? Recommendation from (c): best-effort.
5. **Host wiring is per-corpus and manual**: one proxy route per artifact in
   `apps/web/server/main.ts`, one layer block per corpus in each of three
   composition roots, and desktop's `makeRuntime(writingsDb, bibleDb, userState)`
   signature grows positionally (`apps/desktop/electron/main.ts:215`).
6. **A tempting shortcut exists and should be rejected**: ship topic pages
   inside `bible.db` (it already has a verified `topics` table). That avoids
   all new modules but forces a ~156 MB re-download for every content edit
   (`bible-artifact.ts:13`) and re-couples cadence; the charter already chose a
   separate artifact.

## Bottom line

A topics artifact is a clean fit: it is a second instance of the exact
lifecycle `bible.db` already exercises, and every hard mechanism (digest pin,
streaming install, semantic verification, atomic activation, generation
rollback, stale-fallback) exists and is tested. The genuinely new work is one
compiler script, one manifest+verifier, enum widening in four core files, one
`ensure` branch, and per-host wiring — plus two decisions the map should
record: (1) de-bible-ify the file-artifact machinery before adding the third
copy, and (2) whether topics keeps the pin-in-code manifest (content updates
ride app deploys) or moves to a runtime-fetched manifest for true independent
cadence.

## Receipts

- `packages/core/src/corpus-supply/CONTEXT.md`
- `packages/core/src/corpus-supply/model.ts`
- `packages/core/src/corpus-supply/service.ts`
- `packages/core/src/corpus-supply/errors.ts`
- `packages/core/src/corpus-supply/source.ts`
- `packages/core/src/corpus-supply/bible-artifact.ts`
- `packages/core/src/corpus-supply/writings-egw-source.ts`
- `packages/core/src/corpus-supply/writings-library.ts`
- `packages/core/src/corpus-supply/index.ts`
- `packages/core/src/platform-node/bible-artifact.ts`
- `packages/core/package.json` (exports map lines 25-26; `sync:bible` lines 48-49)
- `apps/web/src/workers/db-worker.ts`
- `apps/web/src/workers/bible-database.ts`
- `apps/web/src/workers/bible-generation-store.ts`
- `apps/web/src/workers/database-file-downloader.ts`
- `apps/web/server/main.ts`
- `apps/desktop/electron/main.ts`
- `apps/desktop/electron/bible-corpus-file.ts`
- `packages/cli/src/commands/init.ts`
- `docs/architecture/corpus-supply.md`
