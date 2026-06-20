export const meta = {
  name: 'chain-of-truth-handbook',
  description:
    'Build "The Chain of Truth" Bible Handbook: 16 chronological links (1816→1888), full dual-research → adversarial cross-review → opus synthesis per section, opus aggregator, then full machine re-verify + adversarial coherence read',
  whenToUse:
    'Generate the Chain of Truth handbook — how the SDA pioneer message came to be, step by step, equal narrative + doctrine, handbook style',
  phases: [
    {
      title: 'Research',
      detail:
        'two independent researchers per section drive the CLI (doctrine) + agent-browser/web (history)',
    },
    {
      title: 'Cross-Review',
      detail: "each section's two dossiers adversarially cross-reviewed, quotes + dates verified",
    },
    {
      title: 'Synthesize',
      detail: 'opus writes each section in exact handbook style from the reviewed dossiers',
    },
    {
      title: 'Aggregate',
      detail: 'opus stitches all 16 + front matter + TOC + Symbol Dictionary appendix',
    },
    {
      title: 'Verify',
      detail:
        'machine re-verify every refcode in the finished handbook + adversarial coherence read',
    },
  ],
};

// ===========================================================================
// Paths
// ===========================================================================
const REPO = '/Users/cvr/Developer/personal/bible-tools';
const DIR = `${REPO}/packages/cli/outputs/studies/chain-of-truth`;
const SECTIONS_DIR = `${DIR}/sections`;
const TEMPLATE_DR = `${REPO}/packages/cli/outputs/studies/2026-06-10-daniel-and-the-revelation-a-bible-handbook-study.md`;
const TEMPLATE_RBF = `${REPO}/packages/cli/outputs/studies/2026-06-17-righteousness-by-faith-a-bible-handbook-study.md`;
const OUT = `${REPO}/packages/cli/outputs/studies/2026-06-19-the-chain-of-truth-a-bible-handbook-study.md`;

// ===========================================================================
// Shared contracts handed to agents verbatim
// ===========================================================================

const SOURCE_CONTRACT = `
## How to pull sources (DO NOT paraphrase from memory; NEVER invent a refcode)

Repo root: ${REPO}. The \`bible\` CLI is on PATH; local lookups need NO auth.

DOCTRINE / PIONEER / EGW (local SQLite, 609 books installed):
- \`bible egw search "phrase" --limit 8\`            locate a refcode by full-text (try several phrasings; FTS is near-exact)
- \`bible egw search "phrase" --book DAR --limit 8\` scope to one book code
- \`bible egw "DAR 192.1"\`                           read an exact paragraph (VERIFY it says what you claim before citing)
- \`bible egw "MWV1 46"\`                             read a full page
AVOID hyphenated/quoted operator tokens in search (e.g. "twenty-three", "457-bc") — the FTS parser trips on them; use plain words.

KJV VERSE TEXT (authoritative — quote exactly):
- \`bun run packages/cli/src/main.ts verse "Daniel 8:14" --json\`   (parse .verses[]; avoid commas in the ref — use ranges)

HISTORY (dates, events, periodicals, who/when):
1. PREFER a primary-corpus source with a real refcode (see source map below).
2. Where the corpus is thin, use the agent-browser skill or web search for a SECULAR/EXTERNAL source, and CITE IT EXPLICITLY (name the source + URL). A date with no traceable source is FLAGGED, not asserted.

## Source map (all installed unless marked external)
HISTORICAL NARRATIVE BACKBONE:
- MWM — Bliss, Memoirs of William Miller (the standard life)
- SLWM — James White, Sketches of the Christian Life & Public Labors of William Miller
- WMAD — Miller's Apology and Defence (autobiographical)
- GSAM — Loughborough, The Great Second Advent Movement (movement chronicle)
- GC / GC88 — White, The Great Controversy ch. 17-23 (the Millerite backbone)
- EW — White, Early Writings · LS/LS80/LS88/LSMS — Life Sketches
DOCTRINE CARRIERS:
- MWV1/MWV2/MWV3, MRSH, LJHCS — William Miller
- DAR (3555 paras) / DAR1909 / SYNPT — Uriah Smith (Daniel & Revelation; backbone exposition)
- PREX1/PREX2 — Josiah Litch (Prophetic Expositions; the 1840 Ottoman/Rev 9 argument)
- TSAM — Apollos Hale (Second Advent Manual) · TRMC — The True Midnight Cry (Snow, 1844)
- HSFD — J.N. Andrews (History of the Sabbath) · WLF — A Word to the Little Flock (1847)
- DS — The Day-Star (Crosier 1846 sanctuary article — verify coverage) · PT/PrT — The Present Truth
- BMD/BMDN — Brother Miller's Dream (the casket/key allegory)
- For the Sabbath (Bates) + 1888 (Jones/Waggoner): search by topic across the corpus; Jones=GEP/TTR/ECE/PTUK, Waggoner books may need external.

## Canonical facts (from the project glossary — use these names/dates; verify against a source where you cite them)
- Great Disappointment = Oct 22, 1844 (NEVER "failed prediction" — the DATE was right, the EVENT misunderstood).
- Litch's Ottoman prediction vindicated Aug 11, 1840. · 1843 Fitch–Hale chart. · Exeter camp meeting Aug 1844 (Snow's True Midnight Cry).
- Cornfield: Hiram Edson, morning of Oct 23, 1844. · Crosier's Day-Star Extra Feb 7, 1846. · Bates' Seventh Day Sabbath pamphlet 1846.
- SDA organization May 21, 1863, Battle Creek. · 1888 Minneapolis GC: Jones & Waggoner, righteousness by faith.
`;

