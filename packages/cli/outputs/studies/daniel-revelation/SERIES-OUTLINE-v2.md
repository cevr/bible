# Foundations of Our Faith — The Pioneer Chain

A 37-session study series tracing how God led the SDA pioneers step by step into present truth, from William Miller's conversion (1816) through the Minneapolis General Conference (1888). Plus a 10-session bonus track of pioneer expositions of the Revelation chapters that don't land naturally in the historical narrative.

This document is the **canonical spec** for the series. For terminology, see [`CONTEXT.md`](./CONTEXT.md). For the reasoning behind every scoping decision, see [`DECISIONS.md`](./DECISIONS.md). For the source inventory feeding the work, see [`PHASE-0-SOURCES.md`](./PHASE-0-SOURCES.md).

---

## Series premise

> "We have nothing to fear for the future, except as we shall forget the way the Lord has led us, and His teaching in our past history."
> — _EGW, Life Sketches p. 196_

The pioneer movement was not a doctrinal accident. God led a people step by step into present truth — first the kingdoms (Dan 2), then the judgment (Dan 7), then the time (Dan 8-9), then the disappointment (Rev 10), then the sanctuary (cornfield), then the Sabbath (Bates), then the three angels assembled, then the gift of prophecy confirmed, then righteousness by faith (1888). **Each truth received was earned through Bible study, prayer, and faithfulness. Present truth is a chain, not a list. Drop one link and the chain breaks.**

This series walks that chain in the order it was forged.

**Method:** Historicist interpretation — the Reformation method, Miller's method, Smith's method. Scripture interprets Scripture. The 14 Rules govern. Literal interpretation enforces one fulfillment and one meaning; spiritual/allegorical interpretation breeds infinite reinterpretations. (See Session 4.)

**Audience:** Anyone who wants to understand why the SDA message exists at all — and why it matters. Assumes basic Bible literacy. Does NOT assume prior historicist-prophecy study (the v1 series covered that ground verse-by-verse; this one tells the story).

**Tone:** Daily devotional. Each session 15-25 minutes. Story + Scripture + Application. Pioneer voices in the body where the narrative needs them. Scripture is the doctrinal authority; quotes are the historical record.

**Frame:** "God led a people step by step into present truth." Each spine session forges one new link in the chain.

---

## How this differs from v1

The prior series (`SERIES-OUTLINE.md`, 34 chapter studies + 3 bonuses) is a **verse-by-verse historicist treatment of Daniel and Revelation**. It moves through the books in canonical order, opening every passage. v1 is being **archived in full** to make room for v2.

| Dimension         | v1 (archived)                                          | v2 (this spec)                                                            |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- |
| Spine             | Canonical book order (Dan 1 → Dan 12, Rev 1 → Rev 22)  | Historical chronology (Miller 1816 → Minneapolis 1888)                    |
| Granularity       | 34 ~chapter-length studies (40-60 min each)            | 36 short sessions (15-25 min each)                                        |
| Approach          | Verse-by-verse exposition                              | Story + Scripture + Application                                           |
| Quote policy      | Scripture-only in the body                             | Pioneer/EGW quotes used freely                                            |
| Coverage          | Every verse of D&R covered exactly once                | Prophetic content surfaces as pioneers opened it; recapitulation embraced |
| Primary reference | Bible DB + EGW DB + chiastic structural analyses       | Bible DB + EGW DB + DAR + pioneer primary writings                        |
| Markers           | `[KEY🔑]` `[⟲]` `[CTRF]` `[IMG]` `[DYK🔎]` `[Q]` `[→]` | All v1 markers + **`[CHAIN]`**                                            |

The shift is from "what does this chapter mean" to "how did God's people come to understand this." Same historicist method, same Scriptural anchors, but the spine is the experience of the movement.

---

## Reference shelf

All sources live in `~/.bible/egw-paragraphs.db` (640+ MB local SQLite). See `PHASE-0-SOURCES.md` for the full per-book download manifest with paragraph counts.

### Primary doctrinal authority

Scripture (KJV).

### Primary expositional authority

| CODE | Author      | Title                       | Paras |
| ---- | ----------- | --------------------------- | ----: |
| DAR  | Uriah Smith | _Daniel and the Revelation_ | 3,555 |

DAR is the **default exegetical reference**. When a session walks a prophetic text, the first place to consult is DAR. Smith was an eyewitness pioneer; his exposition carries the movement's understanding.

