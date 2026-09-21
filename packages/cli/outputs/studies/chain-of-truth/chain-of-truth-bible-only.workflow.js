export const meta = {
  name: 'chain-of-truth-bible-only',
  description:
    'Rewrite "The Chain of Truth" as a BIBLE-ONLY handbook: same 16-link chain (1816→1888 doctrines), but doctrine proven entirely from Scripture, symbols defined cross-canon, narrative dropped, pioneer/EGW only for historical facts + a few capped confirmations. Dual scripture-research → adversarial Bible-first review → opus synthesis → opus aggregate → machine verify + coherence read.',
  whenToUse:
    'Regenerate the Chain of Truth handbook as a pure Bible study of the same prophetic chain, Scripture-primary, pioneer/EGW minimized.',
  phases: [
    {
      title: 'Research',
      detail:
        'two scripture-forward researchers per link: build the verse-by-verse proof + cross-canon symbol definitions',
    },
    {
      title: 'Cross-Review',
      detail:
        'adversarial Bible-first review: is every symbol Scripture-defined? is any doctrine resting on a pioneer source?',
    },
    {
      title: 'Synthesize',
      detail:
        'opus writes each link as a lean Scripture-driven Bible study from the reviewed dossiers',
    },
    {
      title: 'Aggregate',
      detail: 'opus stitches all 16 + front matter + TOC + Symbol Dictionary appendix',
    },
    {
      title: 'Verify',
      detail:
        'machine re-verify every refcode (Bible + the few pioneer refs) + adversarial coherence read',
    },
  ],
};

// ===========================================================================
// Paths
// ===========================================================================
const REPO = '/Users/cvr/Developer/personal/bible-tools';
const DIR = `${REPO}/packages/cli/outputs/studies/chain-of-truth`;
const SECTIONS_DIR = `${DIR}/sections-bible-only`;
const TEMPLATE_DR = `${REPO}/packages/cli/outputs/studies/2026-06-10-daniel-and-the-revelation-a-bible-handbook-study.md`;
const TEMPLATE_RBF = `${REPO}/packages/cli/outputs/studies/2026-06-17-righteousness-by-faith-a-bible-handbook-study.md`;
const OUT = `${REPO}/packages/cli/outputs/studies/2026-06-20-the-chain-of-truth-a-bible-only-handbook-study.md`;

// ===========================================================================
// Shared contracts handed to agents verbatim
// ===========================================================================

const SOURCE_CONTRACT = `
## How to pull sources (DO NOT paraphrase from memory; NEVER invent a refcode)

Repo root: ${REPO}. The \`bible\` CLI is on PATH; local lookups need NO auth.

KJV VERSE TEXT (the authoritative source for THIS handbook — quote exactly):
- \`bun run packages/cli/src/main.ts verse "Daniel 8:14" --json\`   (parse .verses[]; use ranges not comma-lists; strip red-letter ‹ › markers)
- Walk WHOLE chapters/passages, not just the famous verse. The proof is the chain of verses.

CROSS-CANON SYMBOL DEFINITION (the heart of this rewrite):
- A symbol is defined FIRST and PRIMARILY from Scripture: the same verse, the same chapter, or another book.
  e.g. beast = kingdom (Dan 7:17,23); waters = peoples (Rev 17:15); day = year (Num 14:34; Eze 4:6);
  woman = church (Jer 6:2; 2 Cor 11:2; Eph 5:23-32); horn = king/kingdom (Dan 7:24; 8:21-22).
- Use a concordance approach: search the KJV for where the Bible explains its own figure. NEVER let a
  pioneer/EGW source be the definition of a symbol.

PIONEER / EGW (local SQLite) — STRICTLY SECONDARY, USE SPARINGLY:
- \`bible egw "REF"\` reads a paragraph; \`bible egw search "phrase" --limit 8\` finds one.
- ALLOWED ONLY FOR: (a) a HISTORICAL FACT Scripture cannot supply (a date/place/who — e.g. "the Ottoman
  Sultan accepted European protection Aug 11, 1840"), or (b) a SMALL, CAPPED number of pivotal CONFIRMATIONS
  placed AFTER Scripture has already carried the point. NEVER to prove a doctrine or define a symbol.
- Hard cap: aim for AT MOST 1-2 pioneer/EGW references per section, zero where Scripture is self-sufficient.
- AVOID hyphenated/quoted operator tokens in egw search ("twenty-three", "457-bc") — the FTS parser trips; use plain words.

## The few historical anchors (cite a pioneer/EGW refcode ONLY for the bare date/fact, if used at all)
- Litch's Ottoman year-day vindication: Aug 11, 1840.  · 1843 Fitch–Hale chart.  · Exeter camp meeting Aug 1844.
- Great Disappointment: Oct 22, 1844 (the DATE was right; the EVENT — earthly advent — was misunderstood).
- Edson's cornfield: morning of Oct 23, 1844.  · Crosier's sanctuary article: Feb 7, 1846.  · Bates' Sabbath pamphlet: 1846.
- SDA organization: May 21, 1863.  · 1888 Minneapolis GC: righteousness by faith.
These are HISTORY, not doctrine — the doctrine of each link is proven from the Bible regardless of the date.
`;