const STYLE_CONTRACT = `
## STYLE CONTRACT — copy the two template handbooks EXACTLY
Templates (the ONLY format reference): ${TEMPLATE_RBF} and ${TEMPLATE_DR}. Read one before writing.

- After Haskell's Bible Handbook: every doctrinal line is **ref → gloss**, Bible and pioneer/EGW alike. SCANNABLE.
- Section opens with a one-line ">" blockquote thesis for that section.
- Walk the material. The FIRST time a symbol/term appears, define it inline:
  "  - **symbol** = meaning (_Receipt 1_; _Receipt 2_)." — let the Bible define its own figures.
- Verse→gloss line: "- _Dan. 8:14._ \\"Unto two thousand and three hundred days...\\" — one-line gloss."
- Pioneer/EGW line:  "- _DAR 192.1._ Smith: \\"...short verbatim quote...\\" — one-line gloss."
- Italicize refs (_Dan. 8:14_, _MWV1 46.2_, _GC 324.3_). Quote KJV/pioneer phrases in double quotes.
- EQUAL NARRATIVE + DOCTRINE: roughly half the section is the HISTORICAL STORY of the discovery
  (who/when/where, with dated primary-source or cited secular receipts), woven as readable prose +
  ref→gloss; the other half is the DOCTRINAL proof walked verse-by-verse. History is the thread; doctrine the substance.
- Section CLOSES with a bold "**DEFINITION — TITLE =** ..." paragraph summarizing what the section built,
  then "**Symbols defined here:**" (bullets) and "**Symbols carried:**" referencing the OWNING section by exact TITLE.
- Cross-reference other sections by exact TITLE in quotes, e.g. (see "The Seventy Weeks — Daniel 9 / the 457 BC Anchor"). NEVER by number.
- NO [CHAIN] / [KEY] / marker machinery — the handbook format does not use them.
- Tone: dense, reverent, evidence-first. No filler, no "in this section we will".
- Thesis of the whole handbook: "The key opens the casket" — Miller's method (compare Scripture with
  Scripture; the Bible its own interpreter) is the key that opened the whole casket of advent truth; every
  later link was drawn by the same key. Let each section feel like one bead drawn out by that key.
`;

