export const meta = {
  name: 'understanding-prophecy-handbook',
  description:
    'Compile the full historicist prophecy chain as a Haskell-style Bible Handbook: one agent per study (~31), then a compilation agent',
  phases: [
    {
      title: 'Write Studies',
      detail:
        'one agent per study, each writing sections/NN-slug.md with as many verses as the historicist tradition supports',
    },
    {
      title: 'Compile',
      detail:
        'stitch all studies into the master handbook with parts, frontmatter, intro, abbreviations, and contents',
    },
  ],
};

// ===========================================================================
// Shared contracts — every writer agent receives these verbatim.
// ===========================================================================

const DIR = 'packages/cli/outputs/studies/understanding-prophecy';
const SECTIONS_DIR = `${DIR}/sections`;

const SOURCE_CONTRACT = `
## How to pull source material (DO NOT paraphrase from memory)

You are at the repo root: /Users/cvr/Developer/personal/bible-tools

**Pull KJV verse text** (supports single verses and ranges; comma-lists fall into search mode so AVOID commas — use ranges or separate calls):
\`\`\`
bun run packages/cli/src/main.ts verse "Revelation 13:1-10" --json
\`\`\`
Parse \`.verses[]\` — each has \`book_name\`, \`chapter\`, \`verse\`, \`text\` (authoritative KJV — quote exactly). One-liner:
\`\`\`
bun run packages/cli/src/main.ts verse "Daniel 7:25" --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f\\"{v['book_name']} {v['chapter']}:{v['verse']} | {v['text']}\\") for v in d.get('verses',[])]"
\`\`\`

**Pull pioneer / EGW source paragraphs.** Backbone = Uriah Smith DAR. Also: William Miller MWV1-3, Josiah Litch PREX1-2, Joseph Bates BP2/BP3 + AJB, A.T. Jones GEP/TTR/ECE, E.J. Waggoner EVCO/GTI/WOR, Samuel Snow TRMC (The True Midnight Cry, 1844 — the seventh-month movement), Smith STTHD/TTHDS (the 2300 days & sanctuary), Apollos Hale TSAM, Charles Fitch LJL; E.G. White GC/EW/CET.
\`\`\`
bun run packages/cli/src/main.ts egw lookup "DAR 345" --json           # read a page of paragraphs
bun run packages/cli/src/main.ts egw search "midnight cry tarrying" --book GC --limit 3   # FTS to LOCATE a refcode
\`\`\`
Use \`egw search\` to LOCATE the passage (try several phrasings — FTS is near-exact), then \`egw lookup\` to read it. **Verify every page citation you write actually contains what you claim before citing it.** Do not invent refcodes.

DAR chapter map (refcode → topic):
- DAR 32 Dan2 Great Image · DAR 113 Dan7 Four Beasts · DAR 145 Dan8 Ram/He-Goat/Little Horn (incl. "the daily" 154-157) · DAR 183 Dan9 Seventy Weeks (70 weeks cut off from 2300, ~DAR 192) · DAR 213 Dan10 · DAR 222 Dan11 · DAR 293 Dan12 Closing Scenes (1290/1335 ~DAR 314-316)
- DAR 323 Rev1 Opening Vision · DAR 345+363 Rev2-3 Seven Churches · DAR 384 Rev4 · DAR 402 Rev6 Seven Seals · DAR 435 Rev7 Sealing (144,000)
- DAR 452+469 Rev8-9 Seven Trumpets (Ottoman/1840 in the sixth trumpet) · DAR 488 Rev10 Advent Proclamation (little book) · DAR 497 Rev11 Two Witnesses · DAR 509 Rev12 Gospel Church (pure woman)
- DAR 520 Rev13 Persecuting Powers (beast 520-532; two-horned beast/USA 537-582) · DAR 582 Rev14 Three Messages (mark of beast, 144,000) · DAR 638+641 Rev15-16 Seven Last Plagues · DAR 657 Rev17 Babylon Mother · DAR 663 Rev18 Babylon Daughters · DAR 680 Rev19 · DAR 687 Rev20 resurrections · DAR 702 Rev21 New Jerusalem
`;

const FORMAT_CONTRACT = `
## Output format — Stephen N. Haskell "Bible Handbook" style

The point of the Handbook is a LONG, scannable list of suggestive texts. **Use as many verses as the historicist tradition genuinely marshals — do not stop at three.** A rich topic warrants 12-30+ bullets across sub-headings.

Your file:
\`\`\`markdown
# N. <Study Title>

> A 2-4 sentence italic-prose intro stating the historicist position plainly,
> ending with key pioneer page refs in parentheses. (DAR ___; GC ___.)

### <Sub-heading grouping related texts>

- **Book C:V** — exact KJV text or a faithful tight paraphrase, then a short explanation of what it proves. _(Pioneer/EGW citation.)_
- **Book C:V-V** — ... _(citation.)_

### <Another sub-heading>
- ...
\`\`\`

Rules:
- Lead each bullet with the **bolded reference**, em-dash, short explanation (1-2 sentences — Haskell is terse).
- Quote/tightly-paraphrase the ACTUAL KJV text you pulled — never from memory.
- End most bullets with a verified pioneer/EGW page citation in italic parens, e.g. _(DAR 134-144; GC 439.)_
- Group bullets under \`###\` sub-headings. Tables allowed where they fit (e.g. seven churches, kingdom sequence, prophetic time-periods).
- Interpretation is HISTORICIST: day = year (Num. 14:34; Eze. 4:6); symbols explained by Scripture; the method of Miller, Litch, Smith, Bates, Jones, Waggoner, Snow, and E.G. White. Little horn of Dan 7 = Papacy (538-1798); beast of Rev 13 = Papacy; two-horned beast = United States; 70 weeks cut off from the 2300 days; 2300 days end 1844; the tarrying time + true midnight cry (seventh-month movement) → Oct 22, 1844.
- Write ONLY this one section (start with the \`# N.\` heading). No frontmatter / global intro / contents — the compiler adds those.
- Be comprehensive AND accurate. If a verse doesn't say what the tradition claims, find the one that does. No bail-outs, no TODOs.
`;

function writerPrompt(s) {
  return `You are writing ONE study for an exhaustive Seventh-day Adventist prophecy "Bible Handbook" (the full historicist chain) in the style of Stephen N. Haskell.

${SOURCE_CONTRACT}
${FORMAT_CONTRACT}

## YOUR SECTION: ${s.num}. ${s.title}
**Part: ${s.part}**

**Scope / thesis:** ${s.scope}

**Cover at minimum these scripture references** (pull each one's KJV text; add more the tradition uses — be exhaustive, group sensibly):
${s.verses.map((v) => `- ${v}`).join('\n')}

**Pioneer / EGW sources to mine and cite** (search + look up; cite only verified pages):
${s.sources.map((x) => `- ${x}`).join('\n')}

${s.notes ? `**Special notes:** ${s.notes}\n` : ''}
## Deliverable
1. Pull the KJV text for every reference (and additional ones you judge belong).
2. Verify your pioneer citations with \`egw search\`/\`egw lookup\`.
3. Write the section in Haskell format with AS MANY verses as the topic supports.
4. Save with the Write tool to: \`${SECTIONS_DIR}/${s.slug}.md\`
5. Return one line: filename, number of scripture bullets, number of distinct pioneer/EGW citations.

Work autonomously — do not ask questions.`;
}