const STYLE_CONTRACT = `
## STYLE CONTRACT — handbook format, but BIBLE-ONLY in substance
Templates (format reference only): ${TEMPLATE_RBF} and ${TEMPLATE_DR}. Read one before writing.

- After Haskell's Bible Handbook: every doctrinal line is **ref → gloss**, SCANNABLE. Here the refs are
  overwhelmingly SCRIPTURE; pioneer/EGW lines are rare and clearly secondary.
- Section opens with a one-line ">" blockquote thesis for that link.
- This is a PURE BIBLE STUDY of the link's doctrine — NO historical-discovery narrative ("Miller saw…",
  "at Exeter…", "Edson walking through the cornfield…"). Drop the story. Keep the DOCTRINE and the chain logic.
- A single brief HISTORICAL ANCHOR sentence is allowed where a date locates the link in the chain (e.g.
  "This line, begun at the 457 BC decree, runs to 1844"), but it is a footnote to the Bible argument, not the body.
- Walk the Scripture. The FIRST time a symbol/figure appears, define it inline FROM THE BIBLE:
  "  - **symbol** = meaning (_Scripture receipt 1_; _Scripture receipt 2_)." — let the Bible define its own figures (Miller's Rule).
- Verse→gloss line: "- _Dan. 8:14._ \\"Unto two thousand and three hundred days...\\" — one-line gloss."
- Rare pioneer/EGW line (only if truly needed): "- _GC 329.2._ White: \\"...short quote...\\" — and label it a CONFIRMATION, after the Scripture.
- Italicize refs (_Dan. 8:14_, _Rev. 12:6_). Quote KJV phrases in double quotes, verbatim.
- Section CLOSES with "**DEFINITION — TITLE =** ..." summarizing what the SCRIPTURE built, then
  "**Symbols defined here:**" (bullets, Bible receipts) and "**Symbols carried:**" referencing the OWNING section by exact TITLE.
- Cross-reference other sections by exact TITLE in quotes (see "The Seventy Weeks — Daniel 9 / the 457 BC Anchor"). NEVER by number.
- NO [CHAIN]/[KEY] markers. Tone: dense, reverent, Scripture-first. No filler.
- Thesis of the whole: "The key opens the casket" — the method of comparing Scripture with Scripture (the
  Bible its own interpreter) is the key that opens the whole casket of prophetic truth; every link is drawn
  out by that same key — and in THIS handbook the key is shown working on the Scripture ALONE.
`;