// ===========================================================================
// The 16-link spine. key = stable id; title = exact heading; part; scope; the
// doctrinal terms to gather; the symbols this section OWNS.
// ===========================================================================
const SECTIONS = [
  {
    key: '01-casket-key',
    part: 'I — The Method & the Time (1816–1840)',
    title: "The Casket & the Key — Miller's Method",
    scope:
      'Miller 1782-1849: deist→Baptist conversion 1816; 2 yrs reading Genesis→Revelation comparing scripture with scripture; the 14 Rules; "the Bible its own interpreter"; Brother Miller\'s Dream (casket=advent truths, key=his method, jewels in order). The method is link zero — the key that opens everything.',
    terms: [
      'compare scripture with scripture',
      'lay aside',
      'its own interpreter',
      'manner of prophesying',
      'figures and metaphors',
      'casket',
      'key',
    ],
    symbols: ['the casket (= the advent truths)', 'the key (= the method)', 'present truth'],
  },

  {
    key: '02-great-image',
    part: 'I — The Method & the Time (1816–1840)',
    title: 'The Great Image — Daniel 2, the Spine of History',
    scope:
      "Dan 2 image: gold/silver/brass/iron/iron+clay = Babylon, Medo-Persia, Greece, Rome, divided Rome; the stone cut without hands = Christ's kingdom. The angel names the symbols. This is the structural spine the whole chain hangs on; Dan 2,7,8 are one prophecy.",
    terms: [
      'head of gold',
      'breast of silver',
      'kingdom inferior',
      'stone cut out',
      'four kingdoms',
      'image',
    ],
    symbols: [
      'a metal / image part (= a kingdom)',
      "the stone cut without hands (= Christ's kingdom)",
    ],
  },

  {
    key: '03-2300-days',
    part: 'I — The Method & the Time (1816–1840)',
    title: 'The 2300 Days — Daniel 8, the Longest Line',
    scope:
      'Dan 8 ram=Medo-Persia, goat=Greece, little horn=Rome; "unto 2300 days then shall the sanctuary be cleansed"; year-day (Num 14:34; Eze 4:6) makes it 2300 years — the longest prophetic line, reaching to the advent. It FLOATS until anchored (next section).',
    terms: [
      'two thousand and three hundred days',
      'sanctuary be cleansed',
      'ram',
      'he goat',
      'little horn',
      'vision of the evening',
    ],
    symbols: ['the 2300 days (= 2300 years)', 'year-day principle', 'the daily (briefly)'],
  },

  {
    key: '04-seventy-weeks',
    part: 'I — The Method & the Time (1816–1840)',
    title: 'The Seventy Weeks — Daniel 9 / the 457 BC Anchor',
    scope:
      'Dan 9:24-27 seventy weeks "cut off" from the 2300; dated from the decree to restore Jerusalem (Ezra 7 / Artaxerxes, 457 BC); 69 wks to Messiah, cross in the midst, 70th wk ends AD 34; 457 BC + 2300 = 1844. The load-bearing anchor that fixes the floating 2300.',
    terms: [
      'seventy weeks',
      'determined',
      'commandment to restore',
      'Messiah the Prince',
      'midst of the week',
      'seal up the vision',
    ],
    symbols: [
      'the seventy weeks (= 490 years cut off)',
      'the 457 BC decree (= the start of the 2300)',
    ],
  },

  {
    key: '05-eastern-question',
    part: 'I — The Method & the Time (1816–1840)',
    title: 'The Eastern Question — Litch & the 1840 Vindication',
    scope:
      'Litch applies year-day to Rev 9:13-21 (the sixth trumpet / Ottoman); predicts the fall of Ottoman independence by Aug 11, 1840; the Sultan accepts European protection that day; the public vindication of the year-day method that swelled the movement.',
    terms: [
      'hour and a day and a month',
      'four angels',
      'loosed',
      'Euphrates',
      'sixth angel',
      'Ottoman',
    ],
    symbols: ['the sixth trumpet (= the Ottoman woe)', 'the year-day vindicated'],
  },

  {
    key: '06-1843-chart',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'The 1843 Chart — Fitch & Hale',
    scope:
      'Fitch & Hale\'s 1843 prophetic chart visualizing Dan 2,7,8-9 and Rev 13; "make it plain upon tables" (Hab 2:2-3); how the chart taught the chain to the movement; EGW later affirmed God directed the charts (EW 74).',
    terms: [
      'make it plain',
      'write the vision',
      'tables',
      'the vision is yet for an appointed time',
      'chart',
    ],
    symbols: ['the chart (= the vision made plain)'],
  },

  {
    key: '07-babylon-fallen',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'Babylon Is Fallen — the Second Angel, the Come-Out',
    scope:
      'Fitch\'s 1843 "Come out of her my people"; the second angel of Rev 14:8 / Rev 18:1-4; Babylon = apostate Christendom rejecting the advent; the call to separate from the churches that shut the door on the message.',
    terms: [
      'Babylon is fallen',
      'come out of her',
      'my people',
      'second angel',
      'wine of the wrath',
    ],
    symbols: ['Babylon (= apostate Christendom)', "the second angel's message"],
  },

  {
    key: '08-midnight-cry',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'The Midnight Cry — Snow, Exeter, the Seventh Month',
    scope:
      'Snow\'s "true midnight cry": the cleansing falls on the tenth day of the seventh month (Karaite) = Oct 22, 1844; the Exeter camp meeting Aug 1844; the parable of the ten virgins (Matt 25) "at midnight a cry"; the movement\'s final, swelling phase.',
    terms: [
      'at midnight there was a cry',
      'ten virgins',
      'tenth day of the seventh month',
      'bridegroom cometh',
      'tarried',
    ],
    symbols: [
      'the midnight cry (= the seventh-month message)',
      'the tenth day (= the day of atonement type)',
    ],
  },

  {
    key: '09-great-disappointment',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'The Tarrying & the Great Disappointment — October 22',
    scope:
      'The first disappointment (spring 1844); the tarrying time; Oct 22 passes and Christ does not come; the bitter Great Disappointment. The DATE was right (Dan 8:14 from 457 BC); the EVENT was misunderstood. Hab 2:3 "though it tarry, wait for it."',
    terms: [
      'though it tarry',
      'wait for it',
      'the vision is for an appointed time',
      'disappointment',
      'tarrying',
    ],
    symbols: ['the tarrying time', 'the Great Disappointment (= right date, misread event)'],
  },

  {
    key: '10-little-book',
    part: 'II — The Cry & the Disappointment (1840–1844)',
    title: 'The Little Book Bitter — Revelation 10 Explains 1844',
    scope:
      'Rev 10: the mighty angel, the open little book, "eat it up... sweet as honey... thy belly bitter"; the oath "time no longer"; "thou must prophesy again." Rev 10 is the inspired explanation of the Advent movement and the Disappointment — sweet hope, bitter delay, renewed mission.',
    terms: [
      'little book open',
      'eat it up',
      'sweet as honey',
      'belly bitter',
      'time no longer',
      'prophesy again',
    ],
    symbols: [
      'the little book (= Daniel unsealed / the advent message)',
      'sweet then bitter (= hope then disappointment)',
      'time no longer (= end of prophetic time)',
    ],
  },

  {
    key: '11-cornfield',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Cornfield — Edson, Crosier, the Heavenly Sanctuary',
    scope:
      "Edson's cornfield insight Oct 23, 1844: Christ entered the MOST HOLY PLACE of the HEAVENLY sanctuary Oct 22 — not the earthly second coming; Crosier's Day-Star Extra (Feb 7, 1846) systematizes it; Heb 8-9, Lev 16 day of atonement; the investigative/pre-advent judgment (Dan 7:9-14). THE distinctive recovery.",
    terms: [
      'cleansing of the sanctuary',
      'most holy place',
      'day of atonement',
      'within the veil',
      'judgment was set',
      'books were opened',
    ],
    symbols: [
      'the heavenly sanctuary',
      'the cleansing (= the antitypical day of atonement)',
      'the investigative judgment',
    ],
  },

  {
    key: '12-sabbath',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Sabbath — Bates, the Seal, the Most Holy Place',
    scope:
      'Bates (via Rachel Oakes Preston) recovers the seventh-day Sabbath; his 1846 Seventh Day Sabbath pamphlet; the ark in the most holy holds the law with the Sabbath at its heart (Rev 11:19); the Sabbath as the seal of God (Rev 7; Eze 20:12,20); tied to the third angel.',
    terms: [
      'remember the sabbath day',
      'seal of God',
      'seventh day',
      'commandments of God',
      'ark of his testament',
      'sign between me',
    ],
    symbols: ['the Sabbath (= the seal of God)', 'the ark / the law in the most holy'],
  },

  {
    key: '13-three-angels',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Three Angels Assembled — the Threefold Message as One',
    scope:
      'Rev 14:6-12: first angel (hour of judgment / everlasting gospel), second (Babylon fallen), third (the mark / the warning + "the patience of the saints, the commandments of God and the faith of Jesus"). The three recovered links assemble into one present-truth message to the world.',
    terms: [
      'everlasting gospel',
      'hour of his judgment',
      'worship him that made',
      'mark of the beast',
      'patience of the saints',
      'commandments of God and the faith',
    ],
    symbols: [
      "the three angels' messages (= the present-truth message assembled)",
      'the mark of the beast',
    ],
  },

  {
    key: '14-lesser-light',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Lesser Light — the Gift of Prophecy Confirmed',
    scope:
      "Ellen Harmon's first vision Dec 1844 confirming the advent path; the testimony of Jesus = the spirit of prophecy (Rev 12:17; 19:10; 1 Cor 1; Joel 2); the lesser light pointing to the greater (the Bible); the gift confirmed the pillars without imposing them.",
    terms: [
      'testimony of Jesus',
      'spirit of prophecy',
      'pour out my spirit',
      'sons and daughters shall prophesy',
      'despise not prophesyings',
      'gifts',
    ],
    symbols: ['the testimony of Jesus (= the spirit of prophecy)', 'the lesser light'],
  },

  {
    key: '15-remnant-organized',
    part: 'III — The Foundations Laid (1844–1863)',
    title: 'The Remnant Organized — the State of the Dead, Health, 1863',
    scope:
      'The clustering truths that completed the foundation: conditional immortality / state of the dead (the dead know not anything; sleep) vs spiritualism; health/temperance as part of the message; gospel order and the formal organization May 21, 1863 as the remnant of Rev 12:17. Keep tight — three threads converging on the organized remnant.',
    terms: [
      'the dead know not',
      'sleep',
      'corruptible put on incorruption',
      'your body is the temple',
      'remnant of her seed',
      'decently and in order',
    ],
    symbols: [
      'the state of the dead (= sleep until the resurrection)',
      'the remnant (= the organized commandment-keeping church)',
    ],
  },

  {
    key: '16-righteousness-by-faith',
    part: 'IV — The Gospel Root (1888)',
    title: "Righteousness by Faith — 1888, Jones & Waggoner, the Chain's End",
    scope:
      "1888 Minneapolis GC: Jones & Waggoner present righteousness by faith as the gospel root of the third angel's message; EGW endorses; much leadership resists. The chain's end: the foundation complete, the gospel heart of it recovered, Philadelphia→Laodicea transition. The faith of Jesus (Rev 14:12) made central.",
    terms: [
      'the just shall live by faith',
      'righteousness of God',
      'faith of Jesus',
      'the law and the gospel',
      'Christ our righteousness',
      'most precious message',
    ],
    symbols: [
      'righteousness by faith (= the gospel root of the third angel)',
      'the faith of Jesus',
    ],
  },
];

