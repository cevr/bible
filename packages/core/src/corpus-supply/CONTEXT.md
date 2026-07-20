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

**Provenance**:
The identity, revision, and digest that establish where a Corpus Contribution came from and which content it contains.
_Avoid_: Metadata, version string

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

- `CorpusSupply.ensure()` and `CorpusSupply.ensure({})` are the same Bible Bootstrap operation.
- Recipes own source priority. An unavailable Asset Source may fall through; a rejected Corpus Contribution fails closed.
- Provenance is content identity, not a receipt decoration. Installed source, revision, and digest determine readiness.
- Installation writes only to an inactive file or SQL transaction. Semantic verification completes before Activation.
- Bible release Artifacts declare an exact size and SHA-256 digest. Both native and browser adapters reject other bytes.
- Platform adapters own transport and storage mechanics only. They do not choose completeness, fallback, or verification policy.
