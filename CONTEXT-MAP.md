# Context Map

## Contexts

- [Bible](./packages/core/src/bible/CONTEXT.md) — identifies, reads, searches, and studies Scripture
- [Writings](./packages/core/src/writings/CONTEXT.md) — identifies, reads, and searches published writings
- [Desktop Reader](./apps/desktop/CONTEXT.md) — presents Bible and Writings content offline

## Relationships

- **Bible → Writings**: a Writings Paragraph may contain a Scripture Reference.
- **Writings → Bible**: Writings commentary may be gathered around a Bible Verse.
- **Desktop Reader → Bible, Writings**: the desktop reader presents both domains without owning their models.