// ===========================================================================
// Schemas
// ===========================================================================
const DOSSIER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'historyBeats',
    'doctrineLines',
    'symbolDefs',
    'keyQuotes',
    'historySources',
    'uncertainties',
  ],
  properties: {
    historyBeats: {
      type: 'array',
      description: 'the historical story of this discovery, in order',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['when', 'what', 'source'],
        properties: {
          when: { type: 'string' },
          what: { type: 'string' },
          source: { type: 'string', description: 'refcode OR named secular source+URL' },
        },
      },
    },
    doctrineLines: {
      type: 'array',
      description: 'verse→gloss doctrinal chain',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'quote', 'gloss'],
        properties: {
          ref: { type: 'string' },
          quote: { type: 'string', description: 'verbatim KJV/pioneer phrase' },
          gloss: { type: 'string' },
        },
      },
    },
    symbolDefs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'meaning', 'receipts'],
        properties: {
          symbol: { type: 'string' },
          meaning: { type: 'string' },
          receipts: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    keyQuotes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['refcode', 'quote'],
        properties: {
          refcode: { type: 'string' },
          quote: { type: 'string', description: 'verbatim, <=400 chars' },
        },
      },
    },
    historySources: {
      type: 'array',
      items: { type: 'string' },
      description: 'every secular/external source used, named with URL',
    },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
};

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'confirmed', 'refuted', 'quoteChecks', 'dateChecks', 'gaps'],
  properties: {
    verdict: { type: 'string', enum: ['mostly-sound', 'mixed', 'mostly-flawed'] },
    confirmed: { type: 'array', items: { type: 'string' } },
    refuted: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'why'],
        properties: { claim: { type: 'string' }, why: { type: 'string' } },
      },
    },
    quoteChecks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['refcode', 'status'],
        properties: {
          refcode: { type: 'string' },
          status: {
            type: 'string',
            description: 'verified | misquoted | refcode-wrong | not-found',
          },
        },
      },
    },
    dateChecks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['claim', 'status'],
        properties: {
          claim: { type: 'string' },
          status: { type: 'string', description: 'sourced | unsourced | wrong' },
        },
      },
    },
    gaps: {
      type: 'array',
      items: { type: 'string' },
      description: 'missing beats, undefined symbols, weak links',
    },
  },
};