// ===========================================================================
// The 16-link spine. Same chain as the original handbook, but scope/terms
// recast toward the SCRIPTURE doctrine (narrative removed). symbols must be
// Bible-definable.
// ===========================================================================
const SECTIONS = [
  {
    key: '01-casket-key',
    part: 'I — The Method & the Time (1816–1840)',
    title: 'The Casket & the Key — the Method',
    scope:
      'The method itself, proven from Scripture: the Bible is its own interpreter. "Comparing spiritual things with spiritual" (1 Cor 2:13); "no prophecy of the scripture is of any private interpretation" (2 Pet 1:20); "line upon line, precept upon precept" (Isa 28:9-13); "the testimony of the LORD is sure" (Ps 19:7); search the scriptures (John 5:39; Acts 17:11). The casket/key is the controlling IMAGE for the whole study (the advent truths = the casket; the method = the key). Define the method ONLY from Scripture about how Scripture is to be read.',
    terms: [
      'comparing spiritual things',
      'private interpretation',
      'line upon line',
      'search the scriptures',
      'the entrance of thy words',
    ],
    symbols: [
      'the casket (= the body of prophetic truth)',
      'the key (= comparing Scripture with Scripture)',
      'present truth (2 Pet 1:12)',
    ],
  },
  {
    key: '02-great-image',
    part: 'I — The Method & the Time (1816–1840)',
    title: 'The Great Image — Daniel 2, the Spine of History',
    scope:
      'Dan 2 walked whole: the image of gold/silver/brass/iron/iron+clay, the stone cut without hands. The chapter NAMES its own symbols — "Thou art this head of gold" (v38), "another kingdom" (v39), etc. The stone = the kingdom of God (vv44-45). Establish that a metal/part = a kingdom from the text itself, and that Dan 2 is the structural spine the later visions repeat.',
    terms: [
      'thou art this head of gold',
      'another kingdom',
      'fourth kingdom',
      'stone cut out without hands',
      'brake them to pieces',
      'God of heaven set up a kingdom',
    ],
    symbols: [
      'a metal / image-part (= a kingdom)',
      "the stone cut without hands (= God's everlasting kingdom)",
    ],
  },
  {
    key: '03-2300-days',
    part: 'I — The Method & the Time (1816–1840)',
    title: 'The 2300 Days — Daniel 8, the Longest Line',
    scope:
      'Dan 8 walked whole: ram (named Medo-Persia, v20), goat (named Greece, v21), little horn, "unto two thousand and three hundred days; then shall the sanctuary be cleansed" (v14). The angel Gabriel interprets the symbols within the chapter (vv16-26). Establish the year-day principle from Scripture (Num 14:34; Eze 4:6) so the 2300 days = 2300 years — the longest line, reaching to the cleansing. It FLOATS until anchored (next link).',
    terms: [
      'ram which thou sawest',
      'rough goat is the king of Grecia',
      'little horn',
      'two thousand and three hundred days',
      'sanctuary be cleansed',
      'the vision of the evening and the morning',
    ],
    symbols: [
      'the 2300 days (= 2300 years)',
      'year-day principle (Num 14:34; Eze 4:6)',
      'ram (= Medo-Persia)',
      'goat (= Greece)',
    ],
  },
  {
    key: '04-seventy-weeks',
    part: 'I — The Method & the Time (1816–1840)',
    title: 'The Seventy Weeks — Daniel 9 / the 457 BC Anchor',
    scope:
      'Dan 9:24-27 as the anchor "cut off" from the 2300: seventy weeks determined; "from the going forth of the commandment to restore and to build Jerusalem unto the Messiah the Prince" (v25); Messiah cut off in the midst of the 70th week (vv26-27). The decree = Ezra 7 (Artaxerxes, 457 BC). 69 weeks → AD 27 baptism; midst → AD 31 cross; 70th week → AD 34; 457 BC + 2300 = AD 1844. The load-bearing computation that fixes the floating 2300. Show the math from Scripture + the dated decree.',
    terms: [
      'seventy weeks are determined',
      'going forth of the commandment',
      'Messiah the Prince',
      'cut off, but not for himself',
      'midst of the week',
      'confirm the covenant',
    ],
    symbols: [
      'the seventy weeks (= 490 years cut off from the 2300)',
      'the decree to restore (= Ezra 7 / 457 BC, the start-date)',
    ],
  },
  {
    key: '05-eastern-question',
    part: 'I — The Method & the Time (1816–1840)',
    title: 'The Eastern Question — the Year-Day in Revelation 9',
    scope:
      'Rev 9:13-21 walked: the sixth trumpet, four angels loosed from Euphrates, "an hour, and a day, and a month, and a year" (v15) computed by the year-day. The DOCTRINE is the year-day principle applied to a NT prophecy — the same key working in Revelation as in Daniel. The 1840 fulfillment is a single historical anchor sentence (cite at most one pioneer/secular fact for the date); the body is the Scripture computation and the principle.',
    terms: [
      'sixth angel',
      'four angels which are bound',
      'the great river Euphrates',
      'an hour, and a day, and a month, and a year',
      'loosed',
    ],
    symbols: [
      'the sixth trumpet (= a prophetic woe in time)',
      'the year-day confirmed in the New Testament',
    ],
  },
  {
    key: '06-1843-chart',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'Make It Plain Upon Tables — the Vision Written',
    scope:
      'The Scripture principle the 1843 chart embodied: "Write the vision, and make it plain upon tables, that he may run that readeth it. For the vision is yet for an appointed time… though it tarry, wait for it" (Hab 2:2-3). The DOCTRINE: prophecy is meant to be charted and made plain, and it runs to an appointed time. Tie Hab 2 to the chain being made visible. (Optional single confirmation that God directed the charts — capped, after Scripture.)',
    terms: [
      'write the vision',
      'make it plain upon tables',
      'that he may run that readeth it',
      'the vision is yet for an appointed time',
      'though it tarry, wait for it',
    ],
    symbols: [
      'the vision made plain (= the prophetic chain charted)',
      'the appointed time (Hab 2:3)',
    ],
  },
  {
    key: '07-babylon-fallen',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'Babylon Is Fallen — the Second Angel, the Come-Out',
    scope:
      'Rev 14:8 and Rev 18:1-5 walked: "Babylon is fallen… Come out of her, my people." Define Babylon FROM Scripture — confusion/Babel (Gen 11:9), the harlot city (Rev 17:1-6,18), in contrast to the woman = pure church. The second angel\'s message and the call to separation, proven from the texts. Cross-canon: spiritual Babylon vs literal.',
    terms: [
      'Babylon is fallen, is fallen',
      'wine of the wrath of her fornication',
      'come out of her, my people',
      'partakers of her sins',
      'that great city',
    ],
    symbols: [
      'Babylon (= apostate / confused religious power; Gen 11:9; Rev 17)',
      "the second angel's message",
      'woman = church (Jer 6:2; 2 Cor 11:2)',
    ],
  },
  {
    key: '08-midnight-cry',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'The Midnight Cry — the Ten Virgins, the Seventh Month',
    scope:
      'Matt 25:1-13 walked: the ten virgins, "at midnight there was a cry made, Behold, the bridegroom cometh." The DOCTRINE: the parable as the structure of the final advent message — slumber, the cry, the trimming of lamps. Tie the "tenth day of the seventh month" to the Day of Atonement type (Lev 16:29; 23:27-32) by Scripture — the cleansing falls on the antitypical day of atonement. (Karaite reckoning → Oct 22 is one historical anchor sentence.)',
    terms: [
      'ten virgins',
      'at midnight there was a cry',
      'the bridegroom cometh',
      'trimmed their lamps',
      'tenth day of the seventh month',
      'day of atonement',
    ],
    symbols: [
      'the midnight cry (= the final advent proclamation; Matt 25:6)',
      'the tenth day (= the antitypical day of atonement; Lev 16; 23)',
    ],
  },
  {
    key: '09-great-disappointment',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'Though It Tarry — the Tarrying and the Disappointment',
    scope:
      'The Scripture pattern of a delay that is not a failure: Hab 2:3 "though it tarry, wait for it… it will not tarry"; Matt 25:5 "while the bridegroom tarried"; the disciples\' own misread of Christ\'s first advent (Luke 24:21 "we trusted") as the type of a right hope misunderstood. The DOCTRINE: the date was right (Dan 8:14 from 457 BC), the EVENT was misunderstood — vindicated by the next link (Rev 10). (Oct 22, 1844 is the historical anchor.)',
    terms: [
      'though it tarry, wait for it',
      'while the bridegroom tarried',
      'we trusted that it had been he',
      'the vision is for an appointed time',
      'at the end it shall speak',
    ],
    symbols: [
      'the tarrying time (= the appointed delay; Hab 2:3; Matt 25:5)',
      'the disappointment (= right date, misread event)',
    ],
  },
  {
    key: '10-little-book',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'The Little Book Bitter — Revelation 10 Explains 1844',
    scope:
      'Rev 10 walked whole: the mighty angel, the open little book, the oath "that there should be time no longer" (v6), "eat it up… sweet as honey… thy belly bitter" (vv9-10), "thou must prophesy again before many peoples" (v11). The DOCTRINE: Rev 10 is Scripture\'s OWN explanation of the advent movement — Daniel unsealed (Dan 12:4,9), the sweetness of the hope, the bitterness of the delay, the renewed commission. Define the little book from Dan 12 (the sealed book opened).',
    terms: [
      'little book open',
      'time no longer',
      'eat it up',
      'sweet as honey',
      'thy belly bitter',
      'thou must prophesy again',
    ],
    symbols: [
      'the little book (= the unsealed book of Daniel; Dan 12:4,9)',
      'sweet then bitter (= hope then disappointment)',
      'time no longer (= the end of prophetic time-periods)',
    ],
  },
  {
    key: '11-cornfield',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Cleansing of the Sanctuary — the Heavenly Most Holy Place',
    scope:
      'The doctrine Edson\'s insight recovered, proven from Scripture: the sanctuary cleansed (Dan 8:14) is the HEAVENLY sanctuary (Heb 8:1-5; 9:11-12,23-24 — "the patterns… purified… the heavenly things themselves with better sacrifices"). The cleansing = the antitypical Day of Atonement (Lev 16) entering the Most Holy "within the veil" (Heb 6:19-20; 9:3-8). The judgment scene of Dan 7:9-14 ("the judgment was set, and the books were opened") is the same event. Walk Heb 8-9, Lev 16, Dan 7. (Oct 23, 1844 is a one-line anchor.)',
    terms: [
      'the cleansing of the sanctuary',
      'the true tabernacle which the Lord pitched',
      'the heavenly things themselves',
      'within the veil',
      'the judgment was set',
      'the books were opened',
      'the most holy place',
    ],
    symbols: [
      'the heavenly sanctuary (= the true tabernacle; Heb 8:2)',
      'the cleansing (= the antitypical day of atonement; Lev 16; Dan 8:14)',
      'the judgment (= the pre-advent judgment; Dan 7:9-14)',
    ],
  },
  {
    key: '12-sabbath',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Sabbath — the Seal, and the Law in the Most Holy Place',
    scope:
      'The seventh-day Sabbath proven from Scripture: the creation rest (Gen 2:2-3), the fourth commandment (Exo 20:8-11), the sign/seal (Exo 31:13,17; Eze 20:12,20). The ark in the most holy holds the law (Exo 25:16,21; Rev 11:19 "the ark of his testament" seen as the heavenly temple opens) — connecting the Sabbath to the sanctuary link just laid. The Sabbath as the seal of God (Rev 7:2-3; cf. a seal contains name/title/territory — Exo 20:11). Tie to the third angel (next links).',
    terms: [
      'the seventh day is the sabbath',
      'God blessed the seventh day',
      'a sign between me and you',
      'seal of the living God',
      'the ark of his testament',
      'remember the sabbath day',
    ],
    symbols: [
      'the Sabbath (= the sign/seal of the Creator; Exo 31:13; Eze 20:20)',
      'the ark / the law in the most holy place (Exo 25:16; Rev 11:19)',
    ],
  },
  {
    key: '13-three-angels',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Three Angels Assembled — the Threefold Message as One',
    scope:
      'Rev 14:6-12 walked whole: first angel — everlasting gospel, "the hour of his judgment is come," "worship him that made" (the Creator/Sabbath echo); second — Babylon fallen; third — the warning against the beast/mark, ending "Here is the patience of the saints: here are they that keep the commandments of God, and the faith of Jesus." The DOCTRINE: the recovered links (judgment, Babylon, Sabbath/commandments + faith of Jesus) assemble into ONE present-truth message. Define the mark by contrast with the seal (Scripture).',
    terms: [
      'the everlasting gospel',
      'the hour of his judgment is come',
      'worship him that made heaven and earth',
      'if any man worship the beast',
      'the patience of the saints',
      'the commandments of God, and the faith of Jesus',
    ],
    symbols: [
      "the three angels' messages (= the assembled present-truth message; Rev 14:6-12)",
      'the mark of the beast (= the counterfeit of the seal)',
    ],
  },
  {
    key: '14-lesser-light',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Testimony of Jesus — the Spirit of Prophecy in the Remnant',
    scope:
      'The doctrine of the prophetic gift in the remnant, proven from Scripture ALONE (this link especially must NOT lean on EGW about EGW): the remnant "have the testimony of Jesus Christ" (Rev 12:17); "the testimony of Jesus is the spirit of prophecy" (Rev 19:10); gifts set in the church "till we all come" (1 Cor 12:7-11,28; Eph 4:11-13); "despise not prophesyings… prove all things" (1 Thess 5:19-21); the test of a prophet (Deut 13:1-5; Isa 8:20 "to the law and to the testimony"; Matt 7:15-20). Define the gift and its TEST from the Bible; note the gift LEADS but the Bible is the greater light (the lesser-light principle is Scriptural: the testimony points back to "the law and the testimony").',
    terms: [
      'the testimony of Jesus Christ',
      'the spirit of prophecy',
      'despise not prophesyings',
      'to the law and to the testimony',
      'by their fruits ye shall know them',
      'try the spirits',
    ],
    symbols: [
      'the testimony of Jesus (= the spirit of prophecy; Rev 19:10)',
      'the test of the gift (Isa 8:20; Deut 13:1-5; Matt 7:16)',
    ],
  },
  {
    key: '15-remnant-organized',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Remnant — the State of the Dead, the Body, the Church',
    scope:
      'The clustering doctrines that completed the foundation, each from Scripture: conditional immortality / state of the dead — "the dead know not any thing" (Eccl 9:5-6), sleep (Ps 146:4; John 11:11-14; 1 Thess 4:13-16), immortality put on at the resurrection (1 Cor 15:51-54; 1 Tim 6:15-16) — against spiritualism. The body as the temple to be kept (1 Cor 3:16-17; 6:19-20; 3 John 2). Gospel order / the church (1 Cor 14:40 "decently and in order"; Acts 6; Eph 4). The remnant = the commandment-keeping church of Rev 12:17. Keep tight — three Scripture threads converging on the remnant.',
    terms: [
      'the dead know not any thing',
      'his thoughts perish',
      'them which sleep',
      'put on incorruption',
      'your body is the temple',
      'decently and in order',
      'the remnant of her seed',
    ],
    symbols: [
      'the state of the dead (= unconscious sleep until the resurrection; Eccl 9:5; John 11:11)',
      'the remnant (= the commandment-keeping church; Rev 12:17)',
    ],
  },
  {
    key: '16-righteousness-by-faith',
    part: 'IV — The Gospel Root (1888)',
    title: "Righteousness by Faith — the Faith of Jesus, the Chain's Root",
    scope:
      'The gospel root of the third angel\'s message, proven from Scripture: "the just shall live by his faith" (Hab 2:4; Rom 1:17; Gal 3:11; Heb 10:38); righteousness of God by faith (Rom 3:21-26; 4:1-8; 5:1); not of works (Eph 2:8-9; Tit 3:5) yet faith that works by love (Gal 5:6; Jas 2:17-22); Christ our righteousness (1 Cor 1:30; Jer 23:6; 2 Cor 5:21). Tie to "the faith of Jesus" in the third angel (Rev 14:12) — the chain\'s doctrinal root and end. (1888 is the historical anchor.)',
    terms: [
      'the just shall live by his faith',
      'the righteousness of God without the law',
      'being justified freely by his grace',
      'not of works',
      'faith which worketh by love',
      'the Lord our righteousness',
      'the faith of Jesus',
    ],
    symbols: [
      'righteousness by faith (= the gospel root of the third angel; Rom 1:17; Rev 14:12)',
      'the faith of Jesus (Rev 14:12; Gal 2:16)',
    ],
  },
];

