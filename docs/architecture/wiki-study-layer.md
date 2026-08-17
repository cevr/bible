# Wiki study layer

Buildable specification for the wiki study layer of the EGW Reader app and CLI.
It covers the wiki domain model and `topics` artifact, the content pipeline, the
phrase dictionary and its rendering rules, navigation UX, auto-mined section
composition, select-to-lookup, the study-pane seam, and the hybrid EGW search
engine — sequenced into independently shippable milestones.

Every decision here is already locked by a closed ticket in the
[wiki-study-layer wayfinder map](../wayfinder/wiki-study-layer/map.md). This
document synthesizes those resolutions; it does not re-decide them. See
[Provenance](#provenance) for the ticket behind each section.

Every milestone inherits the
[three-client compatibility contract](../wayfinder/wiki-study-layer/client-compatibility.md)
and the parity rules in [feature-parity.md](feature-parity.md).

---

## 1. Vocabulary

| Term                     | Meaning                                                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Topic page**           | One page in the wiki, identified by a slug. Either flagship or catalog.                                                             |
| **Flagship topic**       | A topic with an authored core compiled into the `topics` artifact. 40 in v1.                                                        |
| **Catalog topic**        | A long-tail topic with no authored core, assembled live from the `topics`/`topic_sections`/`topic_references` tables in `bible.db`. |
| **Catalog landing page** | The page a catalog topic renders: no thesis, auto-mined sections only.                                                              |
| **Authored core**        | The thesis paragraph(s) plus optional `##` sections written in `content/topics/<slug>.md` and compiled to portable AST.             |
| **Phrase dictionary**    | The compiled alias → slug table used by the render-time matcher.                                                                    |
| **Alias**                | One surface form of a topic ("two thousand and three hundred days").                                                                |
| **Phrase span**          | A `PhraseSpan` value: an offset range in one text run plus the slug it resolves to.                                                 |
| **Hot phrase**           | A phrase span the renderer actually links. Governed by the first-occurrence rule.                                                   |
| **Section composer**     | The single core function that builds the auto-mined section lineup for any topic page.                                              |
| **Peek card**            | The hover/tap surface showing a topic's title and thesis with a click-through.                                                      |
| **Trail**                | The breadcrumb history stack of wiki hops.                                                                                          |
| **Artifact pin**         | The compiled-in `TOPICS_ARTIFACT_RELEASE` constant (URL, revision, size, SHA-256).                                                  |
| **Runtime manifest**     | The GitHub-hosted JSON the client fetches to discover content-only updates newer than the pin.                                      |
| **Overlay keying**       | The compile-time mapping from a wiki slug to a catalog topic id.                                                                    |
| **Model fingerprint**    | The embedding model identity stored with the vector artifact; a mismatch invalidates the vector leg.                                |
| **Golden query set**     | The fixed query/result fixture run in all three clients to prove search parity.                                                     |

---

## 2. Domain model and the `topics` artifact

### 2.1 Entities

A **topic page** is identified by its slug. Its status is `flagship` or
`catalog`. Both statuses render the same layered anatomy: thesis (flagship
only), then the auto-mined section lineup from §6.

The artifact stores **flagship content only**. Catalog pages are assembled live
through the same section composer, so there is one code path, the artifact stays
small, and partial-corpus honesty is automatic.

### 2.2 `topics.db` schema

The artifact is a single SQLite file compiled from `content/topics/*.md`.

```sql
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- keys: schema_major, schema_minor, content_revision, compiled_at,
--       bible_db_revision (the compile-time pin), source_digest

CREATE TABLE topics (
  slug        TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  thesis_ast  TEXT NOT NULL,   -- JSON portable AST, the thesis block(s)
  body_ast    TEXT NOT NULL,   -- JSON portable AST, the authored ## sections
  position    INTEGER NOT NULL -- stable listing order
);

CREATE TABLE topic_aliases (
  alias       TEXT PRIMARY KEY,  -- normalized form; PK enforces the no-duplicate rule
  display     TEXT NOT NULL,     -- the authored surface form
  slug        TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE,
  canonical   INTEGER NOT NULL   -- 1 for the topic's primary phrase
);

CREATE TABLE topic_edges (
  from_slug   TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE,
  to_slug     TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK(kind IN ('authored', 'backlink')),
  position    INTEGER NOT NULL,
  PRIMARY KEY (from_slug, to_slug, kind)
);

CREATE TABLE topic_catalog_keys (
  slug        TEXT PRIMARY KEY REFERENCES topics(slug) ON DELETE CASCADE,
  catalog_id  TEXT NOT NULL,   -- bible.db topics.id, e.g. 'naves-topical-bible.JUDGMENT'
  matched_by  TEXT NOT NULL CHECK(matched_by IN ('override', 'name'))
);

CREATE INDEX idx_topic_aliases_slug ON topic_aliases(slug);
CREATE INDEX idx_topic_edges_to ON topic_edges(to_slug);
```

`thesis_ast` and `body_ast` hold a **portable AST**, never HTML. The CLI text-renders
the same value the Solid app renders as elements, which the three-client contract
requires. The AST node union is the wiki's own — a small block/inline set (paragraph,
heading, emphasis, strong, scripture reference, writings citation, list, blockquote,
link) — not the EGW HTML AST in `packages/core/src/egw/ast.ts`, whose node kinds
describe EGW markup rather than authored markdown.

### 2.3 Edges and backlinks

`topic_edges` with `kind = 'authored'` come from the `related:` frontmatter list.
`kind = 'backlink'` rows are **compile-derived**: the compiler matches the phrase
dictionary against every flagship body and records flagship→flagship hits. Catalog
page backlinks are computed live by the composer — the artifact never carries a
catalog-keyed edge.

### 2.4 Overlay keying

The catalog lives in `bible.db`:
`topics(id TEXT PRIMARY KEY, name, alternative_names)` at
`packages/core/src/bible-db/schema.ts:81-85`, with `topic_sections` (`:86-92`)
and `topic_references` (`:93-100`). Catalog ids are prefixed
`naves-topical-bible.` and the catalog is Nave's Topical Bible (5,322 rows,
76,957 references — [research 011](../wayfinder/wiki-study-layer/research/011-topic-candidates.md)).

Keying resolves **at compile time**. The compiler pins the `bible.db` revision it
matched against in `meta.bible_db_revision`, and writes one `topic_catalog_keys`
row per flagship topic that has a match. A `catalog:` frontmatter value is an
`override`; otherwise the compiler attempts a case-insensitive name match and
records `name`. Two catalog topics claiming one slug is a **compile error**.

At runtime, when the installed `bible.db` revision differs from
`meta.bible_db_revision`, the reader falls back to case-insensitive name matching
and logs the drift as one `[wiki] catalog-drift compiled=… installed=…` line.
The runtime never guesses at ambiguity — an ambiguous name match yields no
overlay, and the page renders without the catalog-sourced key-verses section.

### 2.5 Service surface

One portable `WikiService` in `packages/core/src/wiki/service.ts`:

```ts
export interface WikiServiceApi {
  readonly topic: (slug: TopicSlug) => Effect.Effect<WikiPage, WikiError>;
  readonly list: (input: WikiListInput) => Effect.Effect<readonly WikiPageSummary[], WikiError>;
  readonly dictionary: Effect.Effect<PhraseDictionary, WikiError>;
}
```

`topic` returns the composed layered page: authored core (empty for catalog
pages) plus the assembled section lineup. `dictionary` returns the compiled alias
table so a client can build its matcher once.

New procedures in `packages/core/src/procedure/group.ts`, declared with the
existing `procedure(tag, { payload, success })` helper (`:50-72`) and registered
in `BibleProcedureGroup` (`:211`):