// ===========================================================================
// Per-section pipeline: 2 researchers → cross-review → opus synthesis → write file
// ===========================================================================
phase('Research');

const built = await pipeline(
  SECTIONS,

  // Stage 1: dual independent research (two angles, both drive CLI + history tools)
  (s) =>
    parallel([
      () =>
        agent(
          `You are RESEARCHER A (HISTORY-FORWARD) for the handbook section "${s.title}".
Reconstruct the HISTORICAL STORY of this discovery first — who, when, where, which periodical, what happened — grounded in primary corpus sources (MWM, SLWM, WMAD, GSAM, GC, Life Sketches) with real refcodes, AND secular/external sources via the agent-browser skill or web where the corpus is thin (cite them explicitly with URLs). Then gather the doctrinal verse→gloss chain that the moment recovered.
SECTION SCOPE: ${s.scope}
DOCTRINE TERMS to gather: ${s.terms.join(', ')}
SYMBOLS this section owns: ${s.symbols.join(', ')}
${SOURCE_CONTRACT}
Drive the tools yourself. Quote verbatim. Every history beat needs a dated source; every doctrine line a verified refcode. Your final message IS the structured dossier.`,
          {
            label: `research-A:${s.key}`,
            phase: 'Research',
            schema: DOSSIER_SCHEMA,
            agentType: 'general-purpose',
          },
        ),
      () =>
        agent(
          `You are RESEARCHER B (DOCTRINE-FORWARD) for the handbook section "${s.title}".
Reconstruct the DOCTRINAL PROOF first — walk the Scripture verse-by-verse and let the Bible define its own figures, gathering pioneer/EGW receipts (DAR, MWV1-3, PREX1-2, TSAM, HSFD, EW, GC) with verified refcodes. Then supply the historical beats that anchor when/how this truth was recovered, from primary sources, plus secular/external (agent-browser/web, cited) where needed.
SECTION SCOPE: ${s.scope}
DOCTRINE TERMS to gather: ${s.terms.join(', ')}
SYMBOLS this section owns: ${s.symbols.join(', ')}
${SOURCE_CONTRACT}
Drive the tools yourself. Quote verbatim. NEVER invent a refcode — verify each says what you claim. Your final message IS the structured dossier.`,
          {
            label: `research-B:${s.key}`,
            phase: 'Research',
            schema: DOSSIER_SCHEMA,
            agentType: 'general-purpose',
          },
        ),
    ]),

  // Stage 2: adversarial cross-review — verify every quote/date against the tools
  (dossiers, s) => {
    const [a, b] = dossiers;
    return agent(
      `You are an ADVERSARIAL CROSS-REVIEWER for the handbook section "${s.title}". Two researchers produced the dossiers below. REFUTE, don't rubber-stamp. Independently verify EVERY refcode (\`bible egw "REF"\`) and EVERY KJV quote (\`bun run packages/cli/src/main.ts verse "REF" --json\`) and EVERY history date (primary source or cited secular — check it actually supports the claim). Flag misquotes, wrong refcodes, unsourced dates, missing beats, undefined symbols, mis-orderings.
${SOURCE_CONTRACT}
### DOSSIER A (history-forward):
${a ? JSON.stringify(a) : '(researcher A failed — note this as a gap)'}
### DOSSIER B (doctrine-forward):
${b ? JSON.stringify(b) : '(researcher B failed — note this as a gap)'}
Verify hard. Your final message IS the structured review.`,
      {
        label: `review:${s.key}`,
        phase: 'Cross-Review',
        schema: REVIEW_SCHEMA,
        agentType: 'general-purpose',
      },
    ).then((review) => ({ s, a, b, review }));
  },

  // Stage 3: opus synthesizer writes the section markdown to its file
  async (bundle, s, i) => {
    const { a, b, review } = bundle;
    const md = await agent(
      `You are the OPUS SYNTHESIZER writing handbook section ${i + 1}, "${s.title}", Part ${s.part}.
Write the FINAL section markdown in EXACT handbook style, EQUAL NARRATIVE + DOCTRINE, using ONLY claims that survived the adversarial review (drop or fix anything it refuted; do not use a refcode the review marked misquoted/wrong/not-found). If a date was flagged unsourced and you cannot ground it, omit it rather than assert it.
${STYLE_CONTRACT}
Output ONLY the section: start with "## ${s.title}" (no Part header — assembly adds parts), the ">" thesis line, the woven narrative+doctrine body with ref→gloss and inline **symbol** = meaning defs, then the "**DEFINITION — ...**" closer, "**Symbols defined here:**", and "**Symbols carried:**". No preamble, no code fences.

### DOSSIER A:
${a ? JSON.stringify(a) : '(none)'}
### DOSSIER B:
${b ? JSON.stringify(b) : '(none)'}
### ADVERSARIAL REVIEW (authoritative — obey it):
${JSON.stringify(review)}

Your final message IS the section markdown.`,
      { label: `synth:${s.key}`, phase: 'Synthesize', model: 'opus', agentType: 'general-purpose' },
    );
    // Persist each section so a crash doesn't lose it and assembly can read from disk.
    await agent(
      `Write this exact content to the file ${SECTIONS_DIR}/${s.key}.md using the Write tool, then reply "written ${s.key}". Content between the markers, exclusive:\n<<<BEGIN>>>\n${md}\n<<<END>>>`,
      { label: `save:${s.key}`, phase: 'Synthesize', agentType: 'general-purpose' },
    );
    return { key: s.key, title: s.title, part: s.part, order: i + 1, markdown: md, review };
  },
);