// ===========================================================================
// The full chain — ~31 studies in 4 parts.
// ===========================================================================

const STUDIES = [
  // ---- PART I — FOUNDATION ----
  {
    num: 1,
    part: 'I — Foundation',
    slug: '01-year-day-principle',
    title: 'The Year-Day Principle',
    scope:
      'The foundation of all prophetic time. In symbolic prophecy a day stands for a year. Everything — the 1260, the 2300, the 70 weeks, the 1290/1335 — hangs on this rule. Prove it from Scripture and show how the pioneers applied it.',
    verses: [
      'Numbers 14:34',
      'Ezekiel 4:6',
      'Genesis 29:27',
      'Daniel 9:24-27',
      'Daniel 7:25',
      'Daniel 8:14',
      'Revelation 12:6',
      'Revelation 12:14',
      'Revelation 13:5',
      'Leviticus 25:8',
    ],
    sources: [
      'DAR 183-212 (Dan 9 — 70 weeks demonstrate day=year)',
      'Miller MWV1 (rules / year-day)',
      'Litch PREX1',
      'GC 324, 334 (the 2300 days as years)',
    ],
    notes:
      "Show the symbol-day = literal-year correspondence is Scripture's own (Num 14:34; Eze 4:6), and that the 70 weeks (490 years) fulfilled to the year VINDICATES the principle. Tie the time-periods (1260, 2300, 70 wks) to it.",
  },
  {
    num: 2,
    part: 'I — Foundation',
    slug: '02-rules-of-interpretation',
    title: "Miller's Rules of Interpretation",
    scope:
      'How to read prophecy. Scripture is its own interpreter; every word has its bearing; symbols are defined by the Bible itself; prophecy is history written beforehand; figures sometimes have literal and figurative meaning. The pioneer hermeneutic that unlocks the whole chain.',
    verses: [
      '2 Peter 1:19-21',
      'Isaiah 28:9-10',
      'Isaiah 34:16',
      '2 Timothy 3:16-17',
      'Amos 3:7',
      'John 16:13',
      'Luke 24:27',
      '1 Corinthians 2:13',
      'Daniel 12:4',
      'Revelation 1:1-3',
    ],
    sources: [
      'Miller MWV1 (the fourteen rules of interpretation)',
      'DAR Preface / Introduction (method)',
      'GC 320-324, 343-344 (how the prophecies are to be studied)',
    ],
    notes:
      'Lay out Miller\'s rules with their proof texts. Emphasize "Scripture is its own expositor" (compare Scripture with Scripture) and "where a symbol is used, the Bible defines it." This is the method study; keep it practical.',
  },

  // ---- PART II — THE FOUR OUTLINES OF DANIEL ----
  {
    num: 3,
    part: 'II — The Outlines of Daniel',
    slug: '03-daniel-2-statue',
    title: 'Daniel 2 — The Great Image: Kingdoms Throughout Time',
    scope:
      "The statue represents the kingdoms of the world throughout time, from Babylon to the end, when God's everlasting kingdom (the stone cut without hands = Christ's kingdom) breaks the image and fills the earth. Cover the metals, God's own interpretation (a metal = a kingdom), the named kingdoms in order, the ten toes = divided Rome (iron+clay = the church-and-state lesson), and the stone.",
    verses: [
      'Daniel 2:28-35',
      'Daniel 2:36-45',
      'Daniel 5:28',
      'Daniel 5:30-31',
      'Daniel 8:20-21',
      'Luke 2:1',
      'Daniel 7:17',
      'Daniel 2:44',
    ],
    sources: [
      'DAR 32-77 (Dan 2 The Great Image, full chapter — metals named, toes, stone)',
      'GC 341-342 (the image and the stone)',
      'Miller MWV1',
      'A.T. Jones GEP (Babylon to Rome)',
    ],
    notes:
      "Name the kingdoms in order with metal + date: Babylon (gold), Medo-Persia (silver), Greece (brass), Imperial Rome (iron), Divisions of Rome (iron+clay/ten toes), and note the toes never reunite (church-state lesson). It is NOT about Nebuchadnezzar's arrogance/false worship (those are Dan 3-4). End on the stone = Christ's kingdom.",
  },
  {
    num: 4,
    part: 'II — The Outlines of Daniel',
    slug: '04-daniel-7-beasts',
    title: 'Daniel 7 — The Four Beasts, the Little Horn, and the Judgment',
    scope:
      'The same history at higher resolution: lion (Babylon), bear (Medo-Persia), leopard (Greece), dreadful beast with ten horns (Rome), and the little horn = the Papacy, which plucks up three horns, speaks against the Most High, wears out the saints, thinks to change times and laws, and reigns 1260 years (538-1798). Then the judgment scene opens (the Ancient of Days, the books, the Son of man coming to the marriage).',
    verses: [
      'Daniel 7:1-8',
      'Daniel 7:9-14',
      'Daniel 7:19-27',
      '2 Thessalonians 2:3-8',
      'Revelation 13:1-7',
      'Daniel 8:9',
    ],
    sources: [
      'DAR 113-144 (Dan 7 Four Beasts; little horn = Papacy; three horns Heruli/Vandals/Ostrogoths; 538-1798)',
      'GC 439, 446, 579 (the 1260 years; the judgment)',
      'Litch PREX2',
    ],
    notes:
      'Give the four beasts with their kingdoms, the ten horns = ten divisions, the little horn = Papacy with all its marks, and the 1260 years 538-1798. Include the judgment scene (7:9-14) — the books, the Ancient of Days, the Son of man brought before Him (the investigative judgment / marriage).',
  },
  {
    num: 5,
    part: 'II — The Outlines of Daniel',
    slug: '05-daniel-8-sanctuary',
    title: 'Daniel 8 — The Ram, the He-Goat, the Little Horn, and the Sanctuary',
    scope:
      'Same history, beginning one kingdom later: ram (Medo-Persia, named by the angel), he-goat (Greece, named) with the notable horn (Alexander), four horns (division of Greece), little horn (Rome — pagan then papal), "the daily" taken away, and the 2300 days ending in the cleansing of the sanctuary (1844). The angel names the powers, fixing the interpretation.',
    verses: ['Daniel 8:1-12', 'Daniel 8:13-14', 'Daniel 8:15-26', 'Daniel 2:39-40', 'Daniel 7:6'],
    sources: [
      "DAR 145-182 (Dan 8 — symbols, the daily 154-157, angel's interpretation, 2300 days)",
      'Smith STTHD / TTHDS (2300 days & sanctuary)',
      'Bates BP3',
      'Miller MWV3 (cleansing of the sanctuary)',
    ],
    notes:
      'Angel\'s own naming (8:20-21). Little horn = Rome (pagan + papal), NOT Antiochus. Introduce "the daily" (the continual/tamid) and the 2300 days → 1844, but leave the FULL 70-weeks dating and the sanctuary doctrine to studies 6 and the Part-IV sanctuary study.',
  },
  {
    num: 6,
    part: 'II — The Outlines of Daniel',
    slug: '06-daniel-9-seventy-weeks',
    title: 'Daniel 9 — The Seventy Weeks Unlock the 2300 Days (The Keystone)',
    scope:
      'THE KEYSTONE of the chain. Gabriel returns to finish the Dan 8 vision he left unexplained. The 70 weeks (490 years) are "cut off" / determined upon the Jews from the same starting point as the 2300 days — the decree to restore Jerusalem (457 B.C., Artaxerxes). The 70 weeks date Messiah: 69 weeks (483 yrs) to Messiah the Prince (A.D. 27 baptism), cut off in the midst of the week (A.D. 31 crucifixion), 70 weeks end A.D. 34. Subtract 490 from 2300 → 1810 years remain past A.D. 34 → 1844.',
    verses: [
      'Daniel 9:20-27',
      'Daniel 8:14',
      'Daniel 8:26-27',
      'Ezra 7:11-26',
      'Nehemiah 2:1-8',
      'Mark 1:14-15',
      'Luke 3:1',
      'Galatians 4:4',
      'Matthew 27:50-51',
      'Acts 1:8',
    ],
    sources: [
      'DAR 183-212 (Dan 9 Seventy Weeks; 70 weeks cut off from 2300 ~DAR 192; the 457 B.C. decree; Messiah dated)',
      'GC 324-330, 410 (the 70 weeks and 1844)',
      'Miller MWV1-2',
      'Litch PREX1',
    ],
    notes:
      'This is the anchor that makes 1844 certain. Show: the decree 457 B.C.; 69 wks (483 yrs) → A.D. 27 anointing; midst of the week → A.D. 31 crucifixion (veil rent); 70 wks → A.D. 34; the remaining 1810 years of the 2300 → 1844. Build a small arithmetic table. Cite the verified DAR page where the 70 weeks are "cut off" from the 2300.',
  },
  {
    num: 7,
    part: 'II — The Outlines of Daniel',
    slug: '07-daily-and-1290-1335',
    title: 'The Daily, and the 1290 and 1335 Days',
    scope:
      'The deeper time-lines of Daniel 11-12. "The daily" (Heb. tamid, the continual) = paganism, the continual desolating power, taken away to set up the papal "abomination that maketh desolate." The 1290 days (years) run from the taking away of the daily (508) to 1798; the 1335 days from 508 to 1843/44 — "blessed is he that waiteth and cometh to the 1335 days." The "time of the end" begins 1798 (Dan 12:4).',
    verses: [
      'Daniel 11:31',
      'Daniel 12:1',
      'Daniel 12:4',
      'Daniel 12:7',
      'Daniel 12:11-13',
      'Daniel 8:11-13',
      'Matthew 24:15',
    ],
    sources: [
      'DAR 293-318 (Dan 12 Closing Scenes; 1290/1335 ~DAR 314-316)',
      'DAR 154-157 (the daily explained)',
      'Miller MWV1-3 (1335 days)',
      'GC 356 (1798 time of the end)',
    ],
    notes:
      'Define "the daily" (tamid = continual = paganism, per Smith/Miller). Give 508 as the start of the 1290 and 1335 (508+1290=1798; 508+1335=1843). Connect Dan 12:4 "time of the end" = 1798 and the blessing on those who reach 1335 (the advent believers).',
  },

  // ---- PART III — THE REVELATION ----
  {
    num: 8,
    part: 'III — The Revelation',
    slug: '08-seven-churches',
    title: 'The Seven Churches of Revelation 1-3',
    scope:
      'The seven churches portray seven successive periods of the Christian church, apostolic Ephesus to judgment-hour Laodicea — a continuous history, each name fitting its age. Give a table of name-meanings and time frames.',
    verses: [
      'Revelation 1:11',
      'Revelation 1:20',
      'Revelation 2:1-7',
      'Revelation 2:8-11',
      'Revelation 2:12-17',
      'Revelation 2:18-29',
      'Revelation 3:1-6',
      'Revelation 3:7-13',
      'Revelation 3:14-22',
    ],
    sources: [
      'DAR 345-383 (seven churches as successive periods; Ephesus=desirable=apostolic DAR 347; Laodicea=judging of the people DAR 371)',
      'GC 381-382',
    ],
    notes:
      'VERIFY name-meanings + successive-periods doctrine in DAR (search "successive periods of the church", "Ephesus desirable", "Laodicea the judging of the people"). Table: Ephesus 31-100, Smyrna 100-313, Pergamos 313-538, Thyatira 538-1798, Sardis 1798-1833, Philadelphia 1833-1844, Laodicea 1844-advent (later dates approximate).',
  },
  {
    num: 9,
    part: 'III — The Revelation',
    slug: '09-seven-seals',
    title: 'The Seven Seals — the Providential History of the Church',
    scope:
      "The seals unroll the outward fortunes of the gospel and church through the same era: the white horse (apostolic purity), red (persecution), black (declension/Constantine), pale (papal death), the souls under the altar (martyrs), the sixth seal's signs (1755 earthquake, 1780 dark day, 1833 falling stars), and the silence/sealing.",
    verses: [
      'Revelation 6:1-17',
      'Revelation 7:1-3',
      'Revelation 8:1',
      'Matthew 24:29',
      'Joel 2:31',
    ],
    sources: [
      'DAR 402-434 (Rev 6 Seven Seals; the four horses; the sixth-seal signs 1755/1780/1833)',
      'GC 304-308, 333-334 (dark day, falling stars)',
    ],
    notes:
      "Walk the seals in order with their meaning. The sixth seal gives the great signs — pull Rev 6:12-13 and tie to 1755/1780/1833 (cite GC). Note the seals view the era as PROVIDENCE (church's outward fortunes), distinct from churches (spiritual state).",
  },
  {
    num: 10,
    part: 'III — The Revelation',
    slug: '10-seven-trumpets',
    title: 'The Seven Trumpets — the Political Judgments on the Nations',
    scope:
      'The trumpets sound the wars and overthrows that judged the nations touching the church: the first four = the barbarian invasions that broke Western Rome (Alaric, Genseric, Attila, Odoacer); the fifth (first woe) = the Saracens; the sixth (second woe) = the Ottoman Turks, whose "hour, day, month and year" (391 yrs 15 days) ran to Aug 11, 1840 — Litch\'s prediction fulfilled, vindicating the year-day rule.',
    verses: [
      'Revelation 8:2',
      'Revelation 8:6-13',
      'Revelation 9:1-12',
      'Revelation 9:13-21',
      'Revelation 11:14-15',
    ],
    sources: [
      'DAR 452-487 (Rev 8-9 Seven Trumpets; barbarian invasions; Saracens; Ottoman 391 years 15 days → Aug 11 1840)',
      'Litch PREX2 (the 1840 prediction)',
      'GC 334-335 (the Ottoman fall)',
    ],
    notes:
      'Give the seven trumpets with their historical fulfilment. The sixth trumpet (Rev 9:15) "hour, day, month, year" = 391 years 15 days, ending Aug 11, 1840 (Litch). This vindicated the year-day principle publicly. Note trumpets = POLITICAL/military judgments, distinct from seals and churches.',
  },
  {
    num: 11,
    part: 'III — The Revelation',
    slug: '11-revelation-10-little-book',
    title: 'Revelation 10 — The Little Book and the Bittersweet Disappointment',
    scope:
      'The mighty angel with the little book OPEN (Daniel unsealed) sets one foot on sea, one on land, and swears time shall be no longer (no more prophetic time after 1844). The book sweet in the mouth, bitter in the belly = the Advent message — sweet hope, bitter disappointment in 1844. "Thou must prophesy again" = the post-disappointment commission (the third angel).',
    verses: [
      'Revelation 10:1-11',
      'Daniel 12:4',
      'Daniel 12:9',
      'Revelation 14:6-7',
      'Ezekiel 2:8-3:3',
      'Habakkuk 2:3',
    ],
    sources: [
      'DAR 488-496 (Rev 10 The Proclamation of the Advent; the little book; time no longer)',
      'GC 411-412 (the bitter disappointment)',
      'Miller MWV (the 1843-44 movement)',
    ],
    notes:
      'The open little book = unsealed Daniel. "Time no longer" = no prophetic period reaches beyond 1844. Sweet-then-bitter = Advent joy then disappointment. "Prophesy again before many peoples" = the renewed message after 1844. This sets up study 12.',
  },
  {
    num: 12,
    part: 'III — The Revelation',
    slug: '12-chart-tarrying-midnight-cry',
    title: 'The 1843 & 1850 Charts, the Tarrying Time, and the True Midnight Cry',
    scope:
      'Habakkuk 2 is the hub: "Write the vision, make it plain upon tables, that he may run that readeth it" = the 1843 chart (Fitch & Hale) and the corrected 1850 chart — the vision made plain on tables, endorsed as directed by the hand of the Lord (EW 74). "Though it tarry, wait for it" = the tarrying time after the spring-1844 disappointment. The parable of the ten virgins (Matt 25) maps the first cry, the slumber/tarrying, and the TRUE midnight cry — the seventh-month movement (Snow), "Behold, the bridegroom cometh," fixing the tenth day of the seventh month = Oct 22, 1844.',
    verses: [
      'Habakkuk 2:1-4',
      'Matthew 25:1-13',
      'Daniel 7:13-14',
      'Leviticus 16:29-34',
      'Leviticus 23:27-32',
      'Revelation 14:6-7',
      'Amos 3:7',
    ],
    sources: [
      'TRMC (Samuel Snow, The True Midnight Cry, Aug 22 1844 — the seventh-month / Oct 22 argument; cite TRMC page refs)',
      'EW 74-76, 232-238 (the chart directed by God; the midnight cry; the tarrying time)',
      'GC 392-408, 426-432 (the tarrying time; the true midnight cry; the bridegroom came; the seventh-month movement)',
      'Bates BP2 (way marks)',
    ],
    notes:
      'CITE SNOW DIRECTLY — search the local book TRMC (\`egw search "..." --book TRMC\` / \`egw lookup "TRMC <page>"\`) for the seventh-month / tenth-day-seventh-month / Oct 22 argument; attribute to Samuel S. Snow. Show: Hab 2:2 chart on tables (EW 74 endorses it); Hab 2:3 the tarrying; Matt 25 the two cries; the seventh-month movement set Oct 22 via the Karaite Day of Atonement (Lev 16/23); Dan 7:13-14 the bridegroom going IN to the marriage (not coming to earth) resolved the disappointment (GC 426-427). Note the two errors corrected (the date off by the missing year-zero reckoning; the EVENT = Christ entering the most holy, not the advent).',
  },
  {
    num: 13,
    part: 'III — The Revelation',
    slug: '13-woman-in-white',
    title: 'The Woman Clothed in White (Revelation 12) — the True Church',
    scope:
      "The pure woman = the true church, clothed with the sun (Christ's righteousness/gospel), moon under her feet (OT types, reflected light), crown of twelve stars (apostles/patriarchs). She brings forth the man child (Christ), flees into the wilderness 1260 years (538-1798), is preserved, and at last the dragon makes war on the remnant of her seed who keep the commandments and have the testimony of Jesus.",
    verses: [
      'Revelation 12:1-6',
      'Revelation 12:7-12',
      'Revelation 12:13-17',
      '2 Corinthians 11:2',
      'Jeremiah 6:2',
      'Ephesians 5:25-27',
      'Isaiah 54:5-6',
      'Song of Solomon 6:10',
    ],
    sources: [
      'DAR 509-520 (Rev 12 The Gospel Church — pure woman; 1260 years; the remnant)',
      'GC 381-382, 433-438 (woman = church; the woman in the wilderness)',
      'Waggoner EVCO',
    ],
    notes:
      'Establish woman=church (2 Cor 11:2; Jer 6:2). Explain her clothing (sun/moon/stars). 1260 days = church in the wilderness 538-1798. End on the commandment-keeping remnant (12:17) — the link to the last-day church.',
  },
  {
    num: 14,
    part: 'III — The Revelation',
    slug: '14-beast-power',
    title: 'The Beast Power of Revelation 13 — the Papacy',
    scope:
      "The first beast of Rev 13:1-10 = the Papacy, the same persecuting power as the Dan 7 little horn. Every mark of identity: rises from the sea (peoples), leopard/bear/lion body (inherits Daniel's kingdoms), the dragon (pagan Rome) gives it seat+power, 42 months = 1260 years (538-1798), blasphemy, war on saints, deadly wound and healing, universal worship, the number 666.",
    verses: [
      'Revelation 13:1-10',
      'Revelation 13:18',
      'Daniel 7:8',
      'Daniel 7:24-25',
      '2 Thessalonians 2:3-8',
      'Revelation 17:3-6',
      'Revelation 17:18',
      'Numbers 14:34',
    ],
    sources: [
      'DAR 520-532 (Rev 13 the beast identified; 666 / VICARIVS FILII DEI)',
      'DAR 113-144 (Dan 7 same power)',
      'GC 439-450 (man of sin / 1260 years)',
      'A.T. Jones TTR/GEP',
    ],
    notes:
      'Give the full case + keep the three strongest texts identifiable. Pull Rev 13:18 for 666 and let DAR explain the VICARIVS FILII DEI numeral computation. The deadly wound (1798) and its healing.',
  },
  {
    num: 15,
    part: 'III — The Revelation',
    slug: '15-two-horned-beast-usa',
    title: 'The Two-Horned Beast and the Image of the Beast — the United States',
    scope:
      'The second beast of Rev 13:11-17 = the United States: comes up out of the earth (a new, sparsely settled region, c. 1798), two lamb-like horns (republicanism + Protestantism, civil + religious liberty, no kingly crowns), then speaks as a dragon — making an image to the first beast (a church-state union enforcing religious dogma) and enforcing its mark by economic and capital penalties (buy/sell, death decree).',
    verses: [
      'Revelation 13:11-17',
      'Revelation 13:18',
      'Daniel 2:43',
      'Revelation 14:9-11',
      'Revelation 16:13-14',
    ],
    sources: [
      'DAR 537-582 (Rev 13 the two-horned beast = United States; the image; the mark enforced)',
      'A.T. Jones TTR (Rome and the United States; church and state)',
      'GC 439-450 (the image of the beast)',
    ],
    notes:
      "Pull every identity-mark of the USA from DAR 537-582 (rises ~1798, out of the earth, lamb-horns = republican+protestant principles, location/timing). Define the IMAGE of the beast = a church-state union like Rome's; the mark enforced by no-buy/no-sell and a death decree.",
  },
  {
    num: 16,
    part: 'III — The Revelation',
    slug: '16-mark-of-the-beast',
    title: 'The Mark of the Beast',
    scope:
      'The mark is the badge of submission to the beast\'s authority in the exact point where he exalted himself against God — His law and holy day. The little horn "thought to change times and laws" (Dan 7:25); the change of the Sabbath to Sunday is the mark of his assumed authority. God\'s authority rests in His law; the Sabbath is the sign/seal of the Creator; the beast demands worship in the point of the change; the third angel warns; the seal of God in the forehead is the contrast.',
    verses: [
      'Daniel 7:25',
      'Revelation 13:16-17',
      'Revelation 14:9-12',
      'Exodus 31:13',
      'Exodus 31:17',
      'Ezekiel 20:12',
      'Ezekiel 20:20',
      'Exodus 20:8-11',
      'Genesis 2:1-3',
      'Isaiah 58:12-14',
      'Revelation 7:2-3',
      'Revelation 14:1',
      'Ezekiel 9:4',
      'Revelation 22:14',
    ],
    sources: [
      'DAR 615-637 (Rev 14 mark of the beast / third angel)',
      'DAR 533-537 (the mark enforced)',
      'DAR 435-451 (the seal of God)',
      'GC 442, 446-449 (the seal and the mark)',
      'Bates BP2/BP3 (Sabbath/sign)',
    ],
    notes:
      "Make the Sabbath-as-seal vs. mark contrast explicit. The fourth commandment alone carries the lawgiver's name, title, territory (a seal). The mark is not yet received by anyone — it is the final test. Three strongest texts identifiable, full case given.",
  },
  {
    num: 17,
    part: 'III — The Revelation',
    slug: '17-three-angels-messages',
    title: "The Three Angels' Messages (Revelation 14)",
    scope:
      'The present-truth climax. First angel: the everlasting gospel + "the hour of His judgment is come" (the 1844 judgment-hour message) + a call to worship the Creator (Sabbath). Second angel: "Babylon is fallen." Third angel: the most fearful warning in Scripture against the beast, his image, and his mark — over against which stand they that keep the commandments of God and the faith of Jesus. Then the harvest of the earth (the second coming).',
    verses: [
      'Revelation 14:6-13',
      'Revelation 14:14-20',
      'Daniel 8:14',
      'Revelation 18:1-5',
      'Exodus 20:11',
      'Ecclesiastes 12:13-14',
    ],
    sources: [
      'DAR 582-637 (Rev 14 The Three Messages, full treatment)',
      'GC 355-390 (first message), 388-390 (second), 435-450 (third)',
      "Bates (the third angel's message)",
    ],
    notes:
      'Walk all three messages with their texts. First = judgment-hour (1844) + worship the Creator (Sabbath link). Second = Babylon fallen. Third = the mark warning + the commandment-keeping remnant (14:12). End with the harvest (14:14-20) = the advent.',
  },
  {
    num: 18,
    part: 'III — The Revelation',
    slug: '18-144000-great-multitude',
    title: 'The 144,000 and the Great Multitude',
    scope:
      "Two companies. The 144,000 = the living saints sealed in the forehead and translated without seeing death — the firstfruits, standing with the Lamb on Mount Zion with the Father's name, without guile, following the Lamb whithersoever He goeth. The great multitude = the larger, uncountable host of the redeemed of all ages who came out of great tribulation and washed their robes in the blood of the Lamb.",
    verses: [
      'Revelation 7:1-8',
      'Revelation 7:9-17',
      'Revelation 14:1-5',
      'Galatians 3:29',
      'Revelation 15:2-3',
      'Revelation 3:10',
      'Revelation 21:3-4',
    ],
    sources: [
      'DAR 435-451 (Rev 7 sealing; 144,000 vs great multitude)',
      'DAR 615-619 (Rev 14 the 144,000 on Mount Zion)',
      'GC 648-649 (the living translated)',
      'EW 15-18, 285',
    ],
    notes:
      'Two sub-sections, one per company, each with its full texts. 144,000 = spiritual Israel (Gal 3:29), sealed and living through the last crisis; great multitude = the redeemed of all ages, beyond number.',
  },
  {
    num: 19,
    part: 'III — The Revelation',
    slug: '19-woman-on-beast-babylon',
    title: 'The Woman Who Rides the Beast — Babylon',
    scope:
      'The woman of Rev 17 = the apostate church, Babylon — Papal Rome and her fallen daughters — riding upon and controlling the civil power (the scarlet beast). Arrayed in purple and scarlet, golden cup of abominations, named MYSTERY BABYLON THE MOTHER OF HARLOTS, drunken with the blood of the saints, "that great city which reigneth over the kings of the earth." The seven heads = seven mountains (Rome).',
    verses: [
      'Revelation 17:1-6',
      'Revelation 17:9',
      'Revelation 17:15',
      'Revelation 17:18',
      'Revelation 14:8',
      'Revelation 18:1-5',
      'Jeremiah 3:6-9',
      'Ezekiel 23:2-4',
      'Isaiah 1:21',
    ],
    sources: [
      'DAR 657-680 (Rev 17 Babylon the Mother; the woman; the daughters)',
      'GC 381-383 (woman=church; Babylon=apostate religion)',
      'A.T. Jones FACC',
    ],
    notes:
      "Symbol-key first (woman=church; pure vs corrupt). Walk Rev 17. Seven heads=seven mountains=Rome (17:9). Tie to Babylon's fall (14:8; 18:1-5) and her daughters (apostate Protestantism).",
  },

  // ---- PART IV — THE SANCTUARY AND THE CONSUMMATION ----
  {
    num: 20,
    part: 'IV — Sanctuary & Consummation',
    slug: '20-sanctuary-1844-judgment',
    title: 'The Sanctuary, the Cleansing, and the Investigative Judgment (1844)',
    scope:
      'What was cleansed in 1844. The earthly sanctuary was a type of the heavenly (Heb 8-9); the Day of Atonement (Lev 16) cleansed the sanctuary from the recorded sins of Israel — a type of the antitypical cleansing of the heavenly sanctuary, the investigative judgment, which began Oct 22, 1844 when Christ passed into the most holy place. This corrected the two errors of 1844: not the earth but the heavenly sanctuary; not the second advent but the opening of the judgment.',
    verses: [
      'Daniel 8:14',
      'Hebrews 8:1-6',
      'Hebrews 9:1-12',
      'Hebrews 9:23-28',
      'Leviticus 16:15-19',
      'Leviticus 16:29-34',
      'Daniel 7:9-10',
      'Revelation 11:19',
      'Revelation 14:7',
      'Malachi 3:1-3',
      'Acts 3:19-21',
    ],
    sources: [
      'Bates BP3 (typical & anti-typical sanctuary — the foundational study)',
      'Smith STTHD / TTHDS (the sanctuary & 2300 days)',
      'GC 409-432 (what is the sanctuary), 479-491 (the investigative judgment)',
      'EW 250-253, 42-45 (the most holy place opened 1844)',
    ],
    notes:
      'Show: the heavenly sanctuary is the true one (Heb 8-9); Lev 16 Day of Atonement = type; the cleansing of Dan 8:14 = the antitypical Day of Atonement / investigative judgment begun 1844 (Christ into the most holy, Rev 11:19 ark seen). Connect to the judgment scene of Dan 7:9-10. This is the doctrine the disappointment uncovered.',
  },
  {
    num: 21,
    part: 'IV — Sanctuary & Consummation',
    slug: '21-law-and-sabbath-in-prophecy',
    title: 'The Law and the Sabbath in Prophecy',
    scope:
      'Why the law and the Sabbath stand at the center of the last conflict. The ark in the heavenly temple (Rev 11:19) holds the law; the controversy is over the commandments (Rev 12:17; 14:12). The little horn thought to change times and laws (Dan 7:25) — the Sabbath. The law is perpetual; the Sabbath is the seal and the memorial of creation, restored in the last message (Isa 58; Rev 14:7). The remnant keep the commandments.',
    verses: [
      'Revelation 11:19',
      'Revelation 12:17',
      'Revelation 14:12',
      'Daniel 7:25',
      'Exodus 20:8-11',
      'Isaiah 58:12-14',
      'Isaiah 66:22-23',
      'Matthew 5:17-18',
      'Psalm 111:7-8',
      'James 2:10-12',
      'Revelation 22:14',
    ],
    sources: [
      'DAR 615-637 (the commandment-keeping remnant; the law in the controversy)',
      'GC 433-450 (the law of God; the change of the Sabbath), 453-460 (origin of the Sunday change)',
      'Waggoner / Jones (the law and the gospel)',
      'Bates BP2/BP3',
    ],
    notes:
      "Tie the law/Sabbath into the prophetic frame: ark in heaven holds the law (Rev 11:19), the controversy is over the commandments (12:17; 14:12), the change of the Sabbath is the little-horn act (Dan 7:25). The Sabbath restored in the first angel's call to worship the Creator (14:7; Isa 58).",
  },
  {
    num: 22,
    part: 'IV — Sanctuary & Consummation',
    slug: '22-two-covenants',
    title: 'The Two Covenants — the Everlasting Gospel in Prophecy',
    scope:
      'The gospel foundation under the whole chain (Waggoner). The two covenants are not two periods but two conditions: the old = the promise of the people ("all this we will do," self-righteousness, bondage — Hagar/Sinai); the new = the promise of God written on the heart by faith (Sarah/Jerusalem above, liberty). The everlasting covenant runs from Eden, confirmed in Christ. This is the righteousness by faith that the 144,000 and the remnant live by — the message of Rev 14:6 ("the everlasting gospel").',
    verses: [
      'Galatians 4:22-31',
      'Hebrews 8:6-13',
      'Jeremiah 31:31-34',
      'Genesis 17:7',
      'Romans 4:13-16',
      'Hebrews 9:15-17',
      'Galatians 3:6-9',
      'Galatians 3:16-18',
      'Revelation 14:6',
    ],
    sources: [
      'Waggoner EVCO (The Everlasting Covenant — the foundational treatment)',
      'Waggoner GTI (The Glad Tidings — Galatians/two covenants)',
      'Waggoner WOR (Waggoner on Romans)',
      'GC 467-478 (the experience of righteousness by faith)',
    ],
    notes:
      'Use Waggoner EVCO/GTI as the backbone. Two covenants = two conditions of heart, not two eras (Gal 4:22-31). The everlasting covenant from Eden, confirmed in Christ\'s blood. This is the gospel core of "the everlasting gospel" of the first angel (Rev 14:6) and the faith the remnant live by.',
  },
  {
    num: 23,
    part: 'IV — Sanctuary & Consummation',
    slug: '23-state-of-the-dead-spiritualism',
    title: 'The State of the Dead and the Last Deception (Spiritualism)',
    scope:
      'Why the truth about death guards against the final deception. The dead sleep, knowing nothing, awaiting the resurrection — there is no conscious immortal soul. This shuts the door on spiritualism, the masterpiece of deception by which Satan personates the dead (and even Christ), working miracles to deceive the world before the end, uniting Romanism, apostate Protestantism, and spiritualism in the last great threefold union (Rev 16:13-14).',
    verses: [
      'Ecclesiastes 9:5-6',
      'Ecclesiastes 9:10',
      'Psalm 146:3-4',
      'Psalm 115:17',
      'John 11:11-14',
      '1 Thessalonians 4:13-17',
      '1 Corinthians 15:51-54',
      'Job 14:12',
      '1 Timothy 4:1',
      'Revelation 16:13-14',
      '2 Corinthians 11:14',
      'Isaiah 8:19-20',
    ],
    sources: [
      'GC 531-562 (spiritualism; the last deception; can our dead speak to us?)',
      'GC 551-562 (the threefold union; agencies of deception)',
      'DAR 641-657 (Rev 16 — the spirits of devils working miracles)',
      'EW 262-263 (spiritualism)',
    ],
    notes:
      'Two halves: (1) the state of the dead — sleep, no consciousness, resurrection-hope; (2) spiritualism as the consequence/deception — Satan personating the dead, miracles (Rev 16:14), the threefold union of Rev 16:13. "To the law and to the testimony" (Isa 8:20) is the test. Tie to the last conflict.',
  },
  {
    num: 24,
    part: 'IV — Sanctuary & Consummation',
    slug: '24-comparing-the-sevens',
    title: 'Comparing the Sevens — Churches, Seals, Trumpets, Plagues',
    scope:
      'Four parallel lines over the same history, each from a different standpoint. Churches = RELIGIOUS history (the church\'s spiritual state). Seals = PROVIDENTIAL history (the church\'s outward fortunes). Trumpets = POLITICAL/military judgments on the nations. Plagues = the FINAL WRATH on the wicked, AFTER probation closes, "without mixture" of mercy, on those who have the mark.',
    verses: [
      'Revelation 1:11',
      'Revelation 1:20',
      'Revelation 6:1-2',
      'Revelation 6:9-11',
      'Revelation 8:2',
      'Revelation 9:15',
      'Revelation 15:1',
      'Revelation 16:1-2',
      'Revelation 22:11',
    ],
    sources: [
      'DAR 345-383 (churches)',
      'DAR 402-434 (seals)',
      'DAR 452-487 (trumpets; 1840)',
      'DAR 638-657 (plagues)',
      'GC 627-634 (plagues after probation)',
    ],
    notes:
      'Four labeled bullets (one per series) each stating its standpoint with proof texts, plus a one-sentence summary distinguishing all four. The plagues are unique: after the close of probation, without mixture of mercy.',
  },
  {
    num: 25,
    part: 'IV — Sanctuary & Consummation',
    slug: '25-babylon-fallen-loud-cry',
    title: 'Babylon Fallen, the Loud Cry, and "Come Out of Her"',
    scope:
      'The second angel\'s message swells into the loud cry of Rev 18: another angel lightens the earth with glory, "Babylon the great is fallen," and "Come out of her, my people, that ye be not partakers of her sins." This is the final call, the latter rain, the close of the gospel work before probation ends.',
    verses: [
      'Revelation 14:8',
      'Revelation 18:1-8',
      'Revelation 17:5',
      'Jeremiah 51:6-9',
      'Isaiah 52:11',
      '2 Corinthians 6:17',
      'Joel 2:23',
      'Hosea 6:3',
      'Acts 3:19',
    ],
    sources: [
      'DAR 663-680 (Rev 18 Babylon the Daughters; the loud cry; come out of her)',
      'GC 603-612 (the loud cry; the latter rain), 390 (Babylon fallen)',
      'EW 277-279 (the loud cry)',
    ],
    notes:
      "Babylon = mother + daughters (apostate Rome + fallen Protestantism). The loud cry (Rev 18:1-4) = the swelling of the third angel's message, lightening the earth, calling God's people out. Tie to the latter rain (Joel 2:23; Hosea 6:3).",
  },
  {
    num: 26,
    part: 'IV — Sanctuary & Consummation',
    slug: '26-close-of-probation-time-of-trouble',
    title: "The Close of Probation and the Time of Jacob's Trouble",
    scope:
      'When every case is decided — "He that is unjust, let him be unjust still... he that is holy, let him be holy still" — Christ ceases His intercession, and the seven last plagues fall. God\'s people pass through the time of Jacob\'s trouble (Jer 30:7; Dan 12:1) without a mediator yet kept by God, standing through the death decree, delivered at last.',
    verses: [
      'Revelation 22:11',
      'Daniel 12:1',
      'Jeremiah 30:5-7',
      'Revelation 7:1-3',
      'Revelation 16:1-2',
      'Ezekiel 7:19',
      'Psalm 91:1-11',
      'Isaiah 26:20-21',
      'Luke 18:7-8',
    ],
    sources: [
      "GC 613-634 (the close of probation; the time of trouble), 635-652 (God's people delivered)",
      'EW 279-285 (the time of trouble; the close of probation)',
      'DAR 293-318 (Dan 12:1 — Michael stands up)',
    ],
    notes:
      "Probation closes (Rev 22:11; Michael stands up, Dan 12:1). No mediator; plagues fall (16:1-2). The time of Jacob's trouble (Jer 30:7) — God's people kept (Ps 91), the death decree, the deliverance. Sober but hope-ending.",
  },
  {
    num: 27,
    part: 'IV — Sanctuary & Consummation',
    slug: '27-armageddon-seven-plagues',
    title: 'Armageddon and the Seven Last Plagues',
    scope:
      'The seven last plagues poured out on the kingdom of the beast after probation: sores, sea to blood, rivers to blood, scorching sun, darkness on the beast\'s throne, Euphrates dried (the way of the kings of the east), and the great voice "It is done." The sixth plague gathers the world to the battle of that great day — Armageddon — the final conflict of the powers of earth against God and His people, ended by the coming of Christ.',
    verses: [
      'Revelation 15:1',
      'Revelation 15:5-8',
      'Revelation 16:1-21',
      'Revelation 17:14',
      'Revelation 19:11-21',
      'Joel 3:9-16',
      'Zephaniah 3:8',
    ],
    sources: [
      'DAR 638-657 (Rev 15-16 The Seven Last Plagues; Armageddon)',
      'GC 627-634 (the plagues), 635-652 (Armageddon and deliverance)',
      'EW 289-290',
    ],
    notes:
      "Walk the seven plagues in order. The sixth (Euphrates dried, the kings of the east, the gathering to Armageddon, Rev 16:12-16). Armageddon = the final gathering against God's people, broken by Christ's appearing (Rev 19). The plagues fall on those with the mark.",
  },
  {
    num: 28,
    part: 'IV — Sanctuary & Consummation',
    slug: '28-second-coming',
    title: 'The Second Coming of Christ in Glory',
    scope:
      'The blessed hope — literal, visible, audible, glorious. Every eye shall see Him; He comes in the clouds with all the holy angels; the dead in Christ rise, the living righteous are changed and caught up; the wicked are slain by the brightness of His coming. Not secret, not spiritual — the personal return that ends the controversy and gathers the redeemed.',
    verses: [
      'Revelation 1:7',
      'Matthew 24:27',
      'Matthew 24:29-31',
      'Acts 1:9-11',
      '1 Thessalonians 4:15-18',
      '1 Corinthians 15:51-54',
      'Titus 2:11-14',
      'Revelation 6:14-17',
      '2 Thessalonians 1:7-10',
      'Revelation 19:11-16',
    ],
    sources: [
      'DAR 680-686 (Rev 19 The Triumph of the Saints; the coming)',
      'GC 640-645 (the second advent)',
      'EW 15-18, 286-295 (the coming and the reward)',
      'Miller MWV2-3 (the second coming about 1843)',
    ],
    notes:
      'Make it literal, visible, glorious — over against the secret/spiritual counterfeits. Every eye sees Him (1:7); the resurrection and translation (1 Thess 4); the wicked slain (2 Thess 1; Rev 6:14-17; 19:11-21). The blessed hope (Titus 2:13).',
  },
  {
    num: 29,
    part: 'IV — Sanctuary & Consummation',
    slug: '29-millennium-two-resurrections',
    title: 'The Millennium and the Two Resurrections',
    scope:
      'The thousand years. At the second coming the righteous dead rise (first resurrection) and the living righteous are translated — all to heaven; the wicked are slain; the earth lies desolate, Satan "bound" by circumstance (no one to tempt) for a thousand years. After the thousand years the wicked dead rise (second resurrection), the holy city descends, the wicked compass it, fire comes down — the second death — and the earth is made new.',
    verses: [
      'Revelation 20:1-15',
      'Revelation 21:1-5',
      'Jeremiah 4:23-27',
      'Isaiah 24:1-6',
      '1 Thessalonians 4:16-17',
      'John 5:28-29',
      '1 Corinthians 15:23-26',
      'Malachi 4:1-3',
      '2 Peter 3:10-13',
    ],
    sources: [
      'DAR 687-728 (Rev 20-22 The First and Second Resurrections; the New Jerusalem; the new earth)',
      'GC 653-678 (the controversy ended; the desolation of the earth; the second death; the new earth)',
      'EW 51-54, 289-295',
    ],
    notes:
      'Two resurrections a thousand years apart (Rev 20:4-6, 12-13; John 5:28-29). The earth desolate during the millennium (Jer 4:23-27; Isa 24); Satan bound by circumstance. After: the second resurrection, the holy city, the second death (Rev 20:9-15; Mal 4:1-3), the new earth (Rev 21; 2 Peter 3). End the whole chain on the new earth — the great-controversy resolved.',
  },
];