### Primary historical authority — EGW

| CODE             | Title                                              | Notes                                                                                      |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| GC               | _The Great Controversy_                            | Chapters 17-23 are the Millerite-movement backbone; chs 24-26 cover the sanctuary recovery |
| EW               | _Early Writings_                                   | EGW's first-hand visions and reflections on the early movement                             |
| 1SG–4bSG         | _Spiritual Gifts_ vols 1-4                         | The earliest EGW historical narratives                                                     |
| LS / LS80 / LS88 | _Life Sketches_ (3 editions)                       | Biographical anchor for the Whites                                                         |
| PK               | _Prophets and Kings_                               | Anchors 457 BC decree (ch 47-48), OT background                                            |
| DA               | _The Desire of Ages_                               | Anchors AD 27 baptism, AD 31 cross                                                         |
| 1LtMs–7LtMs      | EGW _Letters and Manuscripts_ vols 1-7 (1844-1892) | Direct correspondence covering the entire scope window                                     |
| ST               | _Signs of the Times_ (SDA-era)                     | EGW periodical writings — note: NOT the 1840 Himes _Signs of the Times_                    |
| RH               | _Review and Herald_                                | EGW periodical writings, post-1855                                                         |

### Primary historical authority — pioneer (Phase 0 inventory)

#### Miller corpus

| CODE  | Title                                                                 | Paras |
| ----- | --------------------------------------------------------------------- | ----: |
| MWM   | Sylvester Bliss, _Memoirs of William Miller_                          | 2,102 |
| MWV1  | Miller, _Works vol. 1: Views of the Prophecies_                       | 1,007 |
| MWV2  | Miller, _Works vol. 2: Evidence from Scripture and History_           |   645 |
| MWV3  | Miller, _Works vol. 3: Matthew 24 / Inheritance / Sanctuary / Types_  |   223 |
| MWSV2 | Miller, _Works vol. 2 Supplement_                                     |    32 |
| MRSH  | Miller, _Reply to Stuart's "Hints on the Interpretation of Prophecy"_ |   162 |
| WMAD  | Miller, _Apology and Defence_ (Aug 1, 1845)                           |   112 |
| LJHCS | Miller, _Letter to Himes on the Cleansing of the Sanctuary_           |    27 |

#### Litch corpus

| CODE  | Title                                                         | Paras |
| ----- | ------------------------------------------------------------- | ----: |
| PREX1 | Litch, _Prophetic Expositions vol. 1_                         |   691 |
| PREX2 | Litch, _Prophetic Expositions vol. 2_                         |   683 |
| PSC   | Litch, _The Probability of the Second Coming About A.D. 1843_ |   443 |

#### Fitch / Snow / Hale

| CODE  | Title                                                 | Paras |
| ----- | ----------------------------------------------------- | ----: |
| LCFMC | Fitch, _Letters from The Midnight Cry_ (Mar 14, 1844) |    23 |
| LJL   | Fitch, _Letter to Rev. J. Litch on the Second Coming_ |   126 |
| TRMC  | Snow, _The True Midnight Cry_ vol. 1 no. 1            |    84 |
| TSAM  | Hale, _The Second Advent Manual_                      |   401 |

#### Bates corpus

| CODE  | Title                                                                | Paras |
| ----- | -------------------------------------------------------------------- | ----: |
| AJB   | Bates, _Autobiography_                                               |   714 |
| BP1   | Bates, _The Opening Heavens_                                         |    72 |
| BP2   | Bates, _Second Advent Way Marks and High Heaps_                      |   188 |
| BP3   | Bates, _Typical and Anti-typical Sanctuary_                          |   136 |
| LELJB | James White, _Early Life and Later Experience of Elder Joseph Bates_ |   760 |

#### Crosier / cornfield-era sanctuary recovery

| CODE | Title                                                  | Paras |
| ---- | ------------------------------------------------------ | ----: |
| SANC | Crosier, _The Sanctuary_ (Day-Star Extra, Feb 7, 1846) |   100 |

#### James White corpus

| CODE       | Title                                                                             | Paras |
| ---------- | --------------------------------------------------------------------------------- | ----: |
| WLF        | James White et al., _A Word to the Little Flock_ (1847)                           |    67 |
| SATDSD     | James White, _The Sanctuary, the 2300 Days, and the Shut Door_                    |    59 |
| FUMP       | James White, _The Four Universal Monarchies of the Prophecy of Daniel_            |   172 |
| TTAM       | James White, _The Third Angel's Message_                                          |    38 |
| SLWM       | James White, _Sketches of the Christian Life and Public Labors of William Miller_ | 1,362 |
| BMDN / BMD | James White, _Brother Miller's Dream_ (two editions)                              |    31 |