// ===========================================================================
// Schemas
// ===========================================================================
const DOSSIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['doctrineLines', 'symbolDefs', 'historyAnchor', 'pioneerUses', 'uncertainties'],
  properties: {
    doctrineLines: {
      type: 'array',
      description: 'the verse-by-verse SCRIPTURE proof, in study order — the body of the section',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'quote', 'gloss'],
        properties: {
          ref: { type: 'string', description: 'a Bible reference (book ch:vv)' },
          quote: {
            type: 'string',
            description: 'verbatim KJV phrase, red-letter markers stripped',
          },
          gloss: { type: 'string' },
        },
      },
    },
    symbolDefs: {
      type: 'array',
      description: 'each symbol defined from SCRIPTURE (receipts must be Bible refs)',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'meaning', 'receipts'],
        properties: {
          symbol: { type: 'string' },
          meaning: { type: 'string' },
          receipts: {
            type: 'array',
            items: { type: 'string' },
            description: 'Bible refs that DEFINE it',
          },
        },
      },
    },
    historyAnchor: {
      type: 'string',
      description:
        'at most ONE sentence locating the link in time (the date/event), or "" if none needed',
    },
    pioneerUses: {
      type: 'array',
      description:
        'every pioneer/EGW ref you propose (should be 0-2). For each: the refcode, the bare fact it supplies, and WHY Scripture cannot supply it. If a symbol/doctrine, it is NOT allowed — drop it.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['refcode', 'fact', 'whyNeeded', 'isHistoricalOrConfirmation'],
        properties: {
          refcode: { type: 'string' },
          fact: {
            type: 'string',
            description: 'the bare historical fact or confirmation, verbatim quote if used',
          },
          whyNeeded: { type: 'string' },
          isHistoricalOrConfirmation: { type: 'string', enum: ['historical-fact', 'confirmation'] },
        },
      },
    },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
};

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'verdict',
    'bibleFirstOk',
    'symbolsAllBibleDefined',
    'pioneerOveruse',
    'quoteChecks',
    'refuted',
    'gaps',
  ],
  properties: {
    verdict: { type: 'string', enum: ['mostly-sound', 'mixed', 'mostly-flawed'] },
    bibleFirstOk: {
      type: 'boolean',
      description: 'true if NO doctrine/symbol rests primarily on a pioneer/EGW source',
    },
    symbolsAllBibleDefined: {
      type: 'boolean',
      description: 'true if every symbol is defined from Scripture receipts',
    },
    pioneerOveruse: {
      type: 'array',
      description:
        'every pioneer/EGW use that is NOT a bare historical fact or capped confirmation — these must be removed',
      items: { type: 'string' },
    },
    quoteChecks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'status'],
        properties: {
          ref: { type: 'string' },
          status: { type: 'string', description: 'verified | misquoted | ref-wrong | not-found' },
        },
      },
    },
    refuted: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'why'],
        properties: { claim: { type: 'string' }, why: { type: 'string' } },
      },
    },
    gaps: {
      type: 'array',
      items: { type: 'string' },
      description: 'missing load-bearing verses, undefined symbols, weak chain links',
    },
  },
};

