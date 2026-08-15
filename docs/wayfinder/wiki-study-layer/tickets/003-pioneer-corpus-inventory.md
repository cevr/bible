---
id: 003
title: Pioneer corpus inventory
labels: [wayfinder:research]
status: open
assignee:
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
