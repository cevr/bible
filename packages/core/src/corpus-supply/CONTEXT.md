# Corpus Supply

The canonical language for acquiring external Bible and Writings assets, coercing them into trusted material, and installing replaceable corpora.

## Language

**Asset Source**:
An external origin from which corpus material can be acquired.
_Avoid_: Provider, downloader, upstream

**Corpus Contribution**:
Source material that has been decoded and coerced into the canonical shape of a Bible or Writings corpus.
_Avoid_: Payload, dump, raw data

**Corpus Artifact**:
A versioned and verified portable representation of one or more Corpus Contributions.
_Avoid_: Database file, cache, bundle

**File Corpus**:
A Corpus installed as one verified file: a pinned release manifest, an ordered list of byte Asset Sources, a semantic verifier, and an atomic swap. Bible is the first instance. Every File Corpus runs the same lifecycle, parameterized only by its name, label, verifier, and destination.
_Avoid_: Bible artifact, db file corpus

**Provenance**:
The identity, revision, and digest that establish where a Corpus Contribution came from and which content it contains.
_Avoid_: Metadata, version string

**Corpus Storage Identity**:
Every name a host uses to store one File Corpus's generations — generation filename prefix, metadata database name, active-generation key, asset path — derived from the corpus name in one place.
_Avoid_: Prefix, storage key, filename pattern

**Installation**:
The atomic replacement of installed corpus material with a verified Corpus Contribution.
_Avoid_: Import, sync, copy

**Activation**:
The point at which an installed Corpus becomes available to readers.
_Avoid_: Finalize, publish, swap

**Bootstrap**:
Ensuring that every corpus required for first use is installed and active.
_Avoid_: Init, setup, seed

## Invariants

- `CorpusSupply.ensure()` and `CorpusSupply.ensure({})` are the same Bible Bootstrap operation. Bootstrap ensures exactly the File Corpus required before first use; a best-effort File Corpus is addressed by its own `file` Target.
- Every File Corpus is registered once in `service.ts`. The registry is total over `CorpusFileName` and keyed by it, so a new file corpus cannot compile until the pipeline can ensure it, and an artifact filed under another corpus's name cannot compile at all.
- A File Corpus owns its own Recipe and Installer service keys. One corpus's Asset Sources can never be wired into another corpus's slot.
- A File Corpus owns one Corpus Storage Identity, derived from its name. A host never spells a storage name itself, so a generation store, metadata database, registry key, or asset path belonging to one corpus cannot be handed to another. Generation filenames encode corpus, revision, and digest unambiguously; `bible` keeps the exact strings it shipped with, and every corpus added afterwards takes the strict rule.
- Recipes own source priority. An unavailable Asset Source may fall through; a rejected Corpus Contribution fails closed.
- Provenance is content identity, not a receipt decoration. Installed source, revision, and digest determine readiness.
- Installation writes only to an inactive file or SQL transaction. Semantic verification completes before Activation.
- File Corpus release Artifacts declare an exact size and SHA-256 digest. Both native and browser adapters reject other bytes.
- Platform adapters own transport and storage mechanics only. They do not choose completeness, fallback, or verification policy.