// ===========================================================================
// Phase 1 — fan out one writer agent per study (parallel, independent files).
// ===========================================================================

phase('Write Studies');
log(`The full chain: ${STUDIES.length} studies in parallel — one markdown each under sections/`);

const written = await parallel(
  STUDIES.map(
    (s) => () =>
      agent(writerPrompt(s), {
        label: `study:${String(s.num).padStart(2, '0')}-${s.slug}`,
        phase: 'Write Studies',
      }).then((summary) => ({ ...s, summary })),
  ),
);

const ok = written.filter(Boolean);
log(`${ok.length}/${STUDIES.length} studies written`);
for (const s of ok) log(`  ✓ ${s.num}. ${s.title} — ${String(s.summary).slice(0, 110)}`);

// ===========================================================================
// Phase 2 — compile all sections into the master handbook, organized by part.
// ===========================================================================

phase('Compile');

const partsList = [
  'I — Foundation',
  'II — The Outlines of Daniel',
  'III — The Revelation',
  'IV — Sanctuary & Consummation',
];
const tocByPart = partsList
  .map((p) => {
    const items = STUDIES.filter((s) => s.part === p)
      .map((s) => `    - ${s.num}. ${s.title}  (sections/${s.slug}.md)`)
      .join('\n');
    return `  PART ${p}\n${items}`;
  })
  .join('\n');

