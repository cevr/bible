# Line Upon Line — Daniel & Revelation, Unsealed by Scripture Itself

> "For precept must be upon precept, precept upon precept; line upon line, line upon
> line; here a little, and there a little." — Isaiah 28:10

A v4 series under `daniel-revelation/`, a sibling to v1 (verse-by-verse, archived), v2
(Pioneer Chain, in-progress), and v3 (The Sure Word, in-progress). This series walks the
books of **Daniel (1→12) then Revelation (1→22)** in canonical order, and as each symbol
appears it **stops and lets the Bible define it** — Miller's Rule, Scripture its own
expositor. The series teaches the historicist method by **enacting** it.

For terminology, see the parent [`CONTEXT.md`](../CONTEXT.md). For the reasoning behind
every scoping decision, see [`DECISIONS.md`](./DECISIONS.md).

---

## Master thesis

> **A symbol means what the Bible says it means — no more, no less. Walk the prophecy,
> and at every symbol let Scripture be its own dictionary. When you do, Daniel and
> Revelation unseal themselves, line upon line.**

This is the literal-historicist method made visible. There is no private meaning, no
mystical layer, no reliance on the original languages beyond auxiliary confirmation. A
beast is what Scripture says a beast is (Dan 7:23). Waters are what Scripture says waters
are (Rev 17:15). A day is what the year-day texts say a day is (Num 14:34; Eze 4:6). The
reader watches the books interpret themselves and comes away owning the method, not just
the conclusions.

---

## How this differs from v1, v2, v3

| Dimension | v1 (archived)          | v2 Pioneer Chain      | v3 The Sure Word                 | **v4 Line Upon Line**                                |
| --------- | ---------------------- | --------------------- | -------------------------------- | ---------------------------------------------------- |
| Spine     | Canonical, every verse | Historical 1816–1888  | Canonical, weighted to contested | Canonical book-walk, one vision per session          |
| Purpose   | Verse exposition       | Pioneer story         | Correct unnamed spiritualization | Teach the method by enacting it                      |
| Audience  | Anyone                 | Anyone                | Advanced/drifted SDA readers     | Newcomers — method from scratch                      |
| Polemic   | None                   | None                  | Implicit                         | None — positive, no opponent                         |
| Mechanism | —                      | `[CHAIN]` pioneer     | `[CONTEST]`/`[RULE N]`           | `[⟲]` weave + every symbol Bible-defined             |
| Format    | Verse prose            | Story/Scripture/App   | Whiteboard                       | Whiteboard outline                                   |
| Guides    | Bible+EGW+chiastic     | Bible+EGW+DAR+pioneer | Bible+Rules+DAR+SOP              | Bible + Haskell + DAR + EGW (+ Miller for 6000/2520) |

---

## Method (the seven rules of the road)

1. **Walk the text in order.** Daniel 1→12, then Revelation 1→22. The spine is the books
   themselves (book-rails — DECISIONS D3).

2. **Decode every symbol by Scripture.** When a symbol appears, define it from the Bible —
   ideally the same book, then the wider canon (Miller's Rule V; the skill's
   literal-historicist stance). Mark the defining passage `[KEY🔑]`.

3. **Weave, don't reorder (`[⟲]`).** To enrich a symbol, reach across to its parallel in
   the other book and back to earlier visions — Dan 7's little horn pulls Rev 13; the
   sanctuary pulls Rev 10 + Rev 14. The cross-reference is a within-session move, never a
   spine reorder. Recapitulation does the progressive disclosure for us.

4. **One vision per session** (DECISIONS D5). Seams follow the text's own visions, not
   chapter numbers. Split only when a vision is too dense for one sitting (Dan 8, Dan
   10-12).

