# Corpus Supply

`CorpusSupply.ensure(input?)` is the only application-facing asset bootstrap operation. New computers do not need repository asset folders or manual copying: CLI and browser acquire the pinned release Artifact, while desktop first checks its packaged and workspace sources before falling back to the same release.

## Current Bible Artifact

- Release: `db-v2`
- Size: `156291072` bytes
- SHA-256: `e72244f576be2bfa1b28c4816f60d3668338c1322d7cd329d73143ec43bf277c`
- Contents: 66-book KJV Canon, Strong's lexicon and verse data, OpenBible and TSKe Cross References, Margin Notes, and Topics

The manifest is declared once in `packages/core/src/corpus-supply/bible-artifact.ts`. Native sources stream directly from GitHub. Browser sources use `/api/assets/bible` so GitHub's transport-specific CORS behavior remains in the web adapter.

Browser generations are owned by one durable generation store. It registers a candidate before acquisition, activates the verified reader before publishing its marker, rolls the reader back if that durable commit fails, and reconciles every registered inactive generation on startup. The worker composition root supplies VFS mechanics but cannot reorder activation or retirement.

## Adapter contract

Bible inputs become a `BibleCorpusArchive` by decoding all seven source shapes before the single SQL Installation. A portable database becomes a `BibleArtifact` only when its declared Provenance matches its bytes and semantic verification proves the complete Canon and Study data.

Writings inputs become a canonical `PublicationArchive`. `provenanceForArchive` hashes the schema-encoded archive, and Installation stores its source, revision, and digest atomically with the Publication. The Writings recipe orders `packaged`, `provider`, then `archive` sources. It falls through only on `CorpusSourceUnavailableError`; `CorpusContributionRejectedError` fails closed.

To add an Asset Source:

1. Decode untrusted input with an Effect Schema at the adapter boundary.
2. Coerce it to `BibleCorpusArchive`, `BibleArtifact`, or `WritingsContribution`.
3. Supply exact Provenance; portable Artifacts must pin their SHA-256 digest.
4. Add the adapter to the static recipe with an existing source kind, or deliberately extend the exhaustive priority table.
5. Prove unavailable fallback, rejected-contribution fail-closed behavior, semantic verification, and preservation of the active generation in tests.

Do not expose URLs, paths, VFS handles, download ordering, or source selection through `CorpusSupply.ensure`.

## Publishing a Bible revision

1. Run `bun run --cwd packages/core sync:bible:force` to decode every source and build `packages/core/data/bible.db`.
2. Run the full gate and verify SQLite integrity plus the required semantic counts.
3. Compute the file size and SHA-256, then update the single manifest constant.
4. Publish a new release tag and asset; never replace bytes under an existing revision.
5. Verify the GitHub asset digest and exercise the web same-origin proxy before committing the manifest change.

The release Artifact is replaceable product data. User state lives in separate databases and is never included in this lifecycle.
