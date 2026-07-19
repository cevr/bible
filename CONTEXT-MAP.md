# Context Map

## Contexts

- [Bible](./packages/core/src/bible/CONTEXT.md) — identifies, reads, searches, and studies Scripture
- [Writings](./packages/core/src/writings/CONTEXT.md) — identifies, reads, and searches published writings
- [Reading Application](./packages/app/CONTEXT.md) — presents both corpora and owns portable reader choices and reading continuity
- [Desktop Reader](./apps/desktop/CONTEXT.md) — presents Bible and Writings content offline

## Relationships

- **Bible → Writings**: a Writings Paragraph may contain a Scripture Reference.
- **Writings → Bible**: Writings commentary may be gathered around a Bible Verse.
- **Reading Application → Bible, Writings**: the shared application presents both domains without owning their models.
- **Desktop Reader → Reading Application**: the desktop host supplies native capabilities without changing reader meaning.
