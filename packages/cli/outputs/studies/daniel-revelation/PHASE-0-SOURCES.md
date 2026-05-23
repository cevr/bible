---
status: COMPLETE — all pioneer sources + full EGW corpus (579 books, 727k paragraphs) synced.
purpose: Authoritative inventory of pioneer + EGW sources pulled into the local EGW DB for the "Foundations of Our Faith — The Pioneer Chain" series.
scope: 1816–1888 (per [[D3]]). Pioneer voices only — Froom/Olson/Arthur L. White excluded per [[D8a]].
db_path: ~/.bible/egw-paragraphs.db (1.0 GB)
schema_version: 3 (post-AST-canonicalization)
---

# Phase 0 — Source Inventory (Final)

Local DB lives at `~/.bible/egw-paragraphs.db`. Every code below was downloaded via:

```
cd packages/cli && bun run src/main.ts egw download --id <ID>
```

See [[CONTEXT]] for canonical pioneer names and [[DECISIONS]] for the scoping rationale.

## EGW corpus

| Status             |   Count | Notes                                                                                                     |
| ------------------ | ------: | --------------------------------------------------------------------------------------------------------- |
| Books synced       | **579** | All books in catalog table → success. 0 pending, 0 failed.                                                |
| Paragraphs indexed | 727,027 | Across all 579 books. FTS5 index rebuilt; full-content search confirmed on GC/EW.                         |
| DAR retry          |       1 | DAR initially stayed `pending` after main sync; re-downloaded via `--id 12861` → 3,568 paragraphs stored. |

## William Miller (8 books)

| CODE  | ID   | Title                                                                | Paras |
| ----- | ---- | -------------------------------------------------------------------- | ----: |
| MWM   | 1009 | Memoirs of William Miller (Bliss)                                    | 2,102 |
| MRSH  | 1319 | Miller's Reply to Stuart's "Hints on the Interpretation of Prophecy" |   162 |
| MWV1  | 1320 | Miller's Works, vol. 1. Views of the Prophecies                      | 1,007 |
| MWV2  | 1321 | Miller's Works, vol. 2. Evidence from Scripture and History          |   645 |
| MWSV2 | 1322 | Miller's Works, vol. 2 Supplement                                    |    32 |
| MWV3  | 2007 | Miller's Works, vol. 3. Matthew 24 / Inheritance / Sanctuary / Types |   223 |
| WMAD  | 1427 | William Miller's Apology and Defence                                 |   112 |
| LJHCS | 1315 | Letter to Joshua V. Himes on the Cleansing of the Sanctuary          |    27 |

## Josiah Litch (3 books)

| CODE  | ID   | Title                                                          | Paras |
| ----- | ---- | -------------------------------------------------------------- | ----: |
| PREX1 | 1029 | Prophetic Expositions, vol. 1                                  |   691 |
| PREX2 | 1030 | Prophetic Expositions, vol. 2                                  |   683 |
| PSC   | 1194 | The Probability of the Second Coming of Christ About A.D. 1843 |   443 |

## Charles Fitch + Snow + the Midnight Cry (3 items)

| CODE  | ID   | Title                                                           | Paras |
| ----- | ---- | --------------------------------------------------------------- | ----: |
| LCFMC | 1011 | Letters by Charles Fitch from The Midnight Cry, March 14, 1844  |    23 |
| LJL   | 1013 | Fitch — Letter to Rev. J. Litch, on the Second Coming of Christ |   126 |
| TRMC  | 1635 | The True Midnight Cry, vol. 1 no. 1 (S.S. Snow, Exeter)         |    84 |

## Joseph Bates (5 books)

| CODE  | ID   | Title                                                               | Paras |
| ----- | ---- | ------------------------------------------------------------------- | ----: |
| AJB   | 1086 | Autobiography of Elder Joseph Bates                                 |   714 |
| BP1   | 972  | Bates Pamphlet #1 — The Opening Heavens                             |    72 |
| BP2   | 973  | Bates Pamphlet #2 — Second Advent Way Marks and High Heaps          |   188 |
| BP3   | 974  | Bates Pamphlet #3 — Typical and Anti-typical Sanctuary              |   136 |
| LELJB | 1487 | James White — Early Life and Later Experience of Elder Joseph Bates |   760 |

## O.R.L. Crosier (1 item)

| CODE | ID   | Title                                       | Paras |
| ---- | ---- | ------------------------------------------- | ----: |
| SANC | 1198 | The Sanctuary (Day-Star Extra, Feb 7, 1846) |   100 |

## James White (5 books)

| CODE     | ID         | Title                                                              | Paras |
| -------- | ---------- | ------------------------------------------------------------------ | ----: |
| WLF      | 1445       | A Word to the Little Flock                                         |    67 |
| SATDSD   | 1529       | The Sanctuary, the 2300 Days, and the Shut Door                    |    59 |
| FUMP     | 1488       | The Four Universal Monarchies of the Prophecy of Daniel            |   172 |
| TTAM     | 1564       | The Third Angel's Message                                          |    38 |
| BMDN/BMD | 1288, 1449 | Brother Miller's Dream (two editions, 2 + 29 paras)                |    31 |
| SLWM     | 1482       | Sketches of the Christian Life and Public Labors of William Miller | 1,362 |

## J.N. Andrews (4 books)

