# EGW Reader (Desktop)

An offline-first Bible and Ellen G. White reader. Electron owns credentials,
HTTP, and SQLite; the context-isolated preload exposes a typed bridge; Solid
renders the UI over an Effect service layer in the renderer.

## Architecture

- **Main process**: owns the EGW API client, OAuth token store, Bible corpus,
  EGW paragraph index, and both SQLite databases. `electron/runtime.ts`
  composes these implementations into one managed Effect runtime.
- **Procedure transport**: `electron/procedure-server.ts` and the transferred MessagePort are the single renderer interface for
  invoke-channel names, argument tuples, and serializable results. Both
  `electron/main.ts` registrations and `electron/preload.ts` invocations are
  typed from it.
- **Preload bridge**: the only renderer access to Electron capabilities. It
  presents a task-oriented `DesktopApi`; raw channel strings remain private to
  the bridge implementation.
- **Renderer services**: adapt `window.api` into domain-shaped Effect services.
  `src/procedures.ts` then exposes those services through a schema-validated,
  reactive query/mutation cache for Solid components. This procedure tree is a
  renderer-local interface, not a second transport protocol.

## Language

**Library**:
The set of **Books** the user has touched on this device. Browsing or opening a **Book** adds it to the **Library** (auto-cache on view). Removing it is explicit and permanent until re-touched.
_Avoid_: Shelf, collection, downloads

**Book**:
A single EGW work (e.g. _The Great Controversy_). Identified by `book_id`. Has metadata, a cover, and a list of **Chapters** discoverable via its TOC.
_Avoid_: Volume, document, title

**Chapter**:
A contiguous slice of a **Book** identified by the `para_id` of its starting heading **Paragraph**. The atomic fetch + cache unit — one EGW API call returns one **Chapter** as a list of **Paragraphs**.
_Avoid_: Section, page, content

**Paragraph**:
A single EGW content node — heading, body paragraph, or other element. Carries an `element_type` (`h1`–`h6`, `p`, …) and an HTML fragment `content`. Heading paragraphs delimit **Chapters**.
_Avoid_: Block, element, node

**TOC**:
The ordered list of heading **Paragraphs** for a **Book**, returned by EGW's `/books/{id}/toc`. Used to discover **Chapters** and render navigation.
_Avoid_: Index, contents, outline

**AST**:
A parsed representation of a **Paragraph**'s inline `content` HTML, walked from a DOMParser tree into a tagged union of `Text | Italic | Emphasis | Bold | Link | NoteRef | ScriptureRef | LineBreak | Unknown`. Replaces the sibling `@bible/web` approach of stripping HTML to plain text.
_Avoid_: Tree, parsed content, render model

**NoteRef**:
An inline footnote marker inside a **Paragraph**. Renders as an interactive control that scrolls to the corresponding footnote anchor within the same **Chapter**.
_Avoid_: Footnote, note marker

**ScriptureRef**:
An inline reference to a Bible passage inside a **Paragraph** (e.g. "John 3:16"). Activating it opens that passage in the shared Bible study drawer.
_Avoid_: Verse link, bible reference, citation

**Cache**:
Local SQLite stores owned by Electron main. `cache.sqlite` holds EGW API responses, the paragraph search index, and reading positions; `bible.sqlite` holds the canonical Bible corpus. The renderer-facing EGW seam is the `CacheService` Effect service.
_Avoid_: Storage, database, offline store

**Prefetch**:
Background fetch of all remaining **Chapters** of a **Book** after **Chapter** 1 renders. Runs as a forked fiber with `Effect.forEach({ concurrency: 4 })`. Cancelled when the **Book** is closed. Surfaces as a progress badge on the **Library** card.
_Avoid_: Preload, sync, download (download is the explicit user-initiated action)

**Download** (verb):
The explicit user action of pinning a **Book** to the **Library** via the "Download book" button. Functionally equivalent to **Prefetch** completing — every **Chapter** lands in the **Cache** — but user-triggered and synchronous-feeling (progress shown).
_Avoid_: Save, sync