// ===========================================================================
// Per-section pipeline: 2 scripture researchers → cross-review → opus synth → save
// ===========================================================================
phase('Research');

const built = await pipeline(
  SECTIONS,

  // Stage 1: dual independent SCRIPTURE research (two angles, both Bible-first)
  (s) =>
    parallel([
      () =>
        agent(
          `You are RESEARCHER A (EXPOSITION-FORWARD) for the BIBLE-ONLY handbook link "${s.title}".
Walk the primary passage(s) verse-by-verse and build the SCRIPTURE proof of this link's doctrine. Quote KJV verbatim. Let the Bible interpret itself — where the chapter names its own symbols, cite that; where it does not, find the cross-canon verse that defines the figure.
LINK SCOPE: ${s.scope}
DOCTRINE TERMS to gather (KJV phrases): ${s.terms.join(', ')}
SYMBOLS this link owns (define from Scripture): ${s.symbols.join(', ')}
${SOURCE_CONTRACT}
Drive the verse tool yourself. Propose pioneer/EGW uses ONLY for a bare historical date/fact (0-2 max), never for doctrine. Your final message IS the structured dossier.`,
          {
            label: `research-A:${s.key}`,
            phase: 'Research',
            schema: DOSSIER_SCHEMA,
            agentType: 'general-purpose',
          },
        ),
      () =>
        agent(
          `You are RESEARCHER B (CROSS-CANON-FORWARD) for the BIBLE-ONLY handbook link "${s.title}".
Your focus is SYMBOL DEFINITION FROM SCRIPTURE: for every figure in this link, find where the Bible defines its own symbol (same verse, same chapter, or another book) and assemble those receipts. Then supply the supporting verse→gloss chain for the doctrine. Quote KJV verbatim.
LINK SCOPE: ${s.scope}
DOCTRINE TERMS to gather (KJV phrases): ${s.terms.join(', ')}
SYMBOLS this link owns (define from Scripture): ${s.symbols.join(', ')}
${SOURCE_CONTRACT}
NEVER let a pioneer/EGW source define a symbol — that is the whole point of this rewrite. Propose pioneer uses ONLY for a bare historical fact (0-2 max). Your final message IS the structured dossier.`,
          {
            label: `research-B:${s.key}`,
            phase: 'Research',
            schema: DOSSIER_SCHEMA,
            agentType: 'general-purpose',
          },
        ),
    ]),

  // Stage 2: adversarial Bible-first cross-review
  (dossiers, s) => {
    const [a, b] = dossiers;
    return agent(
      `You are an ADVERSARIAL BIBLE-FIRST REVIEWER for the link "${s.title}". Two researchers produced the dossiers below. REFUTE, don't rubber-stamp.
Verify EVERY KJV quote with: bun run packages/cli/src/main.ts verse "REF" --json (flag misquotes). Verify any proposed pioneer/EGW refcode with: bible egw "REF".
ENFORCE THE CORE RULE: every symbol must be defined from SCRIPTURE; NO doctrine may rest primarily on a pioneer/EGW source. List in pioneerOveruse any pioneer use that is more than a bare historical fact or a single capped confirmation-after-Scripture. Check that load-bearing verses are present and the chain link actually holds.
${SOURCE_CONTRACT}
### DOSSIER A (exposition-forward):
${a ? JSON.stringify(a) : '(researcher A failed — note as a gap)'}
### DOSSIER B (cross-canon-forward):
${b ? JSON.stringify(b) : '(researcher B failed — note as a gap)'}
Verify hard. Your final message IS the structured review.`,
      {
        label: `review:${s.key}`,
        phase: 'Cross-Review',
        schema: REVIEW_SCHEMA,
        agentType: 'general-purpose',
      },
    ).then((review) => ({ s, a, b, review }));
  },

  // Stage 3: opus synthesizer writes the lean Bible-only section + saves to disk
  async (bundle, s, i) => {
    const { a, b, review } = bundle;
    const md = await agent(
      `You are the OPUS SYNTHESIZER writing BIBLE-ONLY handbook link ${i + 1}, "${s.title}", Part ${s.part}.
Write the FINAL section markdown in exact handbook style but PURE BIBLE STUDY in substance: the doctrine is proven from Scripture, every symbol defined from Scripture, NO historical-discovery narrative. Use ONLY claims that survived the adversarial review. OBEY the review's pioneerOveruse list — REMOVE every pioneer/EGW use it flagged. Keep at most 0-2 pioneer/EGW references, and only for a bare historical date/fact or a single confirmation placed AFTER Scripture has carried the point (label it a confirmation). Drop any KJV quote the review marked misquoted/wrong/not-found.
${STYLE_CONTRACT}
Output ONLY the section: start with "## ${s.title}" (no Part header — assembly adds parts), the ">" thesis line, the Scripture-walked body with ref→gloss and inline **symbol** = meaning defs (Bible receipts), then "**DEFINITION — ...**", "**Symbols defined here:**", and "**Symbols carried:**". No preamble, no code fences.

### DOSSIER A:
${a ? JSON.stringify(a) : '(none)'}
### DOSSIER B:
${b ? JSON.stringify(b) : '(none)'}
### ADVERSARIAL REVIEW (authoritative — obey it, especially pioneerOveruse):
${JSON.stringify(review)}

Your final message IS the section markdown.`,
      { label: `synth:${s.key}`, phase: 'Synthesize', model: 'opus', agentType: 'general-purpose' },
    );
    await agent(
      `Write this exact content to the file ${SECTIONS_DIR}/${s.key}.md using the Write tool, then reply "written ${s.key}". Content between the markers, exclusive:\n<<<BEGIN>>>\n${md}\n<<<END>>>`,
      { label: `save:${s.key}`, phase: 'Synthesize', agentType: 'general-purpose' },
    );
    return { key: s.key, title: s.title, part: s.part, order: i + 1, markdown: md, review };
  },
);