- `v1.wiki.topic.get` — payload `{ slug }`, success `WikiPage`
- `v1.wiki.topics.list` — payload `{ query?, letter? }`, success `readonly WikiPageSummary[]`
- `v1.wiki.dictionary.get` — payload `{}`, success `PhraseDictionary`

CLI commands calling `WikiService` directly, `--json` via `Flag.boolean('json')`:

- `bible wiki topic <slug> [--json]`
- `bible wiki topics [--query <q>] [--json]`
- `bible wiki matches "<text>" [--json]`

A shared `--json` flag already exists at
`packages/cli/src/lib/content/options.ts` but only `commands/notes.ts` imports
it; `bible.ts:22`, `hymns.ts:22`, and `egw/search.ts:51` each redefine it
locally, and `encodeJson` is re-declared in five places. The `bible wiki *` and
`bible study *` commands use the shared flag and one shared encoder; §12 leaves
whether to retrofit the existing commands as an implementation choice.

**Relationship to the existing topics surface.** `v1.topics.list` /
`v1.topics.get` (`group.ts:198,206`) and `TopicService`
(`packages/core/src/topics/service.ts`) already read the catalog tables and back
the `/topics/:topicId?` route (`packages/app/src/application/routes.tsx:231`,
route union `packages/app/src/route/model.ts:20`, codec `route/codec.ts:65-67,149-150`,
component `packages/app/src/library/topics.tsx`, hooks `useTopics` /
`useTopicDetail` in `packages/app/src/runtime/reading-data.ts`). `WikiService`
**composes over** `TopicService` for catalog data; it does not replace it. The
`v1.topics.*` procedures stay as the catalog-data seam. §11 records the
recommended fate of the `/topics` route.

---

## 3. Content pipeline and authoring workflow

### 3.1 Source format

Authored sources live at `content/topics/<slug>.md` in the repo root. Forty draft
stubs are committed. Frontmatter, as already used by
`content/topics/investigative-judgment.md`:

```yaml
---
slug: investigative-judgment
title: Investigative Judgment
status: draft # draft | approved
aliases:
  - 'investigative judgment'
  - 'cleansing of the sanctuary'
related:
  - sanctuary
  - 2300-days
  - close-of-probation
catalog: JUDGMENT # optional overlay-key override
---
```

The body is the thesis paragraph(s) first, then optional authored sections as
`##` headings. Auto-mined sections are **never** written into the file — the
composer appends them at view time.

### 3.2 Generation

A Claude workflow mass-produces drafts. Per topic, the corpus comes from
`bible egw study <subject> --pioneers --export`. Fan-out is batched at ~8-10
agents per run and the workflow is args-subsettable. Every EGW or pioneer quote
carries a refcode citation. The universal teachings format is not the page
format; its sourcing discipline — reference-first, capped witnesses — is.

### 3.3 Review

`status: draft` pages are inert: the compiler skips them entirely, so a draft
compiles to nothing. The user reviews the git diff — content judgment and the
workflow-generated alias set together — and flips `status: approved`. Drafts stay
in-repo harmlessly.

### 3.4 Compilation

`bun run build:topics` is Bun build tooling under `packages/scripts` or
`packages/core`'s build scripts, **not** portable runtime core. No client
compiles topic markdown at runtime.

The compiler:

1. Reads every `content/topics/*.md`, skipping `status: draft`.
2. Parses markdown to the portable AST (§2.2).
3. Flattens all approved `aliases:` into `topic_aliases`. A duplicate normalized
   alias across two topics is a **compile error**.
4. Resolves overlay keys against the local `bible.db`, recording its revision.
   Ambiguity is a compile error.
5. Writes authored edges, then derives flagship→flagship backlinks by running
   the §4 matcher over every flagship body.
6. **Verifies every citation.** For each cited refcode plus quoted text, the
   compiler resolves the refcode in the local writings database and asserts a
   normalized substring match against that paragraph's text. Any miss **fails
   the compile**. No hallucinated citation can reach the artifact. Review is for
   content judgment, not citation policing.
7. Emits `topics.db` and a manifest (`revision`, `size`, `sha256`).

### 3.5 Corpus-supply lifecycle

A topics artifact is a second instance of the `bible.db` file-artifact shape:
one compiled, versioned, digest-verified SQLite file. Every hard mechanism —
digest pin, streaming install, semantic verification, atomic swap, browser
generation rollback, stale-fallback — already exists and is tested
([research 001](../wayfinder/wiki-study-layer/research/001-corpus-supply-fit.md)).

New work in `packages/core/src/corpus-supply/`:

- `TOPICS_ARTIFACT_RELEASE` (url, revision, digest, size) mirroring
  `BIBLE_ARTIFACT_RELEASE` (`bible-artifact.ts:9-14`), plus a
  `TopicsArtifactRecipe` / `TopicsArtifactInstaller` `Context.Service` pair.
- Widen four closed unions: `CorpusName` (`model.ts:9`), `CorpusTarget`
  (`model.ts:57`) with a new `TopicsTarget`, the `Target` constructor object
  (`model.ts:107`), and `CorpusIdentity` (`model.ts:14`) for a topics identity.
  `CorpusInstallationError.corpus` and `CorpusRecipeUnavailableError.corpus`
  (`errors.ts:22,31`) widen for free once `CorpusName` does.
- An `ensureTopics` branch in `CorpusSupply.ensure` (`service.ts:144-155`).
- A semantic verifier: page count > 0, alias count > 0, `meta.schema_major`
  within range.

Adapters: native reuses `layerNativeBibleArtifacts`
(`packages/core/src/platform-node/bible-artifact.ts`) with a topics destination
and source list; web adds a second generation store instance plus a
`/api/assets/topics` proxy route mirroring `/api/assets/bible`
(`apps/web/server/main.ts`). Wiring lands in all three composition roots.

**Degradation posture: writings-style, not Bible-style.** Bible is fail-closed
at startup; topics wraps its `ensure` in a catch, logs, and lets the app start.
Because digest verification and semantic verification both run before
activation, and both installers preserve the active generation on any failure,
the only observable states are: current artifact active, stale-but-verified
previous artifact active, or no artifact. "Partial" cannot happen silently. With
no artifact, every topic falls back to a catalog landing page — the catalog
tables ship inside the verified `bible.db`, so that fallback is always available.

**Audit flag, carried forward:** the file-artifact machinery is bible-branded
across four files (~600 lines of type names, source ids, registry keys, filename
regexes). Generalize it into one `FileCorpusArtifact` abstraction parameterized
by corpus id **before** adding the third copy. Milestone 1 does this refactor
first; see §9.

### 3.6 Release cadence — hybrid

The compiled-in artifact pin is the **offline floor**: an app build always has a
content version it can install with no network. On top of it, a lightweight
**runtime manifest** check against a stable GitHub-releases URL (one release per
content version) offers content-only updates, verified with the same SHA-256 and
size discipline as the pin.

Trust surface for v1 is HTTPS plus digest — **no signing**. Revisit if
distribution ever leaves GitHub.

**Cadence rule.** Schema-bearing changes (new tables or columns) ride the
compiled pin and therefore an app release. Content-only refreshes ship via the
runtime manifest at any time. The artifact schema version gates the runtime
path: an app never installs an artifact whose `schema_major` exceeds what it
compiled against.

**Update affordances.** Web and desktop: a non-blocking toast plus a settings
entry reading "Topic content: v3 installed, v4 available". CLI: `bible topics
status` and `bible topics update` — stable JSON, explicit invocation, no hidden
mutation.

---

## 4. Phrase dictionary and rendering rules

### 4.1 Matching point