#### Andrews corpus

| CODE | Title                                               | Paras |
| ---- | --------------------------------------------------- | ----: |
| HSFD | Andrews, _History of the Sabbath and First Day_     | 1,826 |
| S23D | Andrews, _The Sanctuary and 2300 Days_              |   251 |
| SOTB | Andrews, _The Sanctuary of the Bible_               |    49 |
| TMR  | Andrews, _The Three Messages of Revelation 14:6-12_ |   346 |

#### Loughborough corpus

| CODE | Title                                                                            | Paras |
| ---- | -------------------------------------------------------------------------------- | ----: |
| GSAM | Loughborough, _The Great Second Advent Movement_                                 | 2,759 |
| THB  | Loughborough, _The Two-Horned Beast_                                             |   135 |
| TBUS | Loughborough, _The Two-Horned Beast of Rev. XIII, a Symbol of the United States_ |   242 |
| PGGC | Loughborough, _The Prophetic Gift in the Gospel Church_                          |   290 |

#### Smith supplementary (beyond DAR)

| CODE  | Title                                                   | Paras |
| ----- | ------------------------------------------------------- | ----: |
| KPC   | Smith, _Key to the Prophetic Chart_                     |   159 |
| TTHDS | Smith, _The 2300 Days and the Sanctuary_                |   106 |
| STTHD | Smith, _The Sanctuary and the 2300 Days of Daniel 8:14_ |   828 |

#### Pioneer-era periodicals

| CODE | Title                                                    |  Paras |
| ---- | -------------------------------------------------------- | -----: |
| DS   | _The Day-Star_ (1844-1846)                               |     39 |
| ARSH | _Second Advent Review and Sabbath Herald_, vol. 1 (1850) |  3,682 |
| HST  | _The Advent Herald_ (Himes), vols 7-8                    | 26,399 |

### Explicitly excluded (per DECISIONS D8)

- LeRoy Froom — _Prophetic Faith of Our Fathers_ (PFF1-4), _Movement of Destiny_
- Modern Adventist historians — Knight, Damsteegt, Schwarz, Maxwell
- Robert W. Olson — _101 Questions on the Sanctuary_
- Arthur L. White — biographical material (secondary)

**Voices in the room only.** When a session needs to cite e.g. Vicarius Filii Dei or Litch's 1840 prediction, the receipt comes from Smith DAR, Litch's own _Probability of the Second Coming_ (PSC), or pioneer Review articles — not from PFF.

---

## The 37-session spine

Six parts of six sessions each. Every session adds one link to the present-truth chain (`[CHAIN]` marker at session close).

### Part 1 — The inherited chain (pre-Miller → Miller's door)

The Adventist movement did not begin with Miller. It inherited the Reformation's open Bible, the historicist method, and the church-period framework of Revelation 2-3.

| #   | Title                                                                      | Anchor text                | Primary sources                                            |
| --- | -------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------- |
| S01 | The Reformation's open Bible (Wycliffe/Luther) — Pergamos and Thyatira era | Rev 2:12-29                | GC ch 4-8; DAR Rev 2                                       |
| S02 | Sardis: a name to live (post-Reformation formalism)                        | Rev 3:1-6                  | GC ch 9-15; DAR Rev 3                                      |
| S03 | William Miller's conversion (1816)                                         | 2 Cor 5:14                 | MWM ch 1-3; WMAD; GC ch 18                                 |
| S04 | Miller's 14 Rules of Interpretation                                        | 2 Pet 1:19-21; Isa 28:9-10 | WMAD §V; MWV1 introductory; full Rules text quoted in body |
| S05 | The 14-year Dan 8-9 study (1816-1831): the 2300 days                       | Dan 8:14; 9:24-27          | MWV1; MWV2; PK ch 47-48; GC ch 18                          |

**Part 1 deliverables:** Reader sees that the SDA message stands on Reformation-historicist soil; understands that Miller's method is the inherited Reformation method made systematic; meets the 14 Rules as the **interpretive constitution** of the series.

**Chain links forged:** L1 — Reformation method recovered. L2 — the 2300 days end in 1844.

---

### Part 2 — The midnight cry begins (1831-1840)