5. **Greek/Hebrew is auxiliary, never foundational.** Use Strong's only to confirm what
   the English already yields. No point hinges on a lexicon (the skill's anti-pattern).

6. **The standing source corpus — Haskell + DAR + EGW for every study; Miller for the
   prophecies DAR dropped.** Scripture always leads; the guides confirm, never carrying
   weight Scripture has not already established. The fixed authority stack for **every**
   session in this series:

   | Tier                 | Source                                          | Role                                                        |
   | -------------------- | ----------------------------------------------- | ----------------------------------------------------------- |
   | **Authority**        | KJV Scripture                                   | The only doctrinal authority; defines every symbol.         |
   | **Expositional**     | **Haskell** (SDP / SSP) **+ DAR** (Uriah Smith) | The two pioneer guides — quote **both** where sharp.        |
   | **Confirming**       | **EGW** (GC, EW, DA, PK, SOP letters, etc.)     | Prophetic confirming witness, in harmony with Scripture.    |
   | **Miller (special)** | **William Miller** (MWV1-3, WMAD, MWM, MRSH)    | The authority for **6000, 2520**, and any link DAR dropped. |
   - **Haskell, DAR, and EGW are used in all studies** — not DAR alone. Each session should
     draw on the expositional pair (Haskell + DAR) and bring EGW as confirming witness where
     she clarifies or amplifies.
   - **William Miller is the named authority for the 6000-year chronology and the 2520**
     ("seven times," Lev 26 / Dan 4). DAR set the 2520 aside and underweights the 6000-year
     "great week," so for those links **DAR is the dissent, not the witness** — the receipts
     come from Miller's own works (e.g. MWV2 261.1 for the 2520) and the 1843 Fitch-Hale
     chart (see DECISIONS D6, D8). Miller may also be cited anywhere his framing of the
     method itself is uniquely clear.
   - Greek/Hebrew remains auxiliary (rule 5); no guide quote ever overrides the plain text.
   - **All receipts live in the parent corpus** `~/.bible/egw-paragraphs.db` (Haskell SDP=681,
     SSP=1,448; DAR=3,555 paras; EGW = 500+ books; Miller corpus per parent PHASE-0-SOURCES).

7. **PROCESS GATE — source before drafting.** No session begins until the standing corpus
   for that session is pulled from the local DB: the relevant **Haskell (SDP/SSP) + DAR**
   chapters read in full, **EGW** searched for the session's symbols, and — for any 6000 /
   2520 / DAR-dropped link — **Miller** pulled for the receipt. Verify availability by
   querying the DB directly, NOT `bible egw catalog` (which needs API creds and returns an
   auth error that mimics an empty result — the false-negative that hid Haskell earlier).

---

## The time prophecies (decoded in place, per DECISIONS D8)

The six the series must cover — **2300, 2520, 1260, 1290, 1335, 6000** — are NOT a
separate block. Each is decoded where its text raises it, then tied to the others via
`[⟲]`:

| Prophecy  | Decoded at               | Role                                                    | Guide authority           |
| --------- | ------------------------ | ------------------------------------------------------- | ------------------------- |
| 1260      | Dan 7:25                 | 538→1798 papal supremacy (`[⟲]` Rev 12/13)              | Haskell + DAR + EGW       |
| 2300      | Dan 8:14                 | 457 BC → 1844; the master (dated by Dan 9)              | Haskell + DAR + EGW       |
| 70 weeks  | Dan 9:24-27              | the 457 BC anchor that dates the 2300                   | Haskell + DAR + EGW       |
| 1290/1335 | Dan 12:11-12             | 1798 / 1843-44; **the tarrying** (D7)                   | Haskell + DAR + EGW       |
| 2520      | Dan 4 "seven times"      | 7×360 → 1844; widest bracket — **taught straight** (D6) | **Miller** (DAR dissents) |
| 6000      | where great-week in view | the outer chronological frame                           | **Miller** + EGW          |

- **6000 & 2520 → William Miller is the authority** (rule 6). DAR dropped the 2520 and
  underweights the 6000-year "great week," so for these two links DAR is the dissent.
  Receipts come from Miller's own works (2520: MWV2 261.1; 6000: MWM + Miller's chronology)
  and the 1843 Fitch-Hale chart; EGW confirms the 6000-year frame (e.g. AH 539.3). The
  2520 is taught straight as a valid link Miller forged (DECISIONS D6, D8).
- **1260 / 2300 / 70 weeks / 1290 / 1335 → the standing corpus** (Haskell + DAR + EGW),
  since these are the uncontested historicist pillars all three guides hold together.
- **The tarrying (D7):** the Great Disappointment was prophesied (Hab 2:3; Dan 12:12; Matt
  25:5). History confirms doctrine because doctrine predicted the history.

---

## The sanctuary cluster (Dan 8 hinge, per DECISIONS D9)

