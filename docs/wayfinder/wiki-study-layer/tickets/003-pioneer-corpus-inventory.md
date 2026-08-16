---
id: 003
title: Pioneer corpus inventory
labels: [wayfinder:research]
status: closed
assignee: research-agent
blocked-by: []
---

## Question

The wiki layer's corpus is KJV + EGW + pioneer writings. What pioneer material is
actually available, and through which channel?

Inventory: (a) which pioneer books the EGW Writings platform serves for download via
`bible egw catalog`/`bible egw download` (Uriah Smith, J.N. Andrews, Litch, Haskell,
Loughborough, etc. — enumerate real refcodes; credentials flow documented in project
memory: `set -a; source packages/cli/.env; set +a` first); (b) what is already local in
`~/.bible/egw-paragraphs.db` (query `books` table if present); (c) what exists only as
manual imports (e.g. Snow's True Midnight Cry as refcode TRMC); (d) which known-important
pioneer works are NOT obtainable and would need another source.

Deliverable: a table (author, title, refcode, channel, local yes/no) plus a short note on
whether pioneer books behave identically to EGW books in the paragraphs DB (AST nodes,
`paragraph_bible_refs`, FTS). Write findings to
`docs/wayfinder/wiki-study-layer/research/003-pioneer-inventory.md`.

## Resolution

One channel only: the EGW Writings platform API. The local DB holds 648 books
(613,974 paragraphs); 111 are pioneer books, and every one round-trips to the remote
catalog by book_id — **no manual imports exist** (TRMC is platform book id 1635 with a
mangled author field, not a hand import). The remote English catalog (1,504 titles)
serves ~604 pioneer rows: ~233 more books and ~262 more periodical volumes are
downloadable but not yet local (full enumeration in the research doc). Not obtainable
from the platform: Hiram Edson's manuscript, the Midnight Cry periodical run, Snow
beyond TRMC no. 1, Voice of Truth / Western Midnight Cry / Day-Star runs, Advent
Shield/Mirror, and the 1843/1850 charts. AST parity holds: pioneer books share the
same `nodes_json` AST, 100% FTS coverage, and the same `paragraph_bible_refs`
mechanism — but bible-ref rows are markup-dependent and sparse in BOTH corpora
(45 of 648 books have any), so verse-linking cannot lean on that table alone.

Post-sync note, 2026-08-15: the local database now holds 1,486 books and
3,012,004 paragraphs. This current snapshot replaces the old local/remote
availability counts. The channel, schema, AST, and sparse-reference conclusions
remain valid.

Full findings: [research/003-pioneer-inventory.md](../research/003-pioneer-inventory.md)

The inventory describes one corpus schema. Web, desktop, and CLI must query it
through the same portable database and writings services.
