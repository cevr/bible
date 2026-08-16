---
ticket: 003
title: Pioneer corpus inventory
date: 2026-08-14
---

# Pioneer corpus inventory

## 2026-08-15 post-sync note

The inventory below records the 2026-08-14 snapshot. The current local database
now contains 1,486 books and 3,012,004 paragraphs. It therefore holds nearly all
1,504 remote English catalog entries that the earlier inventory counted. The
channel, schema, AST, and FTS conclusions do not change. New topic and search
work must use current local coverage and must not repeat the old remote-only
assumption.

Web, desktop, and CLI must query this one schema through the same portable
database and writings services. Only their SQLite adapters differ.

## Summary

- There is **one channel**: the EGW Writings platform API, driven by
  `bible egw catalog` / `bible egw download`. **No manual imports exist.** Snow's
  True Midnight Cry (TRMC, book id 1635) was downloaded from the platform like every
  other book; only its **author field** is mangled by the API
  ("The True Midnight Cry, vol. 1, no. E" instead of "Samuel S. Snow").
- Local DB (`~/.bible/egw-paragraphs.db`): **648 books, 613,974 paragraphs**.
  537 are Ellen G. White; **111 are pioneer / non-EGW** across 23 author labels.
- Remote English catalog: **1,504 titles**. Pioneer-authored rows: **~604**
  (332 books + 272 periodical volumes). **All 111 local pioneer books round-trip to
  the remote catalog by book_id** — nothing local is platform-orphaned.
- **~233 pioneer books** and **~262 pioneer periodical volumes** are served remotely
  but not yet downloaded.
- Pioneer books are **first-class citizens** in the paragraphs DB: same AST
  (`nodes_json`), 100% FTS coverage, same `paragraph_bible_refs` mechanism. See the
  AST-parity note at the end.

## Channel model

| Channel       | What it is                                                                           | Contents                                                                       |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `platform`    | EGW Writings API via `bible egw catalog` / `bible egw download <CODE>` / `--id <ID>` | Everything: all 648 local books, plus ~495 more pioneer titles undownloaded    |
| `manual`      | Hand-imported texts                                                                  | **Empty.** TRMC was believed manual; receipts show it is platform book id 1635 |
| `unavailable` | Not on the platform at all                                                           | See "Not obtainable" below                                                     |

Credentials flow (required for `catalog`/`download`):
`cd packages/cli && set -a; source .env; set +a; ./bin/bible egw catalog ...`

CLI gotchas found while inventorying:

- `--author` on `catalog` filters **client-side after** `--limit` truncates the
  stream (`packages/cli/src/commands/egw/catalog.ts` lines 52-59). With no
  `--search`, `--author smith --limit 100` returns `[]`. To enumerate, dump the full
  catalog (`--limit 20000 --json`) and filter locally.
- Catalog `--search` matches **title**, not author, not code.
- Codes are **not unique** in the catalog: `HST` covers 8 volumes, `ARSH` ~50+
  volumes, `GCB/GCDB`, `GOH` repeat. Download by `--id` for periodicals; refcode
  lookups on shared codes can hit the wrong volume (known HST gotcha).
- The author-name filter list the `--pioneers` preset uses lives in
  `packages/cli/src/commands/egw/pioneer-authors.ts` (21 names incl. Hiram Edson,
  who has zero catalog presence).

## Table A — pioneer books LOCAL now (111)

All channel = `platform`, local = **yes**. Grouped by author.
(Query: `sqlite3 -readonly ~/.bible/egw-paragraphs.db "SELECT book_id, book_code, book_title, book_author, paragraph_count FROM books WHERE book_author != 'Ellen Gould White' ORDER BY book_author, book_title;"`)