**Render-time, dictionary in the artifact.** A naive JS Aho-Corasick automaton
over 1,000 phrases builds in ~1 ms and matches an EGW paragraph in ~15 µs; a
30-paragraph screenful costs **0.38 ms** on an M4 Pro under Bun, under 1% of a
60 fps frame budget. Aho-Corasick is flat in dictionary size (11.9 µs at 100
phrases, 16.3 µs at 2,000) where regex alternation degrades superlinearly
(13 µs → 603 µs). The realistic v1 dictionary is **250-400 phrases** (~50 topics
× 4-8 aliases). Web is a small multiple slower and stays well inside budget.
Numbers: [research 002](../wayfinder/wiki-study-layer/research/002-phrase-matching.md).

Precomputed spans were rejected: they break on partial EGW libraries and per-book
revisions, and their `content_text` offsets still need AST re-projection at render
time, so they do not shortcut the hard part.

### 4.2 The matcher

One portable matcher in `packages/core/src/wiki/phrase-matcher.ts`. It builds the
automaton once per dictionary load and emits host-neutral values:

```ts
export interface PhraseSpan {
  readonly start: number; // offset into the supplied text run
  readonly end: number;
  readonly slug: TopicSlug;
  readonly alias: string; // the normalized alias that matched
}
```

Solid renders spans as links; the CLI prints the same matches via
`bible wiki matches "<text>" --json`. The matcher imports no host runtime.

### 4.3 Normalization

Case-insensitive. Whitespace collapsed. Soft punctuation (commas, semicolons)
transparent. Matches only on word boundaries. An alias claimed by two topics is a
**compile-time error** — there is no runtime ambiguity to resolve.

### 4.4 Overlap resolution

Longest match wins at the same start: "heavenly sanctuary" beats "sanctuary". A
span that starts inside an already-emitted span is suppressed **for that
occurrence only** — the suppressed phrase is not penalized page-wide, and its
next clean occurrence is still eligible under §4.5.

### 4.5 First-occurrence rule

**Per phrase, first clean occurrence per section is hot.** The literal
one-link-per-section reading was disproved by the prototype: _little horn_ took
Daniel 8's single slot and starved every other phrase in the chapter. Each
distinct phrase gets its own first occurrence.

The regression fixture is Daniel 8 and the pair it pins is _the daily_ /
_sanctuary_ — both in v11, both hot, which the disproved reading would not
allow. _Pleasant land_ was the pair originally named here and is **not**
matchable: the KJV writes it `pleasant [land]` and §4.3 does not fold brackets,
so §10's Milestone 4 footnote records the interaction and the fixture keeps a
separate test asserting the phrase stays cold on both the raw and the rendered
path.

"Section" is defined per surface:

| Surface                | Section                                 |
| ---------------------- | --------------------------------------- |
| Bible                  | the chapter                             |
| EGW / pioneer writings | the chapter or reading unit as rendered |
| Topic page             | each layered section of the page        |

**A page never links to itself.** §4 originally stated no rule for the case, and
Milestone 6 hit it as soon as topic pages carried the overlay: a topic's own
aliases occur constantly in its own auto-mined text, so every `2300-days` page
would have offered a peek card for `2300-days`. The page's own slug is therefore
excluded from the dictionary the page's sections are matched against. This is a
per-page exclusion, not a dictionary change — the same alias stays hot on every
other page and on every reading surface.

### 4.6 Boundary rules

A phrase span never crosses a `TextSegment` boundary
(`packages/core/src/bible-rendering/segments.ts:21-28`) and never enters a
`ScriptureRef` or `BookRef` AST node (`packages/core/src/egw/ast.ts:54-84`) —
those nodes already carry link semantics and a second link layer inside them
would fight the first.

For Bible text, phrase links become a new `TextSegment` variant applied with the
same discipline `applySearchHighlights` (`segments.ts:116`) uses: only `text`
segments split. For EGW, matching runs over per-`Text`-node text produced by
`parseParagraphContent` (`ast.ts:190`), which respects node boundaries by
construction.

**The segment pipeline is not wired up yet.** `segmentVerseText`,
`applyItalicSegments`, `applyRedLetterSegments`, and `applySearchHighlights` are
implemented, exported from `@bible/core/bible-rendering`, and have **zero
consumers** outside their own directory. `packages/app/src/reading/bible-reader.tsx`
renders `{verse.text}` as a raw string — no italics, no red letter, no margin
anchors. Milestone 6 therefore carries the cost of wiring the segment renderer
into the reader before phrase spans have anywhere to land. This is pre-existing
debt the wiki layer inherits, not new work the wiki layer invents, and paying it
also delivers the italics and red-letter rendering the reader has always lacked.

### 4.7 Styling

Hot phrases render as a **muted dotted underline taking the surrounding text
color**. No blue. No background fill. Hover or tap raises the peek card (§5). The
restraint is load-bearing: at 250-400 phrases a dense chapter carries many links,
and colored links would turn scripture into soup.

### 4.8 Noise-flagged aliases

Bare `judgment` (36,862 corpus hits), bare `Babylon`, `1843`, and `the
bridegroom` are excluded from the v1 dictionary, with the exclusion recorded as a
comment in the affected stub. `the daily` and `seven times` carry
context-restriction notes for the matcher — which nothing implements yet (§4.9).
Counts and the full flag list:
[research 011](../wayfinder/wiki-study-layer/research/011-topic-candidates.md).

### 4.9 Known implementation gap: context-restricted aliases

The exclusions of §4.8 are honored — a noise-flagged alias is simply absent from
the dictionary, and `phrase-matcher.test.ts:520` pins that. The **restrictions** are not.
`the daily` must not fire inside `the daily paper`, the author wrote the rule
down where §4.8 says to (`content/topics/the-daily.md:16`: _"the daily" needs
context-restricted matching ("the daily paper")_), and every layer between that
comment and the reader drops it.

The artifact has nowhere to put it. §2.2's `topic_aliases` is
`(alias, display, slug, canonical)` — four columns, none of which carries a
condition — so the §3.4 compiler discards the note with the rest of the HTML
comment it lives in. Nothing downstream asks for it either:
`grep -rn "restrict" packages/core/src/wiki` finds no match, so the render-time
matcher (`phrase-matcher.ts`) links `the daily` inside `the daily paper` and the
§7 resolver (`lookup-service.ts`) answers a selection of it with the same topic.
That the two agree is the only good news here: there is no half of this rule
implemented for the other half to drift from.

**The fix is not a resolver rule, and not a matcher rule alone.** §4.8 states the
requirement as a rule _for the matcher_, and the matcher matches what the
artifact hands it: honoring the restriction means a §3.1 source syntax for it
(the note is prose in a comment today), a column for it in §2.2's
`topic_aliases`, a §3.4 compiler that carries it across, and **one** condition
rule read by both the matcher and the §7 resolver — a phrase that is a link on
the page and a miss in the panel would be worse than today's uniform
over-matching. That is an M2/M4-shaped change riding the schema pin (§3.6),
schedulable after Milestone 9. Milestone 7 deliberately shipped without it: a
resolver-only restriction would have created exactly the divergence the shared
§4.3 scan exists to prevent.

---

## 5. Navigation UX

**Mode A — peek card, full navigation, breadcrumb trail. Sliding panes are
rejected.** Prototype and decision asset: `prototypes/rabbit-hole/` — run
`bun install && bun run --cwd prototypes/rabbit-hole dev`, then
`http://localhost:5199?mode=A` / `?mode=B`. It is outside the root workspaces
array and is throwaway; delete it once Milestone 6 lands.

Geometry evidence against panes:

- Collapsed-pane spines cost **44 px** each. At 1440 px with five hops open only
  ~**1.7 panes** stay legible, and dense scripture wants ~**460 px** per pane.
  The honest desktop ceiling is **two** readable panes plus a rail.