const sections = built.filter(Boolean);
log(`Built ${sections.length}/16 sections.`);

// ===========================================================================
// Aggregate — opus stitches the whole handbook
// ===========================================================================
phase('Aggregate');

const orderedSections = sections.sort((x, y) => x.order - y.order);
const bodyForAgg = orderedSections
  .map((s) => `<<<SECTION ${s.order} | part=${s.part} | title=${s.title}>>>\n${s.markdown}`)
  .join('\n\n');

const handbook = await agent(
  `You are the OPUS AGGREGATOR assembling "The Chain of Truth — A Bible Handbook Study". Stitch the 16 finished sections into ONE handbook file matching the templates EXACTLY (${TEMPLATE_RBF}, ${TEMPLATE_DR}). Read a template first for the precise shape.

Produce, in order:
1. YAML front matter: created_at '2026-06-19T12:00:00Z', topic 'The Chain of Truth — A Bible Handbook Study'.
2. "# The Chain of Truth — A Bible Handbook Study"
3. **Thesis.** paragraph — "The key opens the casket": Miller's method (compare Scripture with Scripture; the Bible its own interpreter) is the key that opened the whole casket of advent truth; the handbook walks the chain chronologically 1816→1888, each link drawn out by the same key, equal narrative + doctrine.
4. **Method.** paragraph — after Haskell's Bible Handbook: ref→gloss; symbols defined on first appearance; history grounded in primary + cited secular sources; each section closes with its DEFINITION; the appendix gathers every symbol. Historicism, year-day, the pioneer cloud of witnesses verified against the corpus.
5. "## Table of Contents" with the four Parts and the 16 numbered titles (use the part= labels: I, II, III, IV).
6. The four Part headers ("# Part I — The Method & the Time (1816–1840)", etc.) with their sections under each, RENUMBERED 1..16 in order. Preserve each section's body verbatim; only fix the heading number and place it under the right Part.
7. "## Appendix — Symbol Dictionary" — gather EVERY "Symbols defined here" entry from all sections into one alphabetical list (leading articles ignored), each: "**symbol** = meaning (receipts). — defined in \\"TITLE\\"."

Do not invent content; only stitch, renumber, write the front matter/thesis/method/TOC, and build the appendix from what the sections defined. Output ONLY the full handbook markdown, no code fences.

### THE 16 SECTIONS (in order):
${bodyForAgg}`,
  { label: 'aggregate', phase: 'Aggregate', model: 'opus', agentType: 'general-purpose' },
);