**Search**:
Find a phrase across **Books**. Local-first: full-text over **Cache** via SQLite FTS5 (index built from **AST**-extracted text during cache writes). Online fallback: a "Search the full library online" affordance that calls EGW `/search` for **Books** not yet in the **Library**.
_Avoid_: Find, query (these are general terms — **Search** is the named feature)

**Progress** (reading):
A `0..1` fraction stored per `book_id` × `chapter_para_id`. Updated as the user scrolls; surfaces as a badge on **Library** cards and a top-edge bar in the reader.
_Avoid_: Position, bookmark, location

## Relationships

- A **Library** contains zero or more **Books**.
- A **Book** has one **TOC**, which lists its **Chapters**.
- A **Chapter** is a contiguous run of **Paragraphs** starting at a heading **Paragraph**.
- A **Paragraph** has one **AST** parsed from its `content` HTML.
- An **AST** may contain zero or more **NoteRefs** and **ScriptureRefs**.
- A **NoteRef** resolves to a **Paragraph** within the same **Chapter** (scroll target).
- The **Cache** stores **Books** and **Chapters** independently — a **Book** can be in the **Library** before all its **Chapters** are cached (mid-**Prefetch**).
- **Search** queries the **Cache** first, then optionally the EGW API; results are scoped to **Paragraphs** and navigate the user to the containing **Chapter**.

## Example dialogue

> **Dev:** "When the user clicks a **Book** in browse, what gets cached?"
> **Domain expert:** "The **Book** metadata + TOC immediately, then **Chapter** 1 to render. After Chapter 1 paints, **Prefetch** forks and pulls the rest at concurrency 4. If the user closes the **Book** mid-prefetch, the fiber is interrupted — partial **Chapters** stay in the **Cache** (they're individually addressable)."
>
> **Dev:** "So **Download** is just **Prefetch** with a button?"
> **Domain expert:** "Functionally yes. The button exists so the user can say 'I want this whole thing now, show me a progress bar' — versus the implicit 'I opened it, the rest is on its way' of auto-**Prefetch**. Both end with every **Chapter** in the **Cache**. There's no separate 'pinned' state — touching a **Book** _is_ adding it to the **Library**, and only explicit **Remove from library** takes it out."
>
> **Dev:** "What happens when a **Paragraph**'s **AST** has a **ScriptureRef**?"
> **Domain expert:** "It opens the shared Bible study drawer at that passage. **NoteRefs** still resolve within the current **Chapter**; ScriptureRefs cross from EGW reading into the canonical Bible corpus."
>
> **Dev:** "**Search** for 'great controversy' — what runs?"
> **Domain expert:** "SQLite FTS5 over the **Cache** first. Results show matching **Paragraphs** with snippet, **Book** title, **Chapter** title. Below the result list: 'Search the full library online' → EGW `/search`, which can surface **Books** not yet in the **Library**. Clicking those results triggers the normal browse → open → auto-**Prefetch** flow."

## Flagged ambiguities

- **"Chapter" vs EGW "section"/"page"**: EGW data uses `puborder`, `refcode_*`, page numbers, and heading hierarchy interchangeably. We pick **Chapter** = "run of paragraphs from one heading-paragraph to the next" because it's what the reader UI navigates between. EGW's own _page_ concept (physical print pagination) is metadata we display but don't route on.
- **"Download" vs "Prefetch"**: Same underlying effect (chapters land in **Cache**), different trigger. Avoid using them as synonyms — **Download** is always user-initiated, **Prefetch** is always implicit-after-open.
- **"Library" vs "Cache"**: The **Cache** is the storage layer (SQLite). The **Library** is the user-facing concept (left rail list). The **Library** is derived from the **Cache** (`SELECT * FROM books`) — they're not separate stores.
- **"Reference" overloaded**: A **Paragraph** has `refcode_short` (its own citation handle, e.g. "PP 351.1") and may contain inline **ScriptureRefs** and **NoteRefs**. We say "refcode" for the former and **ScriptureRef** / **NoteRef** for the latter — never bare "reference".