const compilePrompt = `You are compiling the final master file of an exhaustive Seventh-day Adventist prophecy "Bible Handbook" — the FULL historicist chain — in the style of Stephen N. Haskell.

You are at repo root /Users/cvr/Developer/personal/bible-tools.

The ${STUDIES.length} individual studies have been written as separate markdown files in:
\`${SECTIONS_DIR}/\`
Each is named NN-slug.md and begins with a \`# N. <Title>\` heading. List the directory and READ all of them.

The studies are organized into four PARTS, in this order:
${tocByPart}

## Your job: assemble ONE master file at \`${DIR}/understanding-prophecy.md\` (OVERWRITE any existing file).

Structure, in order:

1. **YAML frontmatter**:
\`\`\`
---
created_at: 2026-06-03
type: study
title: "Understanding Prophecy — The Full Chain (A Bible Handbook)"
series: Understanding Prophecy
style: haskell-bible-handbook
sources:
  - Uriah Smith, Daniel and the Revelation (DAR)
  - William Miller, Miller's Works (MWV1–3)
  - Josiah Litch, Prophetic Expositions (PREX1–2)
  - Joseph Bates, Second Advent Way Marks (BP2), Typical & Anti-typical Sanctuary (BP3)
  - A. T. Jones, The Great Empires of Prophecy (GEP), The Two Republics (TTR)
  - E. J. Waggoner, The Everlasting Covenant (EVCO), The Glad Tidings (GTI)
  - Samuel S. Snow, The True Midnight Cry (TRMC)
  - Ellen G. White, The Great Controversy (GC), Early Writings (EW)
---
\`\`\`

2. **Title + intro** (\`# Understanding Prophecy — The Full Chain\`): an italic description of the Haskell style; a paragraph that this handbook walks the COMPLETE interlocking historicist argument of the SDA pioneers — from the year-day principle, through the four parallel outlines of Daniel (2, 7, 8, 9) that re-walk the same history at deepening resolution, into the Revelation, the 1844 sanctuary message, and the consummation — so the reader can take the Bible in hand and prove each link; the historicist method note (day=year, Num 14:34 / Eze 4:6; Scripture its own expositor; symbols defined by the Bible); and the Haskell epigraph: \`> "The Bible Handbook is not an exhaustive study; but contains suggestive texts on important lines of thought." — S. N. Haskell\`

3. **Abbreviations** block — DAR, MWV1/2/3, PREX1/2, BP2/BP3, GEP, TTR, ECE, EVCO, GTI, WOR, TRMC (note: Samuel S. Snow, The True Midnight Cry, 1844), STTHD/TTHDS (Uriah Smith on the 2300 days & sanctuary), GC, EW, CET. Add a note that verse refs are KJV and pioneer/EGW page numbers follow each explanation.

4. **Contents** — organized under the four PART headings, a numbered list of all ${STUDIES.length} study titles, each a working anchor link (GitHub-style slugs: lowercase, spaces→hyphens, punctuation/em-dashes stripped). Verify anchors match the headings you paste.

5. **The ${STUDIES.length} studies in order (1→${STUDIES.length}), grouped under their four PART headings** (use a \`# Part I — Foundation\` style divider before each part's studies). Separate studies with \`---\`. Paste each study's body VERBATIM from its file — do NOT rewrite, summarize, or trim. Keep their \`# N. Title\` headings.

6. A short closing italic colophon: compiled in Haskell's manner from the SDA pioneers (Smith, Miller, Litch, Bates, Jones, Waggoner, Snow) and Ellen G. White; invite the reader to look up each text and prove the chain link by link.

Do NOT alter the scripture bullets or citations inside the studies — your job is assembly: frontmatter, intro, abbreviations, part-organized contents, part dividers, and clean \`---\` separators. After writing, return one line: total study count, approximate total scripture-bullet count (grep \`- **\` lines), and confirmation the file was written.`;

const compileSummary = await agent(compilePrompt, { label: 'compile:master', phase: 'Compile' });

log('Compilation complete.');
return {
  studies: ok.map((s) => ({ num: s.num, part: s.part, title: s.title, slug: s.slug })),
  compile: compileSummary,
};