The sanctuary type (Lev 16) is **held until Dan 8:14 forces the question** "which
sanctuary, what cleansing?" — then type, question, and heavenly antitype (Heb 8-9 → 1844)
cluster as one dense session. The type is a resolution link, not a foundation link;
teaching it before its question would cut against progressive disclosure.

---

## Daniel walk — working session list (confirm at outline)

```
D01 Dan 1      The test at Babylon's table (intro; faithfulness)
D02 Dan 2      The great image — 4 metals = 4 kingdoms [KEY🔑]; the stone   ← PILOT
D03 Dan 3      The fiery furnace — image of gold; worship-or-death [CTRF]
D04 Dan 4      Nebuchadnezzar's tree; "seven times" (the 2520 first appears)
D05 Dan 5      The handwriting — Babylon falls (the metals proven in history)
D06 Dan 6      The lions' den — the law of the Medes (→ final law crisis)
D07 Dan 7      Four beasts + the judgment; little horn; +1260  [⟲ Rev 13, Rev 12]
D08 Dan 8      Ram, goat, little horn; the 2300 raised; Gabriel interrupted
D09 Dan 8:14+  THE SANCTUARY — Lev 16 + Heb 8-9 + year-day applied  [⟲ Rev 10, Rev 14]
D10 Dan 9      The 70 weeks — 457 BC anchor; Messiah; completes the 2300 [KEY🔑]
D11 Dan 10     The unseen war — Michael the prince
D12 Dan 11     The kings of north & south (Dan 11:40-45 debate noted)
D13 Dan 12     Michael stands; 1290/1335; the tarrying  [⟲ Rev 12; 2520 widest bracket]
```

(Revelation walk — Rev 1→22, one vision per session — below. The reader re-meets every
Daniel symbol in Revelation, now equipped.)

---

## Revelation walk — working session list (confirm at outline)

Per the spine rules and DAR's canonical vision-seams. One vision per session, not one
chapter: sparse/paired visions fold together (Rev 2-3 churches, Rev 4-5 throne/sanctuary,
Rev 15-16 plagues, Rev 17-18 Babylon, Rev 21-22 New Jerusalem); dense visions split (Rev
8-9 trumpets, Rev 13 stands alone as the beast). The reader has already walked Daniel, so
every Revelation session is a **re-meeting**: the symbol arrives already equipped with its
Daniel key, and the `[⟲]` weave makes the recapitulation explicit. Both guides named per
session — Uriah Smith's DAR chapter and Haskell's SSP (his Revelation walk), per rule 6
(Haskell required, not just DAR).