| CODE | ID   | Title                                            | Paras |
| ---- | ---- | ------------------------------------------------ | ----: |
| HSFD | 1008 | History of the Sabbath and First Day of the Week | 1,826 |
| S23D | 1200 | The Sanctuary and Twenty-three Hundred Days      |   251 |
| SOTB | 1201 | The Sanctuary of the Bible                       |    49 |
| TMR  | 1240 | The Three Messages of Revelation 14:6–12         |   346 |

## John Loughborough (4 books)

| CODE | ID   | Title                                                            | Paras |
| ---- | ---- | ---------------------------------------------------------------- | ----: |
| GSAM | 1140 | The Great Second Advent Movement: Its Rise and Progress          | 2,759 |
| THB  | 1410 | The Two-Horned Beast                                             |   135 |
| TBUS | 1418 | The Two-Horned Beast of Rev. XIII, a Symbol of the United States |   242 |
| PGGC | 1617 | The Prophetic Gift in the Gospel Church                          |   290 |

## Apollos Hale (1 book)

| CODE | ID   | Title                    | Paras |
| ---- | ---- | ------------------------ | ----: |
| TSAM | 1203 | The Second Advent Manual |   401 |

## Uriah Smith — supplementary to DAR (3 books)

| CODE  | ID   | Title                                                          | Paras |
| ----- | ---- | -------------------------------------------------------------- | ----: |
| KPC   | 1314 | Key to the Prophetic Chart                                     |   159 |
| TTHDS | 1343 | The 2300 Days and the Sanctuary                                |   106 |
| STTHD | 1408 | The Sanctuary and the Twenty-three Hundred Days of Daniel 8:14 |   828 |

(DAR — 3,555 paras, already locally installed pre-Phase-0.)

## Foundational periodicals (4 items)

| CODE | ID   | Title                                                  |  Paras |
| ---- | ---- | ------------------------------------------------------ | -----: |
| DS   | 501  | The Day-Star (1844–1846)                               |     39 |
| ARSH | 1659 | Second Advent Review and Sabbath Herald, vol. 1 (1850) |  3,682 |
| HST  | 1648 | The Advent Herald (Himes), vol. 8                      | 11,737 |
| HST  | 1652 | The Advent Herald (Himes), vol. 7                      | 14,662 |

## EGW direct correspondence — Tier 3 (8 items)

Per [[D7]] — letters and manuscripts for the in-scope window.

| CODE   | ID    | Period                                                               |  Paras |
| ------ | ----- | -------------------------------------------------------------------- | -----: |
| 1EGWLM | 12667 | EGW Letters & Manuscripts: Volume 1 (intro/index)                    |  7,617 |
| 1LtMs  | 13961 | Letters and Manuscripts — Volume 1 (1844–1868)                       |  9,330 |
| 2LtMs  | 14052 | Letters and Manuscripts — Volume 2 (1869–1875)                       |  8,600 |
| 3LtMs  | 14053 | Letters and Manuscripts — Volume 3 (1876–1882)                       |  9,410 |
| 4LtMs  | 14054 | Letters and Manuscripts — Volume 4 (1883–1886)                       | 10,055 |
| 5LtMs  | 14055 | Letters and Manuscripts — Volume 5 (1887–1888) — Minneapolis         |  6,051 |
| 6LtMs  | 14056 | Letters and Manuscripts — Volume 6 (1889–1890)                       |  8,904 |
| 7LtMs  | 14057 | Letters and Manuscripts — Volume 7 (1891–1892) — terminus per [[D3]] |  9,297 |

## Totals

- **42 pioneer/EGW-correspondence works downloaded** (~146k paragraphs of new content)
- **537 EGW books** preserved in books table; paragraph re-sync running in background
- Local DB now at ~640+ MB

## Explicitly excluded

Per [[D8a]] — pioneer voices only:

- PFF1–4 — LeRoy Froom, _Prophetic Faith of Our Fathers_ (1946–1954, too late)
- QSEW — modern Olson volume
- ATJEJW — Arthur L. White biography
- A.T. Jones / E.J. Waggoner periodicals later than 1888 (unless a specific Minneapolis-era session calls for them)
- LtMs vols 8+ (1893 onward — past the [[D3]] 1888 cutoff)

## Known schema bump

Discovered during Phase 0: local DB had `SCHEMA_VERSION = 2` but `paragraphs` table was missing the post-canonicalize-AST `nodes_json` + `content_text` columns. Bumped `SCHEMA_VERSION` to `3` in `packages/core/src/egw-db/book-database.ts` to force drop+recreate. Books table preserved; sync_status rows automatically marked `pending` so the bulk sync repopulates everything cleanly.

## Open caveats

- ~~`egw search` against EGW books returns `(no content)` until the background re-sync finishes.~~ **Resolved.** All 579 books synced with full content; FTS5 verified.
- One transient SQLite lock conflict observed when running pioneer downloads + bulk sync simultaneously. Resolved by sequencing: pioneer first, then sync.
- DAR stayed `pending` after the main sync run (no error_message captured). Recovered with a direct `egw download --id 12861`. Suggests `sync:egw` may have skipped it silently — worth investigating before the next full sync.
- TFTC (Andrews — Three Messages) is actually `TMR` in the catalog, not `TFTC`. Original summary had wrong code.
- Original summary listed "Two-Horned Beast" as Andrews (TSPL); it's actually Loughborough (THB / TBUS).