Miller's private study becomes a public movement. Himes builds the press. Litch publishes the year-day prediction that will vindicate the entire method on Aug 11, 1840.

| #   | Title                                                         | Anchor text        | Primary sources                                                                             |
| --- | ------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| S06 | Miller goes public (1831)                                     | Matt 25:6          | MWM ch 6-7; GC ch 18                                                                        |
| S07 | Himes joins (1839); the press unleashed                       | Hab 2:2-3          | MWM ch 11-12; GC ch 18; HST (early issues)                                                  |
| S08 | Litch's Eastern Question (Rev 9): the 1840 Ottoman prediction | Rev 9:13-21        | PSC; PREX1; DAR Rev 9                                                                       |
| S09 | Aug 11, 1840 vindicated; the year-day principle proved        | Num 14:34; Eze 4:6 | PSC postscript; HST Aug-Sep 1840; GC ch 18                                                  |
| S10 | The 1843 charts (Fitch / Hale)                                | Hab 2:2            | TSAM; HST charts issue; EW 74 ("I saw that the chart was directed by the hand of the Lord") |

**Part 2 deliverables:** Reader watches the year-day method emerge from private conviction to public proof; sees the 1843 chart as God-directed visualization of present truth; understands the **Aug 11, 1840 vindication** as the public seal on Miller's method.

**Chain links forged:** L3 — the press unleashes the message. L4 — Eastern Question vindicates year-day. L5 — God Himself directs the chart.

---

### Part 3 — The loud cry + disappointment (1843-1844)

The Adventist message becomes a cry to come out of Babylon. The first disappointment in spring 1844 sifts the movement. Snow's True Midnight Cry at Exeter ignites the final phase. Then Oct 22.

| #   | Title                                         | Anchor text           | Primary sources                                                    |
| --- | --------------------------------------------- | --------------------- | ------------------------------------------------------------------ |
| S11 | Babylon-fallen: the second-angel cry          | Rev 14:8; 18:1-4      | Fitch's "Come Out of Her My People" sermon (1843); LJL; DAR Rev 14 |
| S12 | Philadelphia: the open-door movement          | Rev 3:7-13            | DAR Rev 3; GC ch 19-21; EW 14-20                                   |
| S13 | The first disappointment (April 1844)         | Hab 2:3; Rev 10:5-6   | WMAD §VI; GC ch 21; SLWM                                           |
| S14 | Samuel Snow's True Midnight Cry (summer 1844) | Matt 25:6; Lev 23:27  | TRMC; HST Aug 1844; GC ch 22                                       |
| S15 | Exeter camp meeting (Aug 1844)                | Matt 25:6             | TRMC; GSAM ch 5-6; GC ch 22                                        |
| S16 | Oct 22, 1844 — the Great Disappointment       | Rev 10:9-10; Dan 8:14 | GC ch 22-23; EW 14-20; LCFMC; LELJB                                |
| S17 | "Sweet in mouth, bitter in belly" (Rev 10)    | Rev 10:8-11           | DAR Rev 10; GC ch 23; EW 14-20                                     |

**Part 3 deliverables:** Reader experiences the **first disappointment as well as Oct 22** (most studies skip the spring 1844 sifting); meets Snow at Exeter; sits with the Disappointment as a real grief; sees Rev 10 as God's pre-written explanation of the bitterness.

**Chain links forged:** L6 — Babylon-fallen second-angel cry. L7 — Philadelphia open door. L8 — Midnight Cry / Exeter. L9 — Oct 22 sweet-then-bitter is the prophetic shape.

---

### Part 4 — The light in the dark (1844-1850)

After the Disappointment, God moves immediately. Edson in the cornfield (Oct 23). Crosier's sanctuary article (Feb 7, 1846). EGW's first vision (Dec 1844). Bates's Sabbath conviction (1846). The three angels assembled. The gift of prophecy confirmed.