```
R01 Rev 1       The opening vision — Son of man among the candlesticks
                  KEY🔑 candlesticks = churches (Rev 1:20); stars = angels/messengers (Rev 1:20)
                  KEY🔑 "Alpha and Omega... which is, and which was, and which is to come" (Rev 1:8)
                  [⟲ Dan 7:9-13 — the Ancient of days + "one like the Son of man" is the SAME figure now seen]
                  [⟲ Dan 10:5-6 — Daniel's man clothed in linen == the glorified Christ of Rev 1:13-15]
                  Guides: DAR ch (p.323) · Haskell SSP (Rev 1)

R02 Rev 2-3     The seven churches — the church-age sweep (Ephesus → Laodicea)
                  KEY🔑 the candlesticks ARE the seven churches (Rev 1:11,20) — the in-text key
                  [→] the seven churches = seven successive historic periods of the gospel church
                     (the DAR/Haskell historicist overlay, not the verse's own words; attach the
                     establishing guide quote when drafted)
                  [⟲ Dan 7:25 — the 1260 falls inside Thyatira/Sardis; the church lives THROUGH the
                     little-horn supremacy the reader already dated 538→1798]
                  [→] historicist church-age frame; sets the timeline the seals/trumpets run on
                  Guides: DAR ch (p.345, p.363) · Haskell SSP (Rev 2-3)

R03 Rev 4-5     The heavenly sanctuary & the throne — the Lamb takes the book
                  KEY🔑 the sea of glass, throne, lamps of fire = the heavenly temple/sanctuary (Rev 4)
                  KEY🔑 the Lamb "as it had been slain" = Christ (Rev 5:6,9; cf. John 1:29)
                  KEY🔑 the seven-sealed book; only the Lamb is worthy to open it (Rev 5:5-9)
                  [⟲ Dan 8:14 — SANCTUARY payoff: the heavenly sanctuary Daniel pointed to is now SHOWN]
                  [⟲ Dan 7:9-10 — thrones set, the books opened == Rev 5 sealed book + Rev 4 throne]
                  ★ SANCTUARY thread (D9) re-meets its antitype here
                  Guides: DAR ch (p.384, p.391) · Haskell SSP (Rev 4-5)

R04 Rev 6 (+7)  The seven seals — the white-to-pale-horse sweep; the sealing held to R05
                  [→] the four horses = successive states of the church/empire (the DAR/Haskell reading;
                     Rev 6 narrates the horses but does not itself decode them — attach the guide quote
                     when drafted, not a bare Scripture key)
                  KEY🔑 "How long?" of the souls under the altar (Rev 6:10) == the judgment cry
                  KEY🔑 the sixth seal — sun black, moon as blood, stars fall (Rev 6:12-13) = literal signs
                  [⟲ Dan 7:9-10 / Dan 8:14 — "how long" + the judgment-day expectation the seals raise]
                  Guides: DAR ch (p.402) · Haskell SSP (Rev 6)

R05 Rev 7       The sealing — the 144,000 and the great multitude
                  KEY🔑 the seal of God = His name/character set in the forehead (Rev 7:3; cf. Rev 14:1)
                  KEY🔑 the four winds = strife/war held back (cf. Dan 7:2 winds strive on the sea)
                  KEY🔑 the great multitude out of great tribulation, robes washed (Rev 7:9,14)
                  [⟲ Dan 7:2 — the four winds striving upon the sea defines Rev 7:1's four winds]
                  [⟲ Dan 12:1 — "thy people shall be delivered" == the sealed delivered]
                  Guides: DAR ch (p.435) · Haskell SSP (Rev 7)

R06 Rev 8-9     The seven trumpets — four trumpets, then the woe-trumpets
                  [→] trumpets = judgments on the empire (the DAR/Haskell reading off Rev 8-9; no verse
                     defines the trumpets in-text — attach the guide quote when drafted, not a [KEY🔑])
                  KEY🔑 the star fallen, the bottomless pit, the locusts (Rev 9:1-11) — defined in-text
                  [→] may split: Rev 8 (four trumpets) | Rev 9 (fifth & sixth — the two woes)
                  [⟲ Dan 7 / Dan 8 — the same empire-sweep (Rome divided, then eastern powers) the
                     metals and beasts already taught]
                  Guides: DAR ch (p.452, p.469) · Haskell SSP (Rev 8-9)

R07 Rev 10      The little book open — the proclamation of the Advent; the bittersweet
                  KEY🔑 the little book OPEN in the angel's hand (Rev 10:2) == Daniel UNSEALED
                  KEY🔑 "sweet in the mouth... bitter in the belly" (Rev 10:9-10) = the tarrying
                  [→] "there should be time no longer" (Rev 10:6) — DAR/Haskell read this as the close of
                     the prophetic-time periods (the standard Millerite gloss, sourced to the guides, not
                     asserted as the verse's plain sense); attach the establishing guide quote when drafted
                  [⟲ Dan 8:14 / Dan 8:26-27 — the "shut up the vision" Daniel was told to seal is the
                     little book NOW opened; the 2300/1844 SANCTUARY payoff that the "time no longer"
                     gloss leans on]
                  [⟲ Dan 12:4,9 — "seal the book... till the time of the end" == Rev 10's open book]
                  [⟲ Hab 2:3; Matt 25:5 — the bitterness = the prophesied TARRYING (D7)]
                  ★ TIME-PROPHECY payoff: the 2300/1844 movement; the Great Disappointment as foretold
                  Guides: DAR ch (p.488) · Haskell SSP (Rev 10)

R08 Rev 11      The two witnesses — the testimony of the Word through the 1260
                  KEY🔑 the two witnesses = the Word of God, Old & New Testament (Rev 11:3-4; cf. olive
                     trees/candlesticks, Zech 4)
                  KEY🔑 1260 days they prophesy in sackcloth (Rev 11:3) == the SAME 1260 already dated
                  KEY🔑 the temple of God opened, the ark seen (Rev 11:19) = the Most Holy Place
                  [⟲ Dan 7:25 / Dan 12:7 — the 1260/time-times-half is re-met here as Rev 11:3]
                  [⟲ Dan 8:14 — Rev 11:19 ark/temple opened == entry into the Most Holy; SANCTUARY payoff]
                  ★ TIME-PROPHECY (1260) + SANCTUARY both re-meet here
                  Guides: DAR ch (p.497) · Haskell SSP (Rev 11)

R09 Rev 12      The woman, the dragon, the wilderness — the great controversy opens
                  KEY🔑 the woman = the (pure) church (Rev 12; cf. Jer 6:2; 2 Cor 11:2)
                  KEY🔑 the dragon = "that old serpent, the Devil, and Satan" (Rev 12:9) — defined in-text
                  KEY🔑 the 1260 days / "time, times, and half a time" in the wilderness (Rev 12:6,14)
                  KEY🔑 the remnant who "keep the commandments... and have the testimony" (Rev 12:17)
                  [⟲ Dan 7:25 / Dan 12:7 — the wilderness 1260 == the little-horn 1260 the reader dated]
                  [⟲ Dan 8 — the dragon's persecuting work behind the empires]
                  ★ TIME-PROPHECY (1260) re-met for the third time; now anchored to the woman
                  Guides: DAR ch (p.509) · Haskell SSP (Rev 12)

R10 Rev 13      The beast from the sea & the beast from the earth — the merged Daniel beasts
                  KEY🔑 the sea-beast = leopard + bear + lion COMBINED (Rev 13:2) == Dan 7's four beasts merged
                  KEY🔑 sea/waters = "peoples, multitudes, nations, tongues" (Rev 17:15) — defines the sea-beast's origin
                  KEY🔑 42 months of authority (Rev 13:5) == the SAME 1260 (42 × 30 = 1260 prophetic days
                     = 1260 years by the year-day principle; 538 + 1260 = 1798)
                  KEY🔑 the two-horned earth-beast; the image and mark (Rev 13:11-17) [CTRF the seal of God, R05]
                  [⟲ Dan 7:3-7 — the four beasts (lion, bear, leopard, dreadful) are the body parts of Rev 13:2]
                  [⟲ Dan 7:8,25 — the little horn's mouth/blasphemy/1260 == the beast's mouth + 42 months]
                  [⟲ Rev 17:15 — the waters key (the series' anchor used back at Dan 7's "great sea")]
                  ★ The Daniel-7 / Revelation-13 weave — the spine's central re-meeting
                  Guides: DAR ch (p.520) · Haskell SSP (Rev 13)

R11 Rev 14      The Lamb on Zion & the three angels' messages — the harvest
                  KEY🔑 the 144,000 with the Father's name in their foreheads (Rev 14:1) [CTRF the mark, R10]
                  KEY🔑 first angel: "the hour of his judgment is come" (Rev 14:7) == the judgment opened
                  KEY🔑 "Babylon is fallen" (Rev 14:8); the mark/wrath warning (Rev 14:9-11)
                  KEY🔑 "the patience of the saints... keep the commandments of God" (Rev 14:12)
                  KEY🔑 the harvest & vintage = the two reapings at the end (Rev 14:14-20)
                  [⟲ Dan 7:9-10 / Dan 8:14 — "the hour of his judgment" == the pre-advent judgment Daniel dated to 1844]
                  [⟲ Dan 8:14 — the cleansing of the sanctuary IS the judgment the first angel announces]
                  ★ THREE-ANGELS payoff — the climax Daniel's 2300/sanctuary set up; the present-truth message
                  Guides: DAR ch (p.582) · Haskell SSP (Rev 14)

R12 Rev 15-16   The seven last plagues — wrath without mercy poured out
                  KEY🔑 the seven last plagues "filled up the wrath of God" (Rev 15:1) = post-probation judgments
                  KEY🔑 the temple filled with smoke, none can enter (Rev 15:8) = probation closed in the sanctuary
                  KEY🔑 Armageddon, the kings gathered (Rev 16:16); rivers/Euphrates dried (Rev 16:12)
                  [⟲ Dan 12:1 — "a time of trouble such as never was" == the plague-time after Michael stands]
                  [⟲ Dan 8:14 — the sanctuary closed (Rev 15:8) == the END of the cleansing/judgment ministry]
                  ★ SANCTUARY payoff — the close of probation answers Dan 8:14's cleansing
                  Guides: DAR ch (p.638, p.641) · Haskell SSP (Rev 15-16)

R13 Rev 17-18   Babylon the mother & her daughters — the fall of the great harlot
                  KEY🔑 the waters the harlot sits on = "peoples, and multitudes, and nations, and tongues" (Rev 17:15)
                  KEY🔑 the woman = "that great city" (Rev 17:18); Babylon (Rev 17:5) [CTRF the pure woman, R09]
                  KEY🔑 the scarlet beast carrying her (Rev 17:3) == the persecuting power re-met
                  KEY🔑 "Come out of her, my people" (Rev 18:4) = the final call before the plagues
                  [⟲ Rev 17:15 — the waters key the whole series leaned on (used at Dan 7's "great sea")]
                  [⟲ Dan 7:8,20-21 — the blasphemous, saint-warring power == the beast that carries Babylon]
                  ★ The waters-key (Rev 17:15) is now SHOWN as the very verse the reader has used all along
                  Guides: DAR ch (p.657, p.663) · Haskell SSP (Rev 17-18)

R14 Rev 19      The triumph of the saints — the marriage of the Lamb & the rider on the white horse
                  KEY🔑 the marriage supper of the Lamb; the bride made ready (Rev 19:7-9)
                  KEY🔑 "KING OF KINGS, AND LORD OF LORDS" on the rider (Rev 19:16) = Christ returning
                  KEY🔑 the beast and false prophet cast into the lake of fire (Rev 19:20)
                  [⟲ Dan 2:44-45 — the stone that smites the image == the rider who consumes the kingdoms]
                  [⟲ Dan 7:11,26 — the beast's body destroyed, dominion taken away == Rev 19:20]
                  ★ The Dan 2 STONE and Dan 7 JUDGMENT verdict are executed here
                  Guides: DAR ch (p.680) · Haskell SSP (Rev 19)

R15 Rev 20      The millennium — the first & second resurrections, the final judgment
                  KEY🔑 the first resurrection (Rev 20:5-6); the rest of the dead live not till the 1000 years end
                  KEY🔑 Satan bound 1000 years (Rev 20:2-3) = the desolate earth, no subjects to deceive
                  KEY🔑 the books opened, the dead judged out of the books (Rev 20:12)
                  [⟲ Dan 7:9-10,22,26-27 — "the judgment was set, the books were opened" == Rev 20:12; the
                     saints possess the kingdom]
                  [⟲ Dan 12:2 — "many that sleep... shall awake, some to everlasting life, some to shame" ==
                     the two resurrections]
                  ★ Dan 7 judgment + Dan 12:2 resurrection re-met as the millennial assize
                  Guides: DAR ch (p.687) · Haskell SSP (Rev 20)

R16 Rev 21-22   The New Jerusalem — the tree & river of life; the kingdom that has no end
                  KEY🔑 the holy city, new Jerusalem, the tabernacle of God with men (Rev 21:2-3)
                  KEY🔑 "no more death... no more curse" (Rev 21:4; 22:3) = Eden restored
                  KEY🔑 the tree of life, the river of life (Rev 22:1-2; cf. Gen 2:9-10) = the reversal of the fall
                  [⟲ Dan 2:44 — "a kingdom which shall never be destroyed... shall stand for ever" == the
                     eternal city; the STONE became the mountain that fills the earth]
                  [⟲ Dan 7:27 — "the kingdom... given to the saints... an everlasting kingdom" == the New Jerusalem]
                  ★ The Dan 2 stone-kingdom and Dan 7 everlasting kingdom arrive — the chain's final link
                  Guides: DAR ch (p.702, p.716) · Haskell SSP (Rev 21-22)
```