const sections = built
  .filter(Boolean)
  .filter((x) => x.markdown && x.markdown.trim().includes('## '));
log(`Built ${sections.length}/16 Bible-only sections.`);

// ===========================================================================
// Aggregate
// ===========================================================================
phase('Aggregate');

const orderedSections = sections.sort((x, y) => x.order - y.order);
const bodyForAgg = orderedSections
  .map((s) => `<<<SECTION ${s.order} | part=${s.part} | title=${s.title}>>>\n${s.markdown.trim()}`)
  .join('\n\n');

const handbook = await agent(
  `You are the OPUS AGGREGATOR assembling "The Chain of Truth — A Bible-Only Handbook Study". Stitch the 16 finished Bible-only sections into ONE handbook file matching the templates' SHAPE (${TEMPLATE_RBF}, ${TEMPLATE_DR}). Read a template first.

Produce, in order:
1. YAML front matter: created_at '2026-06-20T12:00:00Z', topic 'The Chain of Truth — A Bible-Only Handbook Study'.
2. "# The Chain of Truth — A Bible-Only Handbook Study"
3. **Thesis.** paragraph — "The key opens the casket": the method of comparing Scripture with Scripture (the Bible its own interpreter) is the key that opens the whole casket of prophetic truth; this handbook walks the same chain 1816→1888 but proves every link FROM SCRIPTURE ALONE — the key working on the Bible by itself.
4. **Method.** paragraph — after Haskell's Bible Handbook: ref→gloss; every symbol defined from Scripture (the Bible defines its own figures — Miller's Rule); historicism, year-day; pioneer/EGW writings appear only rarely, for a bare historical date or a single confirmation after Scripture has carried the point, never as the proof of a doctrine.
5. "## Table of Contents" with the four Parts and the 16 numbered titles (parts I, II, III, IV from the part= labels).
6. The four Part headers ("# Part I — The Method & the Time (1816–1840)", etc.) with their sections under each, RENUMBERED 1..16 in order. Preserve each section body VERBATIM; only fix the heading number and place under the right Part.
7. "## Appendix — Symbol Dictionary" — gather EVERY "Symbols defined here" entry from all sections into one alphabetical list (leading articles ignored), each: "**symbol** = meaning (Bible receipts). — defined in \\"TITLE\\"."

Do not invent content; only stitch, renumber, write front matter/thesis/method/TOC, and build the appendix. Output ONLY the full handbook markdown, no code fences, no preamble.

### THE 16 SECTIONS (in order):
${bodyForAgg}`,
  { label: 'aggregate', phase: 'Aggregate', model: 'opus', agentType: 'general-purpose' },
);