- Below **~620 px** the pane model breaks outright and needs a Mode-A fallback
  anyway: panes go to `100vw - 26px`, spines shrink to 26 px, and the sticky
  spine offset must be capped at 1 or the measure erodes with every hop. With the
  cap, panes 2..n-1 hide and the stack silently stops being a trail.
- Panes lose random access. Mode A's breadcrumb jumps from hop 5 straight to hop
  1; Mode B can only pop or hit a visible spine.

One navigation model across web and desktop. No per-viewport model swap and no
desktop-only pane setting — a second navigation model is permanent UI-parity
surface for a payoff the geometry disproves.

**Peek card contents:** topic title, thesis paragraph, click-through. Nothing
else. On narrow viewports the peek card becomes a **bottom sheet** so it never
covers the phrase it explains; first tap peeks, second tap on the same phrase
navigates, tapping elsewhere dismisses.

**Trail:** a breadcrumb history stack of hops, tap-to-jump, truncating to the
tapped crumb, cleared on leaving the wiki surface.

**Arrival:** the layered anatomy reads well arriving mid-rabbit-hole **only with
"Key verses" defaulting open**. Fully collapsed the page reads as a table of
contents. The thesis carries the arrival.

This is a UI-only decision and applies to web and desktop alike. The equivalent
CLI domain operation is `bible wiki topic <slug>`, which returns the same
composed page as text or JSON; hover, panes, and touch have no CLI form.

---

## 6. Auto-mined section composition

**Everything is live-queried at view time.** No precomputed section bodies in the
artifact: warm batched FTS5 runs 0.1-4.3 ms (§4.1 receipts), and precomputation
breaks against partial libraries. Live queries are automatically honest about
what is locally installed.

One composer in `packages/core/src/wiki/section-composer.ts` serves flagship and
catalog pages identically.

### 6.1 Section lineup

| #   | Section                      | Source                                                    | Order            | Cap  |
| --- | ---------------------------- | --------------------------------------------------------- | ---------------- | ---- |
| 1   | Key verses                   | catalog `topic_references`, OSIS-normalized               | catalog position | 8    |
| 2   | EGW statements               | batched FTS over `paragraphs_fts`, EGW/White-Estate scope | FTS rank         | 5    |
| 3   | Commentary on the key verses | `EGWCommentaryService.getCommentary`                      | verse order      | 5    |
| 4   | Pioneer witnesses            | same FTS, pioneer book scope                              | FTS rank         | 5    |
| 5   | Cross-references             | `BibleDatabase.getCrossRefs` from the key verses          | source order     | 10   |
| 6   | Related topics               | authored edges, then backlinks                            | edge position    | none |

Section 1 is **default-open**; the rest are collapsed. Caps and ordering live in
core as composer constants, so all three clients cap identically. "Show all"
expands section 1 in place.

### 6.2 Search handoffs

The "everywhere this phrase appears" long tail is **not a section**. Sections 2
and 4 each end in a handoff into the hybrid search UI (§9), pre-filled with the
topic's canonical phrase and scoped to that section's corpus scope. Graph degree
stays small enough that section 6 needs no cap.

### 6.3 Partial-corpus degradation

A citation resolving to an uninstalled book renders **refcode + book title +
"get this book"**. No text snippet: snippets would need precomputed excerpts,
reintroducing the staleness §4.1 rejected, and FTS cannot reach uninstalled books
at all — these entries arrive from citations in authored cores and commentary
indexes, not from search.

Tap fires the existing `v1.reading.writingsPublication.download`
(`group.ts:130`). The `WRITINGS_LIBRARY_KEY` reactivity key
(`packages/app/src/cache/reactivity-keys.ts:74`) already invalidates the writings
library on download, so the section refreshes itself with no bespoke wiring.

CLI parity: `bible wiki topic <slug>` prints the same sections with the same caps
and the same "get this book" marker in its JSON.

### 6.4 Known implementation gap: corpus scope on FTS

Sections 2 and 4 need an author-scope filter that does not exist yet.
`EGWParagraphDatabase.searchParagraphs(query, limit?, bookCode?)`
(`packages/core/src/egw-db/book-database.ts:209-220`) filters by a **single book
code** and applies `LIMIT` **without `ORDER BY rank`**
(`:895-928`). `WritingsService.search(query, { limit?, publication? })`
(`packages/core/src/writings/service.ts:137-143`) inherits both limits.

Milestone 3 extends the portable database service with a corpus-scope parameter
(`egw` | `pioneer` | `all`) resolved against the indexed `books.book_author`
column (`book-database.ts:521,526`), and adds `ORDER BY rank` so "FTS rank order"
in the table above is real. Both changes are portable-core work and land behind
the same service interface all three clients already call.

### 6.5 Known implementation gap: a corpus fault reads as an absent corpus

§6.3's degradation and §7's are the same posture, spelled twice: `composeSections`
recovers a source's typed failure into an empty section nine times
(`packages/core/src/wiki/section-composer.ts:487,518,532,542,693,697,799,858,904`)
and `LookupService.resolve` into an empty group five
(`lookup-service.ts:391,459,488,536,611`), and neither surface has an error
channel for a client to read (`composeSections` and
`LookupServiceApi.resolve:78` both return an `Effect` that cannot fail).

**Two different things arrive on those channels and only one of them is
absence.** `BibleDatabaseError` is `SqlError | BibleDataIntegrityError`
(`packages/core/src/bible-db/bible-database.ts:21`): the same type reports "this
corpus is not installed" and "this installed corpus answered with a broken row
or failed a query". `WikiUnavailableError` carries a `corrupt` category beside
its absent one. Recovering both is what §6.3 asks for in the first case and a
silent lie in the second — a reader whose database is damaged is shown a topic
page with two fewer sections, or a lookup panel with an empty group, and
_nothing on screen or in the JSON says so_. The three-client contract states the
requirement the other way round: "Every portable service must expose typed
failures"
(`docs/wayfinder/wiki-study-layer/client-compatibility.md:20`), and a fault that
is never expressed is one no client can surface.

The current posture is pinned rather than assumed, so a change to it is visible:
`lookup-service.test.ts`'s _"answers with an empty group when one corpus reports
a typed failure"_ and _"does not swallow a defect"_ state both halves — recovery
is over the **error channel** only, and a defect still fails the effect.

**The fix is one change across both surfaces.** Splitting "declared absence"
(stays an empty section or group, as today) from "corpus fault" (a typed failure
the composer and the resolver both report, and the panel and the topic page both
render) means: an absence/fault distinction on the source services' own error
types, one recovery helper both surfaces call, and an error channel on
`composeSections` and `LookupServiceApi.resolve` alike. Doing it on one surface
alone would leave §6 and §7 reporting the same broken database two different
ways, which is worse than reporting it identically wrongly. It is scheduled
after Milestone 9 with §4.9.

---

## 7. Select-to-lookup

Curated phrases render as visible links; **any text selection can be looked up on
demand** as the fallback.

**One combined panel, resolver groups in core.**
`LookupService.resolve({ text, context? })` in
`packages/core/src/wiki/lookup-service.ts` returns typed resolver groups:

| Group                 | Source                                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| Topic matches         | phrase dictionary exact hit, then fuzzy                                                                |
| Strong's              | `BibleDatabase.getVerseWords` + `getStrongsEntry`, when `context` locates the selection inside a verse |
| Bible FTS hits        | `BibleDatabase.searchVerseWindow`                                                                      |
| EGW FTS hits          | `WritingsService.search`                                                                               |
| Catalog topical index | `TopicService.list`                                                                                    |