| #   | Title                                                          | Anchor text             | Primary sources                                                      |
| --- | -------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| S18 | Hiram Edson in the cornfield (Oct 23, 1844)                    | Heb 8:1-2; 9:11-12      | GSAM ch 7; Edson's manuscript (in GSAM appendix); GC ch 23           |
| S19 | Crosier's sanctuary article (Feb 7, 1846)                      | Heb 9:23-24; Lev 16     | SANC (full text); EGW endorsement in EW 86; BP3                      |
| S20 | EGW's first vision (Dec 1844): the throne, the Father, the Son | Rev 7:13-17; Rev 14:1-5 | EW 14-20; 1SG ch 7; WLF (Bates's introduction confirming the vision) |
| S21 | Joseph Bates and the Sabbath (1846)                            | Ex 20:8-11; Rev 14:9-12 | AJB; LELJB; BP3; HSFD                                                |
| S22 | The three angels assembled (Rev 14:6-12)                       | Rev 14:6-12             | TMR; DAR Rev 14; TTAM; GC ch 25                                      |
| S23 | "Thou must prophesy again" (Rev 10:11)                         | Rev 10:11; Joel 2:28-29 | PGGC; EW 39-45; 1SG ch 8                                             |

**Part 4 deliverables:** Reader watches the chain re-form after the Disappointment — first the sanctuary insight (Edson → Crosier), then the visions (EGW), then the Sabbath (Bates), then the three angels as a coherent set. The doctrinal foundation is laid in these six sessions.

**Chain links forged:** L10 — heavenly Most Holy Place entered Oct 22. L11 — Crosier's systematic sanctuary truth. L12 — gift of prophecy confirmed. L13 — seventh-day Sabbath recovered. L14 — three angels assembled. L15 — spirit-of-prophecy gift permanent.

---

### Part 5 — The remnant identified (1850-1863)

The newly-pillared movement organizes. The remnant's marks emerge. The mark-vs-seal distinction sharpens. State of the dead clarifies. Sanctuary doctrine matures. 1863: the Church of the Remnant takes legal form.

| #   | Title                                           | Anchor text                               | Primary sources                                         |
| --- | ----------------------------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| S24 | The remnant's two marks (Rev 12:17)             | Rev 12:17; 14:12; 19:10                   | DAR Rev 12; PGGC; 1SG ch 18                             |
| S25 | The two beasts of Rev 13                        | Rev 13:1-18                               | DAR Rev 13; THB; TBUS; GC ch 25                         |
| S26 | Mark vs seal (Rev 7 / 13 / 14)                  | Rev 7:1-4; 13:16-17; 14:9-11              | DAR Rev 7, 13, 14; TMR; BP3; HSFD ch 27                 |
| S27 | The state of the dead                           | Ecc 9:5-6; John 11:11-14; 1 Thess 4:13-18 | Story-Hudson tracts (in ARSH 1850); GC ch 33; 1SG ch 22 |
| S28 | The 1844 sanctuary doctrine fully formed        | Dan 8:14; Heb 9; Lev 16                   | TTHDS; STTHD; S23D; SOTB; GC ch 23-24                   |
| S29 | Organization (1863) — the Church of the Remnant | Rev 12:17; Eph 4:11-13                    | GSAM ch 26-27; LS80 ch 33                               |

**Part 5 deliverables:** Reader sees the pillars — sanctuary, Sabbath, state of the dead, spirit of prophecy, three angels — locked into doctrinal form; understands why organization (1863) was a present-truth move, not a worldly compromise.

**Chain links forged:** L16 — remnant's two marks. L17 — Rev 13's two beasts identified. L18 — mark/seal contrast clarified. L19 — conditional immortality recovered. L20 — sanctuary doctrine doctrinally complete. L21 — remnant church organized.

---

### Part 6 — The foundation completed (1863-1888)

The Civil War sharpens the national-Sunday-law warning. Health reform enters the message (1863). Dan 11:40-45 debates resurface the Eastern Question. **Laodicea's warning is sounded** (still future-tense — see [[D11]]). Then Minneapolis 1888.

| #   | Title                                                               | Anchor text             | Primary sources                                                                                                           |
| --- | ------------------------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| S30 | Civil War / national-Sunday-law threats (Rev 13:11-17)              | Rev 13:11-17            | THB; TBUS; ARSH 1862-1865; 1T-2T                                                                                          |
| S31 | Health reform as part of the message (1863)                         | 1 Cor 6:19-20; 3 John 2 | CD intro; 1T ch 28-32; 2T health testimonies                                                                              |
| S32 | Dan 11:40-45 debates; the Eastern Question revisited                | Dan 11:40-45            | DAR Dan 11; PSC; 1888-era ARSH debates                                                                                    |
| S33 | Laodicea's coming threat (Rev 3:14-22) — **warning, not diagnosis** | Rev 3:14-22             | DAR Rev 3; 1T-4T Laodicean message testimonies (pre-1888); GC ch 21                                                       |
| S34 | Minneapolis 1888 — Jones & Waggoner / righteousness by faith        | Rom 1:16-17; Hab 2:4    | EGW 1888 materials (5LtMs); Waggoner's _Christ and His Righteousness_ (deferred — post-1888 publication); GC ch 25 ending |
| S35 | The message rejected; the loud cry delayed                          | Rev 18:1-4              | EGW MS9, 1888; 5LtMs-7LtMs sermons + letters; GC ch 26 ending                                                             |
| S36 | "Surely I come quickly" — the foundation we stand on                | Rev 22:6-21             | DAR Rev 22; GC final chapters                                                                                             |

