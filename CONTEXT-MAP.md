# Context Map

## Contexts

- [Bible](./packages/core/src/bible/CONTEXT.md) — identifies, reads, searches, and studies Scripture
- [Writings](./packages/core/src/writings/CONTEXT.md) — identifies, reads, and searches published writings
- [Corpus Supply](./packages/core/src/corpus-supply/CONTEXT.md) — turns external assets into verified, installable corpora
- [Reading Application](./packages/app/CONTEXT.md) — presents both corpora and owns portable reader choices and reading continuity
- [Desktop Reader](./apps/desktop/CONTEXT.md) — presents Bible and Writings content offline

## Relationships

- **Bible → Writings**: a Writings Paragraph may contain a Scripture Reference.
- **Writings → Bible**: Writings commentary may be gathered around a Bible Verse.
- **Corpus Supply → Bible**: Corpus Supply coerces source material into the Bible context's canonical Corpus before installation.
- **Corpus Supply → Writings**: Corpus Supply coerces source material into canonical Publications and Paragraphs before installation.
- **Reading Application → Bible, Writings**: the shared application presents both domains without owning their models.
- **Desktop Reader → Reading Application**: the desktop host supplies native capabilities without changing reader meaning.
- **Desktop host → Corpus Supply**: The desktop host supplies filesystem and SQLite capabilities; it does not own corpus acquisition policy.
- **Web host → Corpus Supply**: The web host supplies HTTP, browser storage, and worker SQLite capabilities; it follows the same corpus acquisition policy as desktop.