The topic group matches on §4.3's normalized form and §4.6's word boundaries —
the same scan the render-time matcher is keyed by, so a phrase cannot be a link
in the page and a miss in the panel. It inherits §4.9 with the matcher: an alias
carrying a context-restriction note matches here too, because no layer between
the authored note and either matcher carries the restriction. The four
corpus-backed groups inherit §6.5: a source that cannot answer subtracts its own
group, and an unreadable database is currently reported the same way an
uninstalled one is.

Selection is a **portable lookup input**. Web and desktop build it from the DOM
selection plus reading context; the CLI accepts the same text as an argument:

```
bible wiki lookup "the daily" [--context "Dan 8:13"] [--json]
```

and returns the same groups in stable JSON.

**Rendering.** One combined panel in the study-pane surface (§8), all groups
shown, empty groups collapsed. **No action menu.** A lone topic hit gets the
peek-card treatment from §5 instead of the full panel.

**No persistence in v1.** No lookup history, no promote-to-topic-candidate store.
The AI-assisted-linking fog item owns that trail when it graduates (§11).

---

## 8. Study-pane seam

`packages/core/src/bible-db/bible-database.ts` already implements every data
operation this seam needs. Nothing in `packages/core/src/procedure/group.ts`
exposes any of it and `packages/app` has no UI for it.
[feature-parity.md](feature-parity.md) already lists "Verse and paragraph study"
as Required for both visual hosts.

### 8.1 One portable service

`StudyService` in `packages/core/src/study/service.ts` composes existing methods
on `BibleDatabase` (`:98-157`), `EGWCommentaryService.getCommentary`, and
`WritingsService`:

| Bundle field     | Backing call                                |
| ---------------- | ------------------------------------------- |
| words            | `getVerseWords(book, chapter, verse)`       |
| crossRefs        | `getCrossRefs(book, chapter, verse)`        |
| marginNotes      | `getMarginNotes(book, chapter, verse)`      |
| commentary       | `EGWCommentaryService.getCommentary(verse)` |
| parallelWritings | `paragraph_bible_refs` reverse lookup       |

and, for the word-tap path: `getStrongsEntry(number)`,
`getVersesWithStrongs(strongsNumber, limit?)`, `getStrongsCount(strongsNumber)`.

### 8.2 RPC shape — one bundle

- `v1.study.verse.get(ref)` returns the whole bundle in **one** MessagePort
  round-trip. The pane always wants all of it and the payload is small; granular
  per-resource RPCs buy nothing but chatter.
- `v1.study.strongs.get(number)` serves the word-tap lexicon entry plus reverse
  concordance.

CLI: `bible study verse "Dan 8:13" --json` and `bible study strongs H8548 --json`
call `StudyService` directly with stable JSON.

### 8.3 Scope

**Margin notes are in** — the data ships in `bible.db` already and the service
method exists, so marginal cost is zero. **Scripture comparison is out** of this
seam: the parity doc lists it, but the charter v1 bar does not. It gets its own
ticket if wanted later (§11).

### 8.4 Parallel-EGW sparseness

v1 rides `paragraph_bible_refs` plus the EGW Bible Commentary and **accepts the
documented sparseness** — bible-ref rows are markup-dependent and populated for
only 45 of the 648 books in the 2026-08-14 snapshot
([research 003](../wayfinder/wiki-study-layer/research/003-pioneer-inventory.md)).
The FTS-mined wiki sections (§6) are the broad net that covers what the ref table
misses. A reference-extraction backfill pass is future work, not v1 (§11).

### 8.5 Gesture coexistence

**The two link layers never claim the same gesture.** Verse tap opens the study
pane. Wiki phrase tap opens the peek card. Phrases are inline spans; the verse
surface owns the tap **outside** a phrase span. This is the one place the study
seam touches the wiki layer, and it is a hard rule, not a preference.

---

## 9. Hybrid search architecture

### 9.1 Engine: learnings-only

qmd (MIT, TypeScript, Node ≥ 22) is welded to `better-sqlite3`, the `sqlite-vec`
native extension, and `node-llama-cpp` GGUF inference. None runs in the web
worker's wa-sqlite/OPFS host, so **direct use and fork both fail parity**. The
transferable value is its retrieval design, re-implemented over the existing
`paragraphs_fts` index plus a flat quantized vector artifact.
Receipts: [research 013](../wayfinder/wiki-study-layer/research/013-qmd-evaluation.md).

### 9.2 Vector scope and index format

**EGW + White Estate scope: 961,761 paragraphs, ~246 MB int8.** Not the full
3,012,004-paragraph corpus, which would be ~771 MB. Lexical FTS already covers
all 3,012,004 paragraphs; 246 MB is a defensible **optional** OPFS artifact,
771 MB is not.

One vector per paragraph — EGW paragraphs are natural, citation-stable chunks
well under 900 tokens, so qmd's hash+seq chunk bookkeeping is dropped entirely.
Vectors stay **out of SQLite**: a flat `Int8Array` scanned with dot products in a
worker is the same performance class as sqlite-vec (itself brute-force KNN today),
runs identically in a browser worker and in Electron, and needs zero native or
WASM SQLite work. Scan results join to `paragraphs` by paragraph id.

The index carries a **per-book manifest** so scope can grow incrementally
(pioneers later) without a format break, and a **model fingerprint** so a model
swap invalidates cleanly.

### 9.3 Query model: automatic routing, no new syntax

| Input shape                | Route                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------ |
| Quoted string              | exact phrase, lexical only                                                           |
| Refcode pattern (`GC 425`) | locate-jump                                                                          |
| Everything else            | always lexical; plus the vector leg when the index is present and the query is wordy |

qmd's **strong-BM25 short-circuit** skips the vector leg when the lexical top hit
is strong and clearly separated from the runner-up. Precise queries stay fast and
never pay for embedding.

### 9.4 Ranking