await agent(
  `Write this exact content to ${OUT} using the Write tool, then reply "written handbook". Content between markers, exclusive:\n<<<BEGIN>>>\n${handbook}\n<<<END>>>`,
  { label: 'save-handbook', phase: 'Aggregate', agentType: 'general-purpose' },
);

// ===========================================================================
// Verify
// ===========================================================================
phase('Verify');

const [refcodeReport, coherenceReport] = await Promise.all([
  agent(
    `You are the VERIFIER. Read the finished handbook at ${OUT}.
1. Extract EVERY pioneer/EGW refcode (italic ALLCAPS code + number, e.g. GC 329.2 — NOT bare Bible verses). For each run \`bible egw "REF"\` and confirm the paragraph exists and contains the quoted words. Also COUNT them and list which section each is in — the design target is at most ~0-2 per section and ONLY historical/confirmation, so FLAG any section that exceeds this or uses a pioneer ref to prove doctrine.
2. Spot-check 20-30 KJV verse quotes via \`bun run packages/cli/src/main.ts verse "REF" --json\` — confirm the quoted phrase is actually in the verse.
Repo root: ${REPO}. Final message: total Bible refs (approx), total pioneer refs + per-section counts, any FAIL (ref→problem), and any section that violates the Bible-only design.`,
    { label: 'verify:refcodes', phase: 'Verify', agentType: 'general-purpose' },
  ),
  agent(
    `You are the ADVERSARIAL COHERENCE READER. Read the whole finished handbook at ${OUT} end to end. Judge: (1) does the chain hold link-to-link 1816→1888? (2) internal CONTRADICTIONS (a symbol defined two ways, a date stated differently)? (3) template DRIFT — missing ">" thesis, DEFINITION closer, or symbol machinery; stray [CHAIN] markers; narrative that should have been dropped. (4) Is it genuinely BIBLE-FIRST — is any symbol or doctrine actually resting on a pioneer/EGW source rather than Scripture? Name every instance. (5) does "the key opens the casket" land across the whole as a Scripture-only argument? Report concrete issues with section names + a fix for each.
Repo root: ${REPO}. Final message: a prioritized issues list.`,
    { label: 'verify:coherence', phase: 'Verify', agentType: 'general-purpose' },
  ),
]);

return {
  sectionsBuilt: sections.length,
  handbookPath: OUT,
  refcodeReport,
  coherenceReport,
  perSectionReviews: orderedSections.map((s) => ({
    title: s.title,
    verdict: s.review?.verdict,
    bibleFirstOk: s.review?.bibleFirstOk,
  })),
};