**Macro-recapitulation.** Revelation does for the gospel age what Daniel did for the
empires: it sweeps the same ground repeatedly, each pass disclosing more. The walk follows
the canon's own four-part recapitulation — **churches (R02) → seals (R04-05) → trumpets
(R06)**, each a parallel sweep of the Christian era; then the heart of the book, the
**great-controversy block (R09-R11: Rev 12-14)** — woman/dragon, the merged beast, and the
three angels — which is the doctrinal climax; then the **plagues (R12) → Babylon's fall
(R13) → the endgame (R14-R16: Advent, millennium, New Jerusalem).** Because each cycle
re-covers the timeline, the reader who walked Daniel meets every cycle already holding the
key — recapitulation doing the progressive disclosure, no spine reorder needed.

**Where the Daniel weaves land.** The four Daniel set-ups all pay off in fixed homes:

- **The 1260 (Dan 7:25 / Dan 12:7)** is re-met three times — R08 (Rev 11:3, the witnesses),
  R09 (Rev 12:6,14, the wilderness woman), R10 (Rev 13:5, the 42 months) — the same period,
  three angles.
- **The sanctuary / 2300 (Dan 8:14)** is the spine of R03 (the throne-room sanctuary shown),
  R07 (the little book opened, the 1844 movement, the tarrying), R08 (Rev 11:19 ark/Most
  Holy opened), R11 (the judgment-hour message), and R12 (the temple closed, probation ends).