**RRF fusion, k = 60**, with the original query weighted ×2 and top-rank bonuses
(+0.05 for any list's #1, +0.02 for #2-3). **No cross-encoder rerank in v1** — a
0.6B reranker over 30 candidates is multi-second even on WebGPU, and hybrid
search must be correct without it. Reranking stays an optional later quality tier
whose position-aware blend (75/60/40 by rank band) is already designed.

**Topic pages surface as a pinned group above paragraph results** — never fused
into the paragraph ranking. Search is a rabbit-hole entry point, and a topic page
is a different kind of result from a paragraph.

### 9.5 Embeddings

One pinned fingerprint: **EmbeddingGemma-300M, 256-d MRL, int8**. Matryoshka
training makes 256-d truncation a supported, low-loss operation.

Query-embedding adapters, one contract, one fingerprint:

| Client  | Adapter                                                           | Latency class              |
| ------- | ----------------------------------------------------------------- | -------------------------- |
| Web     | transformers.js on WebGPU                                         | ~100-400 ms est.           |
| Desktop | native CPU (ONNX Runtime Node or node-llama-cpp) in Electron main | tens of ms, model resident |
| CLI     | native CPU under Bun                                              | tens of ms                 |

The WASM fallback (~3-7 s est. for a 300M model) is not a supported query path:
without WebGPU the web client degrades to lexical-only with the typed absence
below, rather than blocking on a multi-second embed.

### 9.6 Optional artifact and typed absence

The paragraph vector index ships as an **optional corpus-supply artifact**. An
absent index degrades to lexical-only, and the absence is the **same typed value
in all three clients** — a `VectorIndexUnavailable` reason on the result, never a
silent quality drop and never a host-specific branch.

### 9.7 Acceptance

One **golden query set** runs on web, desktop, and CLI. Ordered result identities
and fallback behavior must match within declared numeric tolerances. The fixture
lives with the core ranking tests and every client adapter runs it.

No spike ticket precedes implementation: the latency and size numbers were
measured on the real corpus, so the first implementation session functions as the
spike, and a format break before v1 costs nothing.

---

## 10. Implementation milestones

Each milestone is independently shippable, ends gate-green, and preserves parity.
Web/desktop **UI parity** and web/desktop/CLI **domain parity** are tracked
separately: a milestone may add no UI at all and still owe full three-client
domain parity.

The gate is `bun run gate` — `oxlint` plus `oxfmt` in parallel with `turbo run
gate` (per-package `typecheck`, `build`, `test`), then `bun run test:perf`.

Every milestone runs the six acceptance rules from the compatibility contract:

1. Oxlint proves portable core has no host imports (`.oxlintrc.json:58-90`).
2. Core contract tests with test services.
3. Adapter tests: web worker, Electron main, Bun CLI.
4. The same fixtures in all three clients.
5. Build web, desktop, CLI.
6. One web workflow, one desktop workflow, one CLI JSON workflow.

Milestones below name the milestone-specific content of rules 2, 3, 5, and 6.

---

### Milestone 1 — Generalize the file-artifact lifecycle

**Ships:** no user-visible change. Refactor only.

Collapse the bible-branded file-artifact machinery into one `FileCorpusArtifact`
abstraction parameterized by corpus id, manifest, semantic verifier, and
destination/generation prefix. Touches `corpus-supply/bible-artifact.ts`,
`platform-node/bible-artifact.ts`, `apps/web/src/workers/bible-database.ts`, and
`apps/web/src/workers/bible-generation-store.ts`. Widen `CorpusName`,
`CorpusTarget`, `CorpusIdentity`, and the `Target` constructor to admit a third
corpus without adding one yet.

This is first because §3.5's audit flag says to generalize **before** the third
copy-paste, and because Milestones 2 and 8 both add file artifacts.

- **Core tests:** existing `corpus-supply/service.test.ts` and `source.test.ts`
  pass unchanged; new tests prove the parameterized lifecycle for a synthetic
  corpus id (digest mismatch rejected, semantic verify failure preserves the
  active file, atomic swap).
- **Adapter checks:** web generation store retires orphaned candidates for a
  non-bible prefix; Electron main installs and swaps a synthetic artifact; Bun
  CLI `init` still ensures Bible with identical provenance.
- **Builds:** web, desktop, CLI.
- **CLI JSON workflow:** `bible init --force` reinstalls `bible.db` and reports
  unchanged activation identity.
- **UI parity:** none — no UI surface changes.

---

### Milestone 2 — Topics artifact end to end

**Ships:** `bun run build:topics` produces a verified `topics.db` that all three
clients install. No wiki UI yet.

Add the compiler (§3.4), `TOPICS_ARTIFACT_RELEASE`, recipe/installer,
`ensureTopics`, the semantic verifier, the `/api/assets/topics` proxy, and
per-host wiring with the **writings-style catch-and-warn** posture. Add
`WikiService.list` and `topic` returning authored cores with no auto-mined
sections yet.

- **Core tests:** compiler rejects duplicate aliases; compiler rejects a
  citation whose quoted text is absent from the cited refcode's paragraph;
  compiler skips `status: draft`; overlay ambiguity is a compile error; missing
  topics artifact yields catalog-only pages with a typed absence, not a failure.
- **Adapter checks:** web worker installs `topics.db` into a second OPFS
  generation and rolls back a failed candidate; Electron main atomically swaps
  `userData/topics.db`; Bun CLI `init` installs both artifacts.
- **Builds:** web, desktop, CLI.
- **CLI JSON workflow:** `bible wiki topics --json` lists approved flagship
  slugs; with the artifact removed, the same command returns catalog entries and
  the typed topics-unavailable reason.
- **UI parity:** none.

---

### Milestone 3 — Section composer and corpus scope

**Ships:** composed topic pages available through core, RPC, and CLI. Still no
new UI.

Implement the §6 composer with its caps and ordering as core constants. Close the
§6.4 gap: add a corpus-scope parameter to `EGWParagraphDatabase.searchParagraphs`
resolved against `books.book_author`, and add `ORDER BY rank`. Add
`v1.wiki.topic.get`, `v1.wiki.topics.list`, `v1.wiki.dictionary.get`.

- **Core tests:** section lineup order and caps (8/5/5/5/10/none); key verses
  default-open flag present; uninstalled-book hits render refcode + title +
  get-this-book with no snippet; catalog and flagship pages traverse the same
  composer; EGW scope excludes pioneer books and vice versa; rank ordering is
  stable.
- **Adapter checks:** worker executes the batched FTS per topic page in one
  round trip; Electron main returns the identical composed page; CLI composes
  the same page calling `WikiService` directly.
- **Builds:** web, desktop, CLI.
- **CLI JSON workflow:** `bible wiki topic sanctuary --json` emits all six
  sections with identical caps and identical result identities to the RPC
  response.
- **UI parity:** none.

---

### Milestone 4 — Phrase matcher and dictionary

**Ships:** phrase matching available in core and CLI; no rendering yet.

Implement the Aho-Corasick matcher, normalization, longest-match overlap, the
per-phrase first-occurrence-per-section rule, and the segment/AST boundary rules.
Add `bible wiki matches`.

- **Core tests:** longest-match-wins at equal start; a span suppressed inside
  another span is eligible at its next clean occurrence; per-phrase (not
  per-section) first-occurrence — the Daniel 8 _the daily_ / _sanctuary_
  regression case is a named fixture;[^daniel8-pair] no span crosses a
  `TextSegment` boundary; no span enters a `ScriptureRef` or `BookRef` node;
  word-boundary and soft-punctuation normalization cases; Unicode
  normalization: case folding is one shared scan on the dictionary side and the
  text side, and a span's offsets stay valid across final-sigma context,
  one-to-many lowercase expansions, and surrogate pairs.

[^daniel8-pair]:
    This pair replaces the _little horn_ / _pleasant land_ pair the spec named
    first, which is not matchable and never was. The KJV writes the
    translator-supplied word in brackets — `pleasant [land]`, verified in
    `packages/core/assets/kjv.json` — and both paths through §4 therefore reject
    it: `[` is not soft punctuation (§4.3's set is commas and semicolons), so it
    survives normalization and stands between the two words; and
    `segmentVerseText` turns `[land]` into its own `italic` segment, which §4.6
    forbids a span from crossing into. Making the phrase hot would mean widening
    §4.3 to swallow brackets — which would also fold "the daily [sacrifice]"
    into "the daily sacrifice" and change what the dictionary can claim — or
    letting spans cross segment boundaries, which §4.6 prohibits outright.
    Neither is warranted, so the named regression moved to a pair Daniel 8
    actually carries in matchable form. The bracket interaction keeps a test of
    its own: the raw verse and the rendered verse must agree that
    `pleasant land` is _not_ hot, because the CLI matches raw text and the
    reader matches segments, and the two disagreeing would be the real defect.

- **Adapter checks:** identical `PhraseSpan` output for the same input text in
  the web worker, Electron main, and Bun CLI — one shared fixture, byte-identical
  offsets.
- **Builds:** web, desktop, CLI.
- **CLI JSON workflow:** `bible wiki matches "$(bible bible verse 'Dan 8:9')"
--json` returns the fixture's exact spans.
- **UI parity:** none.

---

### Milestone 5 — Study pane

**Ships:** the first user-visible feature — Strong's on tap, cross-references,
margin notes, commentary, parallel EGW. Closes a Required row in
[feature-parity.md](feature-parity.md).

Add `StudyService`, `v1.study.verse.get`, `v1.study.strongs.get`, the CLI
commands, and the contextual pane in `packages/app`.

Study pane ships **before** wiki rendering deliberately: it is already-Required
parity work, it establishes the pane surface that select-to-lookup (§7) renders
into, and the §8.5 gesture rule is easier to honor when the verse-tap layer
exists first.

- **Core tests:** the bundle contains all five fields for a verse that has all
  five; sparse `paragraph_bible_refs` yields an empty parallel-writings list, not
  an error; Strong's reverse concordance respects its limit; margin notes present.
- **Adapter checks:** one MessagePort round trip per verse in the worker and in
  Electron main (asserted, not assumed); CLI calls `StudyService` directly.
- **Builds:** web, desktop, CLI.
- **CLI JSON workflow:** `bible study verse "Dan 8:13" --json` and `bible study
strongs H8548 --json` produce the same result identities as the RPC responses.
- **UI parity:** web and desktop render the same pane, same route state, same
  Loading/Errored/retained-stale behavior; narrow and wide; keyboard, pointer,
  touch.

---

### Milestone 6 — Wiki rendering and navigation

**Ships:** hot phrases, peek cards, breadcrumb trail, full topic pages.

First wire the existing segment pipeline into
`packages/app/src/reading/bible-reader.tsx`, which today renders `{verse.text}`
raw (§4.6). Then add the phrase-link `TextSegment` variant and the EGW AST
overlay, and build the peek card, the bottom-sheet variant, the breadcrumb
trail, and the topic page with key verses default-open.

- **Core tests:** unchanged matcher and composer contracts still pass; the
  page model exposes a default-open flag on section 1 rather than the UI
  hardcoding it; segment application order (italic, red letter, margin, phrase)
  is fixed and covered.
- **Adapter checks:** dictionary loads and the automaton builds in the worker, in
  Electron main, and in the CLI without host imports crossing the boundary.
- **Builds:** web, desktop, CLI.
- **CLI JSON workflow:** `bible wiki topic 2300-days --json` matches, section for
  section and identity for identity, what the UI renders.
- **UI parity:** web and desktop share one route in
  `packages/app/src/application/routes.tsx`, one peek component, one breadcrumb;
  narrow viewport uses the bottom sheet on both; reduced motion honored; the
  §8.5 gesture rule verified on both — a tap inside a phrase span never opens the
  study pane, a tap outside one never opens a peek card. Italics and red letter
  now render identically on both hosts.

---

### Milestone 7 — Select-to-lookup

**Ships:** any selection is lookup-able.

Add `LookupService.resolve` with its five resolver groups, render the combined
panel in the Milestone 5 pane surface, and add `bible wiki lookup`.

- **Core tests:** each resolver group populates independently; an empty group is
  present-and-empty, not absent; `context` inside a verse produces the Strong's
  group and omitting `context` does not; a lone topic hit is flagged for
  peek-card treatment.
- **Adapter checks:** DOM selection on web and desktop produces the same portable
  lookup input the CLI builds from its argument.
- **Builds:** web, desktop, CLI.
- **CLI JSON workflow:** `bible wiki lookup "the daily" --context "Dan 8:13"
--json` returns the same five groups in the same order as the panel.
- **UI parity:** one panel, all groups, empty groups collapsed, no action menu,
  identical on web and desktop.

---

### Milestone 8 — Hybrid search

**Ships:** natural-language plus precise queries in one box.

Add the query router, the lexical contract, the flat vector scan, RRF fusion, the
pinned topics group, the browser and native embedding adapters, and the optional
vector artifact riding the Milestone 1 lifecycle.

- **Core tests:** router classifies quoted / refcode / wordy inputs correctly;
  strong-BM25 short-circuit skips the vector leg on a confident lexical top hit;
  RRF k=60 with ×2 original weighting and top-rank bonuses reproduces the fusion
  fixture exactly; absent index yields lexical-only results carrying
  `VectorIndexUnavailable`; a model-fingerprint mismatch invalidates the vector
  leg rather than returning wrong neighbors; topic hits are a pinned group and
  never appear inside the paragraph ranking.
- **Adapter checks:** transformers.js WebGPU adapter, native CPU adapter under
  Electron main, and native CPU adapter under Bun all produce query vectors for
  the same pinned fingerprint that agree within the declared numeric tolerance;
  no-WebGPU web falls back to lexical-only with the typed absence.
- **Builds:** web, desktop, CLI.
- **CLI JSON workflow:** the **golden query set** runs via `bible egw search
--json`; ordered result identities and fallback behavior match the web and
  desktop runs within tolerance.
- **UI parity:** one search surface, shared query/scope/book URL state, identical
  pinned-topics presentation on web and desktop.

---

### Milestone 9 — Runtime content updates

**Ships:** content-only topic updates without an app release.

Add the runtime manifest fetch, the schema-major gate, the toast plus settings
entry on visual hosts, and `bible topics status` / `bible topics update`.

- **Core tests:** the update policy is one portable policy — the compiled pin is
  the floor, a newer runtime revision is offered, an artifact whose
  `schema_major` exceeds the app's is refused; digest or size mismatch aborts and
  leaves the installed version active; offline yields the pinned floor with no
  error.
- **Adapter checks:** web fetches the manifest through the same-origin proxy;
  Electron main fetches directly; CLI fetches under Bun. All three refuse the
  same schema-major overrun.
- **Builds:** web, desktop, CLI.
- **CLI JSON workflow:** `bible topics status --json` reports installed and
  available revisions with no mutation; `bible topics update --json` installs and
  reports the new activation.
- **UI parity:** identical non-blocking toast and identical settings entry on web
  and desktop.

---

## 11. Future work — explicitly out of v1

| Item                                                  | Status                                                                                                                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scripture comparison**                              | In [feature-parity.md](feature-parity.md)'s Required list but not the charter v1 bar. Out of the study seam; needs its own ticket.                                                                          |
| **Reference-extraction backfill**                     | `paragraph_bible_refs` is sparse (45 of 648 books in the snapshot). v1 accepts it; a backfill pass over the corpus is future work.                                                                          |
| **Lookup trail and candidate promotion**              | No lookup history and no promote-to-topic-candidate store in v1. Owned by the AI-assisted-linking fog item when it graduates.                                                                               |
| **AI-assisted linking beyond the curated dictionary** | Suggested topics, auto-detected phrases, "what should be a topic next" mining. Still fog on the map.                                                                                                        |
| **Cross-encoder rerank**                              | Designed (position-aware 75/60/40 blend) but not built. Desktop-optional later tier.                                                                                                                        |
| **Pioneer vector scope**                              | v1 vectors cover the 961,761-paragraph EGW/White-Estate scope only. The per-book manifest lets pioneers join later without a format break.                                                                  |
| **Signing the runtime manifest**                      | v1 trust surface is HTTPS + digest. Revisit if distribution leaves GitHub.                                                                                                                                  |
| **Public deployment shape**                           | Where the web app is hosted publicly, where artifacts are served from, when "public-ready" is exercised. Still fog on the map.                                                                              |
| **User annotations and reading plans**                | Deferred by charter. The app's existing features continue untouched; the wiki layer adds nothing here.                                                                                                      |
| **Additional Bible translations**                     | Out of scope by vision. KJV only, the `versions` table's generality notwithstanding.                                                                                                                        |
| **Unobtainable pioneer sources**                      | Hiram Edson's manuscript, the Midnight Cry run, Snow beyond TRMC no. 1, Voice of Truth / Western Midnight Cry / Day-Star runs, and the 1843/1850 charts are not on the platform and have no supply channel. |

### Fate of the existing `/topics` route

**Spec stance: merge into the wiki landing page. User-overridable.**

One route already serves topics: `/topics/:topicId?`
(`packages/app/src/application/routes.tsx:231` → `TopicsRoute` →
`packages/app/src/library/topics.tsx`, eyebrow "Nave's Topical Bible", A-Z letter
index plus search, `useTopics` / `useTopicDetail`). Because `WikiService`
composes over `TopicService` and every catalog topic already gets a landing page
for free (§2.1), keeping a second topic-browsing surface means two routes
rendering near-identical pages from the same data.

Recommended shape: **merge**. `/topics` becomes the wiki landing page, listing
flagship topics first and the Nave's catalog as the long tail behind the existing
letter index; `/topics/<id>` resolves through `WikiService` — a flagship slug
renders the authored page, a catalog id renders the landing page. The route
union, codec, and disclosure entries stay as they are, so there is no URL
breakage and no redirect to maintain, and `v1.topics.*` remains the catalog-data
seam. The "Topics" row in [feature-parity.md](feature-parity.md) — which today
demands only route identity, reading navigation, and loading/error recovery —
keeps being satisfied.

This is the map's remaining fog item. The user may override it (keep both
surfaces on separate routes, or redirect rather than merge) without disturbing
anything else in this spec; only §11 and Milestone 6's UI-parity line change.

---

## 12. Open details left to implementation

Implementation-level only. Nothing here belongs on the map.

- **Portable AST node set.** §2.2 names the block and inline kinds the compiler
  must emit; the exact schema shape, its encoding in `thesis_ast` / `body_ast`,
  and the CLI text renderer's line-wrapping are implementation choices.
- **`topics.db` FTS.** Whether the artifact carries its own FTS index over
  authored cores, or `WikiService.list` filters in SQL over `topics.title`. The
  40-page v1 size makes either fine.
- **Fuzzy topic matching in `LookupService`.** §7 requires a fuzzy group; the
  algorithm (trigram, edit distance, alias prefix) and its threshold are open.
- **Peek-card hover delay and dismissal timing.** The prototype used 180 ms;
  the shipped value is a tuning decision.
- **Vector artifact layout on disk.** Header fields, per-book manifest encoding,
  and whether the scan shards by book are open, provided the model fingerprint
  and the 256-d int8 contract hold.
- **Golden query set contents.** The acceptance rule is fixed; which queries and
  how many are chosen when Milestone 8 starts.
- **Numeric tolerances for cross-client search agreement.** §9.7 requires
  declared tolerances; the values are set against measured adapter variance.
- **Runtime manifest URL and polling cadence.** The mechanism is fixed; the exact
  URL and whether the check is per-launch or interval-based are open.
- **Where `bun run build:topics` lives.** `packages/scripts` versus a
  `packages/core` build script alongside `sync:bible`
  (`packages/core/package.json`). Either satisfies "Bun build tooling, not
  portable runtime core". The root has no `build:*` script today, so the name is
  a new root-level alias either way.
- **Compiler filesystem access.** The compiler reads `content/topics/*.md`, which
  the oxlint boundary forbids in portable core (`.oxlintrc.json:56-90`). Whether
  it uses Effect's `FileSystem` interface or lives in a `*-bun.ts` /
  `platform-bun/` file is open; both are permitted.
- **Retrofitting the CLI `--json` convention.** Whether the existing commands
  migrate to the shared flag in `packages/cli/src/lib/content/options.ts` and one
  shared `encodeJson`, or the new `wiki` and `study` commands simply adopt them
  while the rest stay as-is.

---

## Provenance

Every decision above traces to a closed ticket in the
[wiki-study-layer map](../wayfinder/wiki-study-layer/map.md).

| Spec area                                                                           | Deciding ticket                                                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §2 Domain model, artifact schema, overlay keying, service surface                   | [004 — Wiki domain model](../wayfinder/wiki-study-layer/tickets/004-wiki-domain-model.md)                                                                                       |
| §2.2 Artifact as a file-corpus lifecycle                                            | [001 — Corpus-supply fit](../wayfinder/wiki-study-layer/tickets/001-corpus-supply-fit.md)                                                                                       |
| §3.1-3.4 Source format, generation, review, compilation, citation verification      | [010 — Authoring workflow spec](../wayfinder/wiki-study-layer/tickets/010-authoring-workflow.md)                                                                                |
| §3.1 The 40 flagship topics and their aliases                                       | [011 — Flagship topic list v1](../wayfinder/wiki-study-layer/tickets/011-flagship-topic-list.md)                                                                                |
| §3.5 Corpus-supply lifecycle, degradation posture, audit flag                       | [001 — Corpus-supply fit](../wayfinder/wiki-study-layer/tickets/001-corpus-supply-fit.md)                                                                                       |
| §3.6 Hybrid release cadence, runtime manifest, update affordances                   | [015 — Content release cadence](../wayfinder/wiki-study-layer/tickets/015-content-release-cadence.md)                                                                           |
| §4.1 Render-time matching over precomputed spans                                    | [002 — Phrase matching feasibility](../wayfinder/wiki-study-layer/tickets/002-phrase-matching-feasibility.md)                                                                   |
| §4.2-4.8 Alias model, normalization, overlap, first-occurrence, boundaries, styling | [005 — Phrase dictionary model](../wayfinder/wiki-study-layer/tickets/005-phrase-dictionary-model.md)                                                                           |
| §4.5 Per-phrase scoping of the first-occurrence rule                                | [006 — Navigation prototype](../wayfinder/wiki-study-layer/tickets/006-navigation-prototype.md)                                                                                 |
| §5 Mode A, panes rejected, peek card, trail, key-verses default-open                | [006 — Navigation prototype](../wayfinder/wiki-study-layer/tickets/006-navigation-prototype.md)                                                                                 |
| §6 Live composition, section lineup, caps, search handoffs, partial corpus          | [008 — Auto-mined section composition](../wayfinder/wiki-study-layer/tickets/008-auto-mined-sections.md)                                                                        |
| §6.3 Pioneer corpus reality and `paragraph_bible_refs` sparseness                   | [003 — Pioneer corpus inventory](../wayfinder/wiki-study-layer/tickets/003-pioneer-corpus-inventory.md)                                                                         |
| §7 Combined panel, resolver groups, CLI form, no persistence                        | [007 — Select-to-lookup](../wayfinder/wiki-study-layer/tickets/007-select-to-lookup.md)                                                                                         |
| §8 Bundle RPC, scope, sparseness stance, gesture rule                               | [009 — Study-pane seam spec](../wayfinder/wiki-study-layer/tickets/009-study-pane-seam.md)                                                                                      |
| §9.1 Learnings-only over direct use or fork                                         | [013 — qmd evaluation](../wayfinder/wiki-study-layer/tickets/013-qmd-evaluation.md)                                                                                             |
| §9.2-9.7 Scope, routing, ranking, embeddings, optional artifact, acceptance         | [014 — Hybrid search design](../wayfinder/wiki-study-layer/tickets/014-hybrid-search-design.md)                                                                                 |
| §10 Milestone sequencing and per-milestone checks                                   | [012 — Assemble the buildable spec](../wayfinder/wiki-study-layer/tickets/012-assemble-spec.md) + [client-compatibility](../wayfinder/wiki-study-layer/client-compatibility.md) |
| §11 Out-of-v1 list                                                                  | gathered from the resolutions above and the map's Not-yet-specified                                                                                                             |

**Review status.** Tickets 004, 005, 006, 007, 008, 009, 010, 011, 014, and 015
were resolved on 2026-08-16 by the agent under the standing goal ("complete the
wayfinder"), per the never-block-on-the-human principle: each adopted the
recommended option from its decision package. **The user's review is pending.**
Every one of those decisions is reversible. Overriding any of them re-cuts the
affected spec section and any milestone that depends on it.

Tickets 001, 002, 003, and 013 are research findings with measured receipts
rather than adopted recommendations; their numbers stand independent of review.