await agent(
  `Write this exact content to ${OUT} using the Write tool, then reply "written handbook". Content between markers, exclusive:\n<<<BEGIN>>>\n${handbook}\n<<<END>>>`,
  { label: 'save-handbook', phase: 'Aggregate', agentType: 'general-purpose' },
);

// ===========================================================================
// Verify — machine re-verify every refcode + adversarial coherence read
// ===========================================================================
phase('Verify');

const [refcodeReport, coherenceReport] = await Promise.all([
  agent(
    `You are the REFCODE VERIFIER. Read the finished handbook at ${OUT}. Extract EVERY EGW/pioneer refcode (e.g. DAR 192.1, MWV1 46.2, GC 324.3 — italicized, not bare Bible verses) and EVERY distinctive pioneer/EGW QUOTE. For each, run \`bible egw "REF"\` and confirm the paragraph exists AND contains the quoted words. Also spot-check 15-20 KJV verse quotes via \`bun run packages/cli/src/main.ts verse "REF" --json\`. Report: total refs checked, a list of any that FAIL (refcode not found, or quote not in the paragraph), and any bare assertion that should have a refcode but doesn't. Be exhaustive on the refcodes.
Repo root: ${REPO}. Your final message is a plain report: PASS count, FAIL list (ref → problem), and SUSPECT list.`,
    { label: 'verify:refcodes', phase: 'Verify', agentType: 'general-purpose' },
  ),
  agent(
    `You are the ADVERSARIAL COHERENCE READER. Read the whole finished handbook at ${OUT} end to end. Judge: (1) does the chain actually hold link-to-link chronologically 1816→1888, or are there gaps/jumps? (2) any internal CONTRADICTIONS between sections (a symbol defined two ways, a date stated differently, a claim one section makes that another undercuts)? (3) template DRIFT — sections missing the ">" thesis, the DEFINITION closer, or the symbol machinery; inconsistent ref formatting; [CHAIN]-style markers that shouldn't be there. (4) is "equal narrative + doctrine" actually held, or do some sections collapse to one? (5) does the thesis "the key opens the casket" land across the whole? Report concrete issues with section names + line-ish locations and a fix for each.
Repo root: ${REPO}. Your final message is a prioritized issues list.`,
    { label: 'verify:coherence', phase: 'Verify', agentType: 'general-purpose' },
  ),
]);

return {
  sectionsBuilt: sections.length,
  handbookPath: OUT,
  refcodeReport,
  coherenceReport,
  perSectionReviews: orderedSections.map((s) => ({ title: s.title, verdict: s.review?.verdict })),
};
