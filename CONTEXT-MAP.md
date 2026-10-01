# Context Map

## Contexts

- [Bible](./packages/core/src/bible/CONTEXT.md) — identifies, reads, searches, and studies Scripture
- [Writings](./packages/core/src/writings/CONTEXT.md) — identifies, reads, and searches published writings
- [Corpus Supply](./packages/core/src/corpus-supply/CONTEXT.md) — turns external assets into verified, installable corpora

## Relationships

- **Bible → Writings**: a Writings Paragraph may contain a Scripture Reference.
- **Writings → Bible**: Writings commentary may be gathered around a Bible Verse.
- **Corpus Supply → Bible**: Corpus Supply coerces source material into the Bible context's canonical Corpus before installation.
- **Corpus Supply → Writings**: Corpus Supply coerces source material into canonical Publications and Paragraphs before installation.