**Spine total:** 37 sessions (S01-S36 + S36 as benediction; per [[D21]]).

**Part 6 deliverables:** Reader understands why 1888 is the closing landmark — it is where the foundation was completed, the gospel root was named, and (largely) rejected. The Philadelphia → Laodicea transition is presented as the **prophetic warning Christ had sounded** through the entire period — not as a post-hoc diagnosis the series itself imposes.

**Chain links forged:** L22 — national Sunday-law warning explicit. L23 — health reform part of message. L24 — Laodicean warning sounded. L25 — righteousness by faith proclaimed (1888). L26 — message rejected, loud cry delayed.

---

## The bonus track — pioneer expositions of the future chapters

Revelation chapters that don't naturally land in the 1816-1888 historical narrative get their own track. Each told as "what Smith DAR and the pioneers saw in this chapter." Their exposition becomes the teaching.

| #   | Title                                                   | Anchor       | Primary sources                    |
| --- | ------------------------------------------------------- | ------------ | ---------------------------------- |
| B01 | Rev 1: The Christ-vision                                | Rev 1:1-20   | DAR Rev 1; SLWM (Miller on Rev 1)  |
| B02 | Rev 4-5: The throne room and the slain Lamb             | Rev 4-5      | DAR Rev 4-5; EW 38-39              |
| B03 | Rev 6: The seven seals (1755 / 1780 / 1833 anchors)     | Rev 6:1-17   | DAR Rev 6; PREX2; GC ch 17 (signs) |
| B04 | Rev 7: The sealing and the great multitude              | Rev 7:1-17   | DAR Rev 7; TMR; HSFD ch 27         |
| B05 | Rev 8: The first four trumpets (fall of Western Rome)   | Rev 8:1-13   | DAR Rev 8; PREX1; FUMP             |
| B06 | Rev 15-16: The seven last plagues                       | Rev 15-16    | DAR Rev 15-16; GC ch 39-40         |
| B07 | Rev 17-18 fully unmasked (the harlot and her daughters) | Rev 17-18    | DAR Rev 17-18; GC ch 21, 38; TBUS  |
| B08 | Rev 19: The Second Coming                               | Rev 19:11-21 | DAR Rev 19; GC ch 40               |
| B09 | Rev 20: The millennium                                  | Rev 20:1-15  | DAR Rev 20; GC ch 41               |
| B10 | Rev 21-22: All things new                               | Rev 21-22    | DAR Rev 21-22; GC ch 42            |

---

## Session anatomy (the template)

Every spine session follows three movements:

### 1. The moment (2-4 paragraphs of historical narrative)

Put the reader in the scene. Sensory detail. Calendar. Geography. The person's state of mind.