| Author                          | Title                                                                    | Refcode    | ID          | Paras       |
| ------------------------------- | ------------------------------------------------------------------------ | ---------- | ----------- | ----------- |
| William Miller                  | Evidences from Scripture and History ... 1843                            | ESH        | 1296        | 197         |
| William Miller                  | Letter to Joshua V. Himes, on the Cleansing of the Sanctuary             | LJHCS      | 1315        | 22          |
| William Miller                  | Miller's Reply to Stuart's "Hints..."                                    | MRSH       | 1319        | 108         |
| William Miller                  | Miller's Works vol. 1 (Views of the Prophecies)                          | MWV1       | 1320        | 675         |
| William Miller                  | Miller's Works vol. 2 (Evidence from Scripture)                          | MWV2       | 1321        | 636         |
| William Miller                  | Miller's Works vol. 2 Supplement                                         | MWSV2      | 1322        | 6           |
| William Miller                  | Miller's Works vol. 3 (Exposition of Matthew 24 ...)                     | MWV3       | 2007        | 189         |
| William Miller                  | William Miller's Apology and Defence                                     | WMAD       | 1427        | 105         |
| Josiah Litch                    | Prophetic Expositions, vol. 1                                            | PREX1      | 1029        | 609         |
| Josiah Litch                    | Prophetic Expositions, vol. 2                                            | PREX2      | 1030        | 676         |
| Josiah Litch                    | The Probability of the Second Coming ... A.D. 1843                       | PSC        | 1194        | 418         |
| Joshua V. Himes                 | Millennial Musings                                                       | MIM        | 940         | 750         |
| Apollos Hale                    | The Second Advent Manual                                                 | TSAM       | 1203        | 391         |
| Charles Fitch                   | Letter to Rev. J. Litch                                                  | LJL        | 1013        | 115         |
| Charles Fitch                   | Letters From The Midnight Cry, March 14, 1844                            | LCFMC      | 1011        | 14          |
| Sylvester Bliss                 | Memoirs of William Miller                                                | MWM        | 1009        | 2062        |
| George Storrs                   | Six Sermons ... Immortality                                              | SSII       | 1341        | 542         |
| S. S. Snow (API author mangled) | The True Midnight Cry, vol. 1, no. 1                                     | TRMC       | 1635        | 17          |
| O.R.L. Crosier                  | The Sanctuary                                                            | SANC       | 1198        | 97          |
| Joseph Bates                    | A Seal of the Living God                                                 | SLG        | 957         | 314         |
| Joseph Bates                    | The Autobiography of Elder Joseph Bates                                  | AJB        | 1086        | 684         |
| Joseph Bates                    | [Pamphlet #1] The Opening Heavens                                        | BP1        | 972         | 70          |
| Joseph Bates                    | [Pamphlet #2] Second Advent Way Marks and High Heaps                     | BP2        | 973         | 179         |
| Joseph Bates                    | [Pamphlet #3] Typical and Anti-typical Sanctuary                         | BP3        | 974         | 128         |
| Joseph Bates                    | [Sabbath Controversy #2] Seventh Day Sabbath, A Perpetual Sign (2nd ed.) | SC2        | 1037        | 127         |
| James White                     | A Brief Exposition of the Angels of Revelation XIV                       | BEARF      | 1437        | 125         |
| James White                     | A Word to the "Little Flock"                                             | AWLF       | 1998        | 212         |
| James White                     | Brother Miller's Dream                                                   | BMDN / BMD | 1288 / 1449 | 2 / 15      |
| James White                     | Life Incidents                                                           | LIFIN      | 1462        | 1188        |
| James White                     | Life Sketches                                                            | LIFSK      | 1463        | 1148        |
| James White                     | Our Faith and Hope                                                       | OFAH       | 1468        | 176         |
| James White                     | Sketches of ... William Miller                                           | SLWM       | 1482        | 1302        |
| James White                     | Early Life ... of Elder Joseph Bates                                     | LELJB      | 1487        | 691         |
| James White                     | The Four Universal Monarchies                                            | FUMP       | 1488        | 141         |
| James White                     | The Sanctuary, the 2300 Days, and the Shut Door                          | SATDSD     | 1529        | 51          |
| James White                     | The Second Advent                                                        | SEADV      | 1530        | 104         |
| James White                     | The Second Coming of Christ                                              | SCOC       | 1531        | 250         |
| James White                     | The Signs of the Times [1853]                                            | ST1853     | 1534        | 358         |
| James White                     | The Sounding of the Seven Trumpets of Rev 8-9                            | SSTR       | 1560        | 220         |
| James White                     | The Third Angel's Message                                                | TTAM       | 1564        | 35          |
| J. N. Andrews                   | History of the Sabbath and First Day of the Week                         | HSFD       | 1008        | 1739        |
| J. N. Andrews                   | The First Day of the Week Not the Sabbath                                | FDNS       | 1130        | 106         |
| J. N. Andrews                   | The Judgment. Its Events and Their Order                                 | JEO        | 1149        | 407         |
| J. N. Andrews                   | The Sabbatic Institution, and the Two Laws                               | SITL       | 1197        | 73          |
| J. N. Andrews                   | The Sanctuary and Twenty-three Hundred Days                              | S23D       | 1200        | 247         |
| J. N. Andrews                   | The Sanctuary of the Bible                                               | SOTB       | 1201        | 49          |
| J. N. Andrews                   | The Three Angels of Revelation 14:6-12                                   | TAR        | 1615        | 400         |
| J. N. Andrews                   | The Three Messages of Revelation 14:6-12                                 | TMR        | 1240        | 334         |
| J. N. Andrews                   | The Two Laws                                                             | TWL        | 1241        | 30          |
| J. N. Loughborough              | Heavenly Visions                                                         | HEVI       | 1630        | 1288        |
| J. N. Loughborough              | Questions on the Sealing Message                                         | QSM        | 1331        | 93          |
| J. N. Loughborough              | The Great Second Advent Movement                                         | GSAM       | 1140        | 2388        |
| J. N. Loughborough              | The Prophetic Gift in the Gospel Church                                  | PGGC       | 1617        | 278         |
| J. N. Loughborough              | The Saints' Inheritance                                                  | SAIN       | 1407        | 238         |
| J. N. Loughborough              | The Two-Horned Beast                                                     | THB        | 1410        | 134         |
| J. N. Loughborough              | The Two-Horned Beast of Rev. XIII ... United States                      | TBUS       | 1418        | 237         |
| Uriah Smith                     | An Appeal to the Youth                                                   | APYO       | 1280        | 256         |
| Uriah Smith                     | Daniel and The Revelation (1897)                                         | DAR        | 12861       | 3555        |
| Uriah Smith                     | Daniel and The Revelation (1909)                                         | DAR1909    | 1297        | 2339        |
| Uriah Smith                     | Key to the Prophetic Chart                                               | KPC        | 1314        | 138         |
| Uriah Smith                     | Looking Unto Jesus                                                       | LUJ        | 1317        | 884         |
| Uriah Smith                     | Parable of the Ten Virgins                                               | PTV        | 1325        | 55          |
| Uriah Smith                     | Synopsis of the Present Truth                                            | SYNPT      | 1345        | 762         |
| Uriah Smith                     | The 2300 Days and the Sanctuary                                          | TTHDS      | 1343        | 55          |
| Uriah Smith                     | The Biblical Institute                                                   | TBI        | 1381        | 951         |
| Uriah Smith                     | The Sanctuary and the 2300 Days of Dan 8:14                              | STTHD      | 1408        | 812         |
| Uriah Smith                     | The Seven Heads of Rev 12, 13, 17                                        | SHR        | 1411        | 84          |
| Uriah Smith                     | The Visions of Mrs. E.G. White                                           | VEGW       | 1420        | 320         |
| Uriah Smith                     | The Warning Voice of Time and Prophecy                                   | WVTP       | 1421        | 167         |
| Uriah Smith                     | Without Excuse                                                           | WIEX       | 1426        | 19          |
| S. N. Haskell                   | Bible Handbook                                                           | BHB        | 978         | 2525        |
| S. N. Haskell                   | The Cross and its Shadow                                                 | CIS        | 1127        | 1220        |
| S. N. Haskell                   | The Story of Daniel the Prophet                                          | SDP        | 1236        | 681         |
| S. N. Haskell                   | The Story of the Seer of Patmos                                          | SSP        | 1237        | 1448        |
| J. H. Waggoner                  | A Written Discussion ... Upon the Sabbath                                | WDUS       | 1446        | 1420        |
| J. H. Waggoner                  | Angels: Their Nature and Ministry                                        | ATNM       | 1441        | 346         |
| J. H. Waggoner                  | From Eden to Eden                                                        | FEE        | 1453        | 1172        |
| J. H. Waggoner                  | Refutation of ... The Age to Come                                        | RDAC       | 1476        | 532         |
| J. H. Waggoner                  | The Atonement                                                            | AERS       | 1485        | 838         |
| J. H. Waggoner                  | The Mark of the Beast                                                    | MOB        | 1495        | 140         |
| J. H. Waggoner                  | Nature and Tendency of Modern Spiritualism                               | NTMS       | 1511        | 972         |
| J. H. Waggoner                  | Vindication of ... Resurrection of the Unjust                            | VDRU       | 1569        | 271         |
| E. J. Waggoner                  | Christ and His Righteousness                                             | CHR        | 1290        | 214         |
| E. J. Waggoner                  | Fathers of the Catholic Church                                           | FACC       | 1292        | 851         |
| E. J. Waggoner                  | Lessons on Faith                                                         | LOF_EJW    | 1628        | 2           |
| E. J. Waggoner                  | The Everlasting Covenant                                                 | EVCO       | 1332        | 1901        |
| E. J. Waggoner                  | The Glad Tidings                                                         | GTI        | 1391        | 654         |
| E. J. Waggoner                  | Waggoner on Romans                                                       | WOR        | 1613        | 1859        |
| A. T. Jones                     | An Exposition of Matthew Twenty-Four                                     | EMTF       | 962         | 307         |
| A. T. Jones                     | Ecclesiastical Empire                                                    | ECE        | 988         | 2753        |
| A. T. Jones                     | General Conference Daily Bulletin, vol. 5                                | GCB/GCDB   | 1002        | 1846        |
| A. T. Jones                     | Lessons on Faith                                                         | LOF_ATJ    | 11194       | 736         |
| A. T. Jones                     | The Bible Echo, vol. 11                                                  | BEST       | 1091        | 283         |
| A. T. Jones                     | The Consecrated Way to Christian Perfection                              | CWCP       | 1124        | 410         |
| A. T. Jones                     | The Eastern Question                                                     | EQ         | 1088        | 80          |
| A. T. Jones                     | The Great Empires of Prophecy                                            | GEP        | 1137        | 2243        |
| A. T. Jones                     | The Great Nations of To-day                                              | GNT        | 1136        | 677         |
| A. T. Jones                     | The Home Missionary, vol. 5                                              | HOMI       | 1134        | 1036        |
| A. T. Jones                     | The Marshaling of the Nations                                            | MON        | 1156        | 115         |
| A. T. Jones                     | The Medical Missionary, vol. 15                                          | MEDM       | 1161        | 926         |
| A. T. Jones                     | The Present Truth, vol. 12                                               | PTUK       | 1180        | 498         |
| A. T. Jones                     | The Signs of the Times, vol. 12                                          | SITI       | 1206        | 2099        |
| A. T. Jones                     | The Two Republics                                                        | TTR        | 1249        | 2985        |
| A. T. Jones                     | The World's Greatest Issues                                              | WGI        | 1245        | 507         |
| D. T. Bourdeau                  | Sanctification                                                           | SLH        | 1024        | 450         |
| GC of SDA                       | Source Book for Bible Students                                           | SBBS       | 933         | 5881        |
| Advent Review (periodical)      | The Advent Review, vol. 1                                                | ADRE       | 1640        | 1289        |
| ARSH (periodical)               | Second Advent Review, and Sabbath Herald, vol. 1                         | ARSH       | 1659        | 1542        |
| Himes' Signs of the Times       | Advent Herald ... Reporter [Himes], vols. 7-8                            | HST        | 1652 / 1648 | 5301 / 4158 |

## Table B — pioneer books served REMOTELY, not yet local (channel = platform, local = no)

233 books total. Enumerated by author (refcodes are real catalog codes; download by
`--id` when a code does not round-trip).

**Early Millerite / 1844-movement (highest wiki value):**

| Author          | Title (year)                                                             | Refcode | ID   |
| --------------- | ------------------------------------------------------------------------ | ------- | ---- |
| William Miller  | Dissertations on the True Inheritance of the Saints (1842)               | DTIS    | 1295 |
| William Miller  | The Kingdom of God (1842)                                                | TKOG    | 1400 |
| William Miller  | A Lecture on the Typical Sabbaths and Great Jubilee (1842)               | LTSGJ   | 1265 |
| William Miller  | Remarks on Revelations 13, 17, 18 (1844)                                 | RRTSE   | 1335 |
| William Miller  | Review of a Discourse ... by L. F. Dimmick (1842)                        | RDDD    | 1334 |
| Josiah Litch    | An Address to the Public, and Especially the Clergy (1841)               | APEC    | 958  |
| Josiah Litch    | Judaism Overthrown (1843)                                                | JUO     | 1006 |
| Joshua V. Himes | First Report of the General Conference of Christians ... (1841)          | FRGC    | 942  |
| Joshua V. Himes | Millennial Harp (1842)                                                   | MILHA   | 939  |
| Apollos Hale    | Herald of the Bridegroom (1843)                                          | HOB     | 1003 |
| Sylvester Bliss | Analysis of Sacred Chronology (1850)                                     | ASC     | 959  |
| Charles Fitch   | "Come Out of Her, My People" (1843)                                      | CHMP    | 2006 |
| Charles Fitch   | The Glory of God in the Earth (1842)                                     | GGE     | 1131 |
| Charles Fitch   | Letter to Brother Himes (1843)                                           | LBH     | 1012 |
| Charles Fitch   | Letter to the Presbytery of Newark (1840)                                | LPN     | 1014 |
| Charles Fitch   | The Power of the Gospel (1841)                                           | TPG     | 1175 |
| Charles Fitch   | Views of Sanctification (1839)                                           | VOS     | 1259 |
| Charles Fitch   | A Wonderful and Horrible Thing (1842)                                    | WHT     | 971  |
| George Storrs   | The Rich Man and Lazurus (1853)                                          | RMLS    | 1401 |
| O.R.L. Crosier  | The Law of Moses (Day-Star Extra, Feb 1846)                              | LOM     | 1142 |
| Joseph Bates    | [Sabbath Controversy #1] Seventh Day Sabbath, A Perpetual Sign (1846)    | SC1     | 1036 |
| Joseph Bates    | [Sabbath Controversy #3] A Vindication of the Seventh-day Sabbath (1848) | SC3     | 1038 |
| T. M. Preble    | A Tract Showing that the Seventh Day Should be Observed (1845)           | TSSD    | 1283 |
| T. M. Preble    | The Two Adams (1845)                                                     | TTA     | 1396 |

**Core SDA pioneers (remote-only books):** J. N. Andrews 17 (CRBJ 1121, TFTC 1122,
SOSL 1045, RCSK 963, ESRS 960, ROSS 1033, PRL 1174, TSPL 1248, SOTC 1040, SWE 1039,
WDNP 1244, RMLA 1196, DSD 1126, DBC 991, CRP 1123, RRCS 967, TFC 1246); James White
35 (BIAD 1447, BISA 1486, COTSN 1450, SDSNA 1533, SDSL 1532, JGMT 1491, PERGO 1471,
PSG 1470, RAR 1526, GOME 1454, MLDC 1465, DEBU 1451, LD1854 935, HHTL 1455, BHY
1448, and 20 more); Uriah Smith 33 (USLP 1419, MANA 1621, HHMLD 1311, MND 1318, WCS
1424, BSSL 1270, BSA 1287, MOSP 1324, S144 1282, TTC 1417, and 23 more); J. N.
Loughborough 12 (COOD 1119, LDT 1316, HPGO 1399, SGL 1340, MPC 961, DSQ63 992, and
6 more); J. H. Waggoner 14 more; E. J. Waggoner 31 more (GOSC 1390, GBG 1393, PROLI
1474, FAF 1388, LBFCG 1464, CRCH 1383, and 25 more); A. T. Jones 53 more (NSLS18
1171, CGRAS 984, TTL 1232, EB 1133, COML 1120, ICM 1147, and 47 more); plus R. F.
Cottrell 6, M. E. Cornell 3, G. I. Butler 4, D. T. Bourdeau 1 (RFOS 1031). Full
machine-readable list: scratchpad dump command in Receipts.

**Periodical volumes (remote-only, ~262):** Millerite era — HST (Himes' Signs of the
Times / Advent Herald) vols 1-6 (ids 1653-1658; vols 7-8 already local); ARSH vols
2-27 (1646...1676) plus vols 54-81; The Advent Review and Sabbath Herald later runs.
Post-1863 — A. T. Jones and E. J. Waggoner periodical volumes (ST, RH, PT,
American Sentinel 1-15, Bible Echo, GCB, Medical Missionary, Home Missionary etc.).
All share per-family codes (HST, ARSH, ...) — download by `--id`.

**Adjacent non-pioneer but useful (served):** Froom PFF1-PFF4 (956, 1579, 1582,
1583), CFF1-CFF2 (953, 955); many EGW Estate compilations.

## Table C — manual imports (channel = manual)

None. The one suspected case (TRMC) is platform book id 1635, downloaded
2026-06-04 (see `sync_status`). The only "manual" residue is metadata: attribute
TRMC to Samuel S. Snow by hand in compiled output.

## Not obtainable from the platform (need another source)

| Author / work                                                                          | Evidence                                                                                                     | Alternative source                                 |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **Hiram Edson** — 1844 manuscript fragment (Port Gibson / hidden manna)                | 0 catalog rows for "Edson" in the 1,504-title dump (the `--pioneers` preset even lists him)                  | Andrews University / CAR scans; Knight anthologies |
| **The Midnight Cry** (Himes' NYC paper, 1842-44) — full run                            | Only excerpt-books exist: LCFMC (Fitch letters), TRMC (Snow broadside)                                       | adventistdigitallibrary.org                        |
| **S. S. Snow** beyond TRMC vol. 1 no. 1 (Exeter sermon, later TMC issues)              | Catalog has exactly one TRMC row                                                                             | Advent Herald reprints; ADL                        |
| **Voice of Truth** (Joseph Marsh), **Western Midnight Cry**, **Day-Star** run (Jacobs) | No catalog rows (DS id 501 is EGW's Day-Star _letters_ only; Crosier's Day-Star Extra IS served as LOM 1142) | ADL                                                |
| **Advent Shield**; **Advent Mirror** (Hale/Turner, Jan 1845)                           | No catalog rows                                                                                              | ADL                                                |
| 1843 / 1850 prophetic charts (image artifacts)                                         | Catalog is text-only                                                                                         | White Estate / ADL image scans                     |

## AST-parity note (pioneer vs EGW books in the paragraphs DB)

Pioneer books behave **identically** to EGW books — one schema, one pipeline:

- **Same tables** for every book: `books`, `paragraphs` (with `nodes_json`,
  `content_text`, `refcode_short/long`, `element_type`), `paragraph_bible_refs`,
  `paragraphs_fts`, `sync_status`.
- **AST**: `nodes_json` holds the same node union for both corpora — `Text`,
  `Emphasis`, `Comment`, `ScriptureRef`, `BookRef`, `Unknown` (parser:
  `packages/core/src/egw/extract.ts`). Verified by sampling DAR (id 12861) and GC
  rows.
- **FTS**: 100% coverage — `paragraphs` 613,974 rows = `paragraphs_fts` 613,974
  rows. `bible egw search --book <CODE>` works on any pioneer code.
- **`paragraph_bible_refs`**: same mechanism (rows extracted from `egwlink_bible`
  spans in the API HTML), but coverage is **markup-dependent, not
  corpus-dependent** — and sparse: only 45 of 648 books have any rows (38 pioneer,
  7 EGW — the EGW rows are mostly BC volumes). 73 of 111 pioneer books have zero
  rows; totals are 11,390 pioneer refs vs 2,701 EGW refs. **Design consequence for
  the wiki layer:** verse-to-EGW/pioneer linking cannot rely on
  `paragraph_bible_refs` alone for either corpus; it needs text-side reference
  parsing or the FTS route.
- Element types in pioneer books are ordinary HTML blocks (`p`, `h1`-`h6`,
  `table`); nothing pioneer-specific.

## Receipts

Commands run (read-only; no downloads performed):

- `sqlite3 -readonly ~/.bible/egw-paragraphs.db "SELECT book_id, book_code, book_title, book_author, paragraph_count FROM books ..."` (all books; non-EGW subset; author group-by; schema dumps for `books`, `paragraphs`, `paragraph_bible_refs`, `sync_status`; FTS row counts; ref-count group-bys)
- `cd packages/cli && set -a; source .env; set +a; ./bin/bible egw catalog --limit 20000 --json > <scratchpad>/catalog-en.json` (1,504 rows)
- jq/awk cross-reference of catalog book_ids against local ids (`catalog-flagged.tsv`, `pioneer-remote.tsv` in the session scratchpad)

Files that informed conclusions:

- `/Users/cvr/Developer/personal/bible-tools/packages/cli/src/commands/egw/catalog.ts` (client-side `--author` filter after `--limit`)
- `/Users/cvr/Developer/personal/bible-tools/packages/cli/src/commands/egw/pioneer-authors.ts` (preset author list incl. Hiram Edson)
- `/Users/cvr/Developer/personal/bible-tools/packages/cli/src/commands/egw/download.ts` (code vs `--id` round-trip)
- `/Users/cvr/Developer/personal/bible-tools/packages/core/src/egw/extract.ts` (AST node union; `egwlink_bible` extraction)
- `/Users/cvr/Developer/personal/bible-tools/skills/bible/references/source-material.md` (command surface)
- `~/.bible/egw-paragraphs.db` (books, paragraphs, paragraph_bible_refs, paragraphs_fts, sync_status)
