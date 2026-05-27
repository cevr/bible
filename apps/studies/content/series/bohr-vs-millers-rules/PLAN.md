# Pioneer Curation Plan

Per-chapter coverage checklists for populating `Verse.pioneerReadings` across all 23 chapters of `bohr-vs-millers-rules`. Each chapter has its own plan under `plans/<slug>.md` — open a plan, pick a verse, run the suggested CLI lookup, paste the resulting reading into the chapter JSON, and tick the box.

## Pioneer source set

All 13 pioneers below have their preferred books available in the local EGW Writings DB. Run `bible egw books` to audit; run `bible egw download <code>` (or `--id <id>`) to refresh a specific volume.

| Source             | Preferred books (EGW Writings codes)  | Primary lookup                                           |
| ------------------ | ------------------------------------- | -------------------------------------------------------- |
| Uriah Smith        | DAR, STTHD, TTHDS, KPC                | `bible egw search "<term>" --book DAR --json`            |
| Ellen G. White     | GC, EW, PK, PP, AA, DA, 1T-9T, Ev, SR | `bible egw commentary "<book> <chapter>:<verse>" --json` |
| William Miller     | MWV1, MWV2, MWV3, WMAD, MRSH, LJHCS   | `bible egw search "<term>" --book MWV2 --json`           |
| Josiah Litch       | PREX1, PREX2, PSC                     | `bible egw search "<term>" --book PREX1 --json`          |
| James White        | SLWM, LELJB, FUMP, SATDSD, TTAM       | `bible egw search "<term>" --book SATDSD --json`         |
| J. N. Andrews      | TMR, S23D, SOTB, HSFD, TWL, SITL      | `bible egw search "<term>" --book TMR --json`            |
| O. R. L. Crosier   | SANC                                  | `bible egw search "<term>" --book SANC --json`           |
| S. N. Haskell      | SDP, SSP                              | `bible egw search "<term>" --book SSP --json`            |
| A. T. Jones        | GEP, ECE, TTR, CWCP, LOF_ATJ          | `bible egw search "<term>" --book GEP --json`            |
| E. J. Waggoner     | CHR, EVCO, GTI, FACC, WOR, LOF_EJW    | `bible egw search "<term>" --book EVCO --json`           |
| Joseph Bates       | BP1, BP2, BP3, AJB                    | `bible egw search "<term>" --book BP2 --json`            |
| J. N. Loughborough | GSAM, PGGC, THB, TBUS                 | `bible egw search "<term>" --book GSAM --json`           |
| Charles Fitch      | LJL, LCFMC                            | `bible egw search "<term>" --book LJL --json`            |

- **Ellen G. White** — EGW Commentary index (`commentary`) is the fastest entry point; widen with `search --book GC` for thematic hits.
- **Josiah Litch** — PREX1+PREX2 = Prophetic Expositions; PSC = the 1838 paper that predicted Aug 11 1840.
- **J. N. Andrews** — TMR = Three Messages of Rev 14:6-12 (canonical Rev 13-14 source).
- **O. R. L. Crosier** — Crosier — the 1846 sanctuary article. Single book, 97 paragraphs; usually quoted whole-cloth.
- **S. N. Haskell** — SDP = Story of Daniel the Prophet; SSP = Story of the Seer of Patmos. Use SDP for Daniel chapters, SSP for Revelation.
- **A. T. Jones** — GEP = Great Empires of Prophecy (best for Dan 11 + Rev historical backbone); ECE = Ecclesiastical Empire (papal apostasy); TTR = Two Republics (USA = Rev 13 second beast).
- **E. J. Waggoner** — EVCO = Everlasting Covenant (covenant + sanctuary themes); FACC = Fathers of the Catholic Church (apostasy / Babylon framing).
- **Joseph Bates** — BP2 = Second Advent Way Marks (1840s chart material); BP3 = sanctuary typology.
- **J. N. Loughborough** — GSAM = Great Second Advent Movement (movement history & verse application); THB / TBUS = Two-Horned Beast = USA in Rev 13.
- **Charles Fitch** — Charles Fitch — Millerite leader, designed the 1843 chart. LJL = his open letter on the Second Coming.

## CLI workflow

```sh
# 1. EGW commentary for a specific verse (fastest path for EGW)
bible egw commentary "rev 9:13" --json

# 2. Scoped FTS inside a pioneer book
bible egw search "Ottoman" --book PREX1 --json
bible egw search "image of the beast" --book TMR --json

# 3. Exact refcode lookup (after finding a hit)
bible egw lookup "GC 334.2" --json
bible egw lookup "DAR 478.3-479.5" --json

# 4. Fallback: full corpus FTS (no --book scope)
bible egw search "midnight cry" --json
```

## Per-chapter coverage

Each verse can attract 0–13 pioneer readings (some pioneers wrote nothing on a given verse — that's fine). The "Pioneer entries" column counts all `pioneerReadings` rows currently in the chapter JSON.

| Chapter       | Verses | Pioneer entries | Plan                    |
| ------------- | -----: | --------------: | ----------------------- |
| Daniel 11     |     45 |              45 | [plan](plans/dan-11.md) |
| Revelation 1  |     20 |              20 | [plan](plans/rev-1.md)  |
| Revelation 2  |     29 |              29 | [plan](plans/rev-2.md)  |
| Revelation 3  |     22 |              22 | [plan](plans/rev-3.md)  |
| Revelation 4  |     11 |              11 | [plan](plans/rev-4.md)  |
| Revelation 5  |     14 |              14 | [plan](plans/rev-5.md)  |
| Revelation 6  |     17 |              17 | [plan](plans/rev-6.md)  |
| Revelation 7  |     17 |              17 | [plan](plans/rev-7.md)  |
| Revelation 8  |     13 |              13 | [plan](plans/rev-8.md)  |
| Revelation 9  |     21 |              21 | [plan](plans/rev-9.md)  |
| Revelation 10 |     11 |              11 | [plan](plans/rev-10.md) |
| Revelation 11 |     19 |              19 | [plan](plans/rev-11.md) |
| Revelation 12 |     17 |              17 | [plan](plans/rev-12.md) |
| Revelation 13 |     18 |              18 | [plan](plans/rev-13.md) |
| Revelation 14 |     20 |              20 | [plan](plans/rev-14.md) |
| Revelation 15 |      8 |               8 | [plan](plans/rev-15.md) |
| Revelation 16 |     20 |              20 | [plan](plans/rev-16.md) |
| Revelation 17 |     18 |              18 | [plan](plans/rev-17.md) |
| Revelation 18 |     24 |              24 | [plan](plans/rev-18.md) |
| Revelation 19 |     21 |              21 | [plan](plans/rev-19.md) |
| Revelation 20 |     15 |              15 | [plan](plans/rev-20.md) |
| Revelation 21 |     27 |              27 | [plan](plans/rev-21.md) |
| Revelation 22 |     21 |              21 | [plan](plans/rev-22.md) |

---

_Generated by `apps/studies/scripts/generate-plans.ts`. Re-run after curating to refresh coverage counts._