- **The three angels (Rev 14:6-12, R11)** is where Daniel's 2300/1844 judgment becomes the
  present-truth proclamation — the climax of the whole Daniel-and-Revelation arc.
- **The beast (Dan 7 → Rev 13, R10)** is the spine's central re-meeting: Daniel's four beasts
  are literally the body of Rev 13:2, decoded with the Rev 17:15 waters-key.
- **The kingdom (Dan 2:44 / Dan 7:27)** closes the chain — the stone that smote the image
  and the everlasting kingdom given to the saints arrive as the rider on the white horse
  (R14), the millennial judgment (R15), and the New Jerusalem (R16).

> **Drafting note (per the verifier):** several R-session `[KEY🔑]` items above mark
> _guide-sourced historicist readings_ (R02 seven periods, R04 four horses, R06 trumpets,
> R07 "time no longer") rather than in-text Scripture definitions. When each session is
> DRAFTED, either attach the establishing DAR/Haskell quote or demote those to `[→]`;
> reserve `[KEY🔑]` for where the verse itself defines the symbol (Rev 1:20, 12:9, 17:15,
> 17:18). And every drafted R-session must carry ≥1 verbatim Haskell SSP quote + ≥1 DAR
> quote (with page) + EGW confirming witness — the outline only NAMES the guides.