Example opening for S03 (Miller's conversion):

> "On a fall day in 1816, in a farmhouse in Low Hampton, New York, a 34-year-old Baptist deacon — a man who four years earlier had been a Deist captain in the War of 1812 — read aloud a hymn at his congregation's request. Before he reached the third verse, he was undone…"

End the moment with the question or burden that drove the pioneer to the Scripture next.

### 2. The Scripture opened (the body of the session)

Walk the prophetic text the moment unlocks. Verse-by-verse or thread-by-thread. Use:

- KJV blockquotes for Scripture (citation at end)
- Smith DAR as default exegetical reference
- Pioneer voices in blockquotes where the original wording matters
- EGW where she clarifies, confirms, or amplifies the pioneer's reading
- Markers (`[KEY🔑]`, `[⟲]`, `[DYK🔎]`, etc.) inherited from v1

This is the bulk of the session (1000-1800 words).

### 3. The application (1-2 short paragraphs)

Land the truth on the reader's heart. Inherits the `[IMG]` thread — every application connects back to **image restoration in Christ**: this truth restores X in me; I cannot stand without it; God led me to this very link in this very session.

Close with the `[CHAIN]` marker:

> `[CHAIN] — Link N: <one-sentence summary of the link just forged>`

### Word count budget

- Total per session: **1500-2500 words** (15-25 min reading)
- Moment: 150-300 words
- Scripture opened: 1000-1800 words
- Application + `[CHAIN]`: 150-300 words

### Frontmatter

Inherit v1's frontmatter where it makes sense:

```yaml
---
title: <Session title>
session: SXX
part: Part N — <part title>
date_range: <e.g., "1816-1831">
chain_link: LN
anchor: <primary Scripture>
sources: [DAR Rev 9, MWV1, GC ch 18, EW 14]
markers: [KEY, CHAIN, DYK, IMG]
---
```

(Open: whether to include `apple_note_id` and `created_at` like v1 — TBD in [[DECISIONS open Q3/Q4]].)

---

## Markers (canonical for v2)

All v1 markers carry over unchanged. **One new marker** for v2:

| Marker    | Purpose                                                                                                                              | Source |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `[KEY🔑]` | A passage that **defines** a symbol or interpretive principle.                                                                       | v1     |
| `[⟲]`     | **Recapitulation breadcrumb** in a registered cross-text thread.                                                                     | v1     |
| `[CTRF]`  | **Counterfeit / original pair** the Bible itself sets up.                                                                            | v1     |
| `[IMG]`   | The **image-restoration** thread — salvation = restoration of God's image.                                                           | v1     |
| `[DYK🔎]` | Historical or linguistic **aside**.                                                                                                  | v1     |
| `[Q]`     | A **reflection question** worth pausing on.                                                                                          | v1     |
| `[→]`     | A **teaching/application connector**.                                                                                                | v1     |
| `[CHAIN]` | **NEW.** Marks the moment a new link in the present-truth chain is forged. **One per spine session.** Used at the closing connector. | v2     |

`[CHAIN]` is the series' structural backbone, distinct from `[⟲]` (which tracks Bible-text recapitulation across chapters). `[CHAIN]` is meta: it tracks the **pioneers' progressive recovery** of present truth.

---

## Format conventions

- **KJV blockquotes** for Scripture; citation in parentheses at end (e.g., `(Rev 14:6-12)`).
- **Pioneer/EGW quotes** in blockquotes; attribution on the line below:
  ```
  > "Quote text here."
  > — _EGW, Early Writings p. 14_
  ```
- **Dates** spelled out at first occurrence within a session ("October 22, 1844"); shortened after ("Oct 22").
- **Historical figures** full name + birth/death years at first reference in a session ("William Miller (1782-1849)"); surname after.
- **"The pioneers"** — collective shorthand for the early SDA founders (Miller, Himes, Litch, Fitch, Snow, Edson, Crosier, Bates, the Whites, EGW, Andrews, Smith, Loughborough, et al.).
- **"Present truth"** capitalized when used as the proper-noun concept (the Pioneer Chain's organizing reality); lowercase when generic.
- **"The Great Disappointment"** capitalized; never just "the disappointment" (which is reserved for the spring 1844 first disappointment).
- **"The Sabbath"** capitalized when referring to the seventh-day Sabbath; lowercase when generic.
- **Citing DAR** by chapter + page (e.g., "DAR Rev 9, p. 502").
- **Citing EGW** by book abbreviation + paragraph or page (e.g., "EW 14.1", "GC 343.2").

---

## Generation strategy

### Phase 0 — reference shelf [COMPLETE]

42 pioneer + EGW Letters works downloaded. 537 EGW books re-syncing into the new-schema paragraphs table. See `PHASE-0-SOURCES.md`.

### Phase 1 — full spec [THIS DOCUMENT — IN PROGRESS]

`SERIES-OUTLINE-v2.md` (this file) defines the spine, the bonus track, the template, conventions, and source attribution. On approval, archive v1.

### Phase 2 — pilot session

Draft one session as the format-locking exemplar. **Recommended pilot: S04 — Miller's 14 Rules of Interpretation.** Rationale:

- Content-heavy enough to stress-test the template
- Self-contained (no narrative continuity required)
- Establishes the interpretive constitution governing every later session
- Exercises pioneer-quote handling at maximum density (the Rules themselves)

### Phase 3 — pilot review + template lock

Walk the pilot together; confirm:

1. Word count fits the 1500-2500 budget
2. Story / Scripture / Application proportions feel right
3. Pioneer-quote density isn't overwhelming
4. `[CHAIN]` marker placement reads naturally
5. DAR-as-default reference works in practice

Lock the template; refactor pilot if needed.

### Phase 4 — full series draft

Draft remaining sessions in **batches by part**. Each part = one sub-commit. Within a part:

- Smart-model designs the part-opening session
- Apply-tier delegates remaining sessions in the part using the part-opener as worked example
- Gate (typecheck / lint / format) between parts

### Phase 5 — bonus track

Draft the 10-session bonus track after the spine is complete. Bonus sessions are exegetical, not narrative — heavier DAR dependence.

---

## File layout

```
packages/cli/outputs/studies/daniel-revelation/
├── archive/                            # v1 (and v0) preserved
│   ├── v0-series/                      # the original 21-study series (already archived)
│   └── v1-daniel-revelation/           # the 34 chapter + 3 bonus studies (NEW archive layer)
├── CONTEXT.md                          # canonical glossary (no spec)
├── DECISIONS.md                        # grilling Q+A reasoning log
├── PHASE-0-SOURCES.md                  # source inventory + download manifest
├── SERIES-OUTLINE-v2.md                # THIS FILE — canonical spec
├── CHAPTER-OUTLINE-v2.md               # per-session detailed outlines (TBD Phase 2+)
├── pilot/
│   └── s04-millers-14-rules.md         # pilot session
├── part-1-inherited-chain/
│   ├── s01-reformations-open-bible.md
│   ├── s02-sardis-name-to-live.md
│   ├── s03-millers-conversion.md
│   ├── s04-millers-14-rules.md         # (moves from pilot/ on template lock)
│   └── s05-the-2300-day-study.md
├── part-2-midnight-cry-begins/
├── part-3-loud-cry-disappointment/
├── part-4-light-in-the-dark/
├── part-5-remnant-identified/
├── part-6-foundation-completed/
├── bonus/                              # 10-session pioneer expositions of future chapters
└── reference/
    ├── INDEX.md                        # updated for v2
    ├── pioneer-writings/               # per-author markdown extracts from EGW DB
    │   ├── miller/
    │   ├── litch/
    │   ├── fitch/
    │   ├── snow/
    │   ├── bates/
    │   ├── crosier/
    │   ├── james-white/
    │   ├── andrews/
    │   ├── loughborough/
    │   ├── hale/
    │   ├── smith/
    │   └── periodicals/                # DS, ARSH, HST
    ├── egw/                            # existing — kept (still useful for v2)
    ├── egw-remote/                     # existing — kept
    ├── uriah-smith/                    # existing — kept
    └── earths-final-destiny/           # existing — archive (transcripts are v1-specific)
```

---

## Resolved scope decisions

| #   | Question                               | Resolution                                             | DECISIONS ref |
| --- | -------------------------------------- | ------------------------------------------------------ | ------------- |
| 1   | Audience baseline                      | Assume zero prior prophecy study (same as v1)          | D19           |
| 2   | Pilot session                          | **S04 — Miller's 14 Rules**                            | D20           |
| 3   | Session count                          | **37 spine + 10 bonus = 47 total** (S36 = benediction) | D21           |
| 4   | Frontmatter + Apple Notes export       | Inherit v1 format exactly; export to Apple Notes       | D22           |
| 5   | `reference/pioneer-writings/` dir name | Confirmed                                              | Phase 0       |
| 6   | Pilot word-count budget                | 1500-2500 (adjust if pilot reveals otherwise)          | spec default  |

Still open (not blocking pilot):

- **Existing `reference/` tracks.** Plan: keep `egw/`, `egw-remote/`, `uriah-smith/`; move `earths-final-destiny/` to archive. To be confirmed during v1 archival.

---

## Status

- [x] Phase 0 — reference shelf (42 pioneer/EGW Letters works downloaded; bulk EGW re-sync running)
- [ ] Phase 1 — full spec **(this document — awaiting user review)**
- [ ] Phase 2 — pilot session
- [ ] Phase 3 — pilot review + template lock
- [ ] Phase 4 — full spine draft (in 6 part-batches)
- [ ] Phase 5 — bonus track draft

On approval of this spec, the next concrete actions are:

1. Archive v1 files (34 chapters + 3 bonuses) into `archive/v1-daniel-revelation/`
2. Resolve open questions 1-8 above
3. Begin pilot drafting (S04)