---

## Markers

Inherited from parent `CONTEXT.md`, plus the repurposed link marker:

| Marker    | Use                                                                        |
| --------- | -------------------------------------------------------------------------- |
| `[KEY🔑]` | The passage that DEFINES a symbol by Scripture (the dictionary entry)      |
| `[⟲]`     | The cross-reference weave — reach to the other book / an earlier vision    |
| `[CTRF]`  | A counterfeit / original pair the Bible itself sets up                     |
| `[CHAIN]` | **Repurposed (D10):** marks each link = a symbol the Bible has now defined |
| `[DYK🔎]` | Historical / linguistic aside (auxiliary, never load-bearing)              |
| `[Q]`     | A reflection question worth pausing on                                     |
| `[→]`     | A teaching / application connector                                         |

(`[CHAIN]` rename to `[LINK]` under consideration — DECISIONS open Q4.)

---

## Output location & format

```
daniel-revelation/v4-line-upon-line/
  SERIES-SPEC.md          ← this file
  DECISIONS.md            ← grilling log
  pilot/
    d02-daniel-2-the-great-image.md   ← format-locking exemplar
  (sessions move to part dirs / a flat sessions/ dir on template lock — TBD)
  reference/              ← shares parent daniel-revelation/reference corpus
```

Format: **whiteboard outline** per parent `studies.md` — glanceable bullets, inline KJV
verse quotes, telegraphic. Frontmatter shape TBD at pilot review.

---

## Status

- [x] Grill complete (D0-D12) — spine, frame, unit, weave, time-prophecies, sanctuary,
      title, location, pilot+format, source policy all settled.
- [x] **Pilot — D02 Dan 2** (drafted; sourced from DAR + Haskell; `pilot/d02-…`)
- [x] **Pilot — D07 Dan 7** (drafted + adversarially verified `fix-then-pass`; DAR + Haskell +
      EGW confirming layer; the heavy-`[⟲]`-weave stress-test; `pilot/d07-…`)
- [x] **Revelation walk outline** (R01-R16; verified; appended above)
- [ ] Pilot review + template lock (two pilots now on the page — D02 + D07)
- [ ] Daniel walk D01, D03-D06, D08-D13 (apply-tier from the two pilots)
- [ ] Revelation walk draft (R01-R16, from the outline; each needs Haskell+DAR+EGW per rule 6)
