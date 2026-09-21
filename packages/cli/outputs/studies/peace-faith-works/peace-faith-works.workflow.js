export const meta = {
  name: 'peace-faith-works',
  description:
    'Build a Sabbath School handbook study on Peace, Faith & Works mapped to the Holy Place furniture — Bible-primary cloud of witnesses, pioneer/EGW secondary, opus synthesis + aggregation',
  phases: [
    {
      title: 'Research',
      detail: 'cloud of witnesses per section — Bible primary, pioneer/EGW verified',
    },
    { title: 'Review', detail: 'cross-adversarial: refute mis-citations, enforce Bible-first' },
    { title: 'Synthesize', detail: 'opus: handbook-format prose per section + SS questions' },
    { title: 'Aggregate', detail: 'opus: assemble head + sections + appendix' },
  ],
};

// ---------------------------------------------------------------------------
// Shared context handed to every agent.
// ---------------------------------------------------------------------------

const THESIS = `
THE STUDY: "Peace, Faith & Works — A Sabbath School Study of the Holy Place".
A handbook-style Bible study (Haskell Bible-Handbook format) for Sabbath School.

THE CIRCUIT (thesis): Jesus gives us PEACE (John 14:27) at the GATE, and the
gate is FAITH (John 10:9; Rom 5:1-2 "being justified by faith, we have peace").
That peace IS the abiding HOLY SPIRIT (the Comforter — John 14:16-17,26-27;
peace and the Comforter given in the same breath). The Spirit opens the WORD
(Table of Shewbread — John 16:13). The Word, received in PRAYER (Altar of
Incense — Luke 11:13 "ask… the Holy Spirit"), draws down more Spirit. The
Spirit-filled, Word-fed life breaks out in WORKS (the Candlestick — Matt
5:14-16 "ye are the light of the world"). Faith without works is dead (James
2:26) — so the circuit must complete and the light shines back out.

THE RELATIONS (the heart of the study — what each piece is to the others):
1. Peace is the Spirit's gift, received by faith (John 14:27 + 14:16).
2. The Spirit gives understanding of the Word (John 16:13; 1 Cor 2:10-14).
3. Prayer is how the Spirit is asked for and received (Luke 11:13; Matt 7:7).
4. The Word is dead without works (James 2:26; Matt 5:16).
Each piece RECEIVES from the one before and FEEDS the one after — a circuit.

THE FURNITURE (Holy Place — Heb 9:2; Exo 40:22-27):
- Door/Gate = Faith (John 10:9; Rom 5:1) — owns peace, faith, entry.
- Table of Shewbread = the Word (Exo 25:30; Lev 24:5-9; Matt 4:4; John 6:48-63).
- Altar of Incense = Prayer / receiving the Spirit (Rev 8:3-4; Ps 141:2; Luke 11:13).
- Candlestick/Lampstand = Good Works (Exo 25:31-37; Matt 5:14-16).
`.trim();

const SOURCING = `
SOURCING RULES (Miller's Rule 12 — the Bible defines its own figures):
- BIBLE PRIMARY. Every symbol/claim is defined FIRST from Scripture — the
  verse, the chapter, or cross-canon. Furniture meanings proven from the Law
  (Exodus/Leviticus) AND the NT fulfillment (Hebrews/John/James/Matthew).
- PIONEER/EGW SECONDARY ONLY. The cloud of witnesses corroborates, never the
  sole/primary proof. Witnesses: Waggoner, Jones, Stephen Haskell (esp. "The
  Cross and Its Shadow" / refcode CIS on the sanctuary), and Ellen White (esp.
  Steps to Christ / SC, Christ's Object Lessons / COL, Desire of Ages / DA,
  Acts of the Apostles / AA, Great Controversy / GC, Patriarchs and Prophets /
  PP, Gospel Workers / GW, Education / Ed).
- VERIFY EVERY REFCODE against the local DB before using it. Commands:
    bible egw "REF"            (exact lookup, e.g.  bible egw "SC 93.2")
    bible egw search "phrase" --limit N   (find a quote; use plain words, no
                                            hyphens/quotes inside the phrase)
    bible verse "John 14:27"   (KJV scripture lookup, no auth needed)
  NEVER invent a refcode or a quote. If you cannot verify it, DROP it and say so.
- KJV for all scripture quotes (strip the red-letter ‹ › markers if present).
`.trim();

const FORMAT = `
HANDBOOK FORMAT (copy the RBF/Daniel templates EXACTLY):
- Section opens with "## N. Title" then a one-line ">" blockquote thesis.
- Grouped sub-blocks, each introduced by a bold lead line naming its refs, e.g.
  "**The Bible defines the incense — Psa. 141:2; Rev. 5:8; 8:3-4:**".
- Verse→gloss bullets: "- _Ref._ \\"KJV phrase\\" — gloss." Italicize the ref.
- Pioneer/EGW bullets nested or inline: "- _SC 93.2._ White: \\"...short quote...\\" — gloss."
- Symbol definitions on first appearance, sub-bulleted:
  "  - **symbol** = meaning (_Receipt 1_; _Receipt 2_; _Receipt 3_)."
- Section closes with "**DEFINITION — TITLE =** ..." (one dense paragraph
  summarizing what the verses built, with inline refcodes).
- Then "**Symbols defined here:**" listing each symbol = meaning (refs).
- Cross-reference other sections by exact TITLE in quotes, never by number.
- SABBATH SCHOOL ADDITION: end each section with "**For discussion:**" and
  1–3 tight, Scripture-anchored, application-oriented questions (numbered).
- Density target: match the exemplar — many verses, every claim cited.
`.trim();

const EXEMPLAR = `
FORMAT EXEMPLAR (a finished furniture section from the RBF handbook — match
this depth, density, and structure exactly):

## 16. The Altar of Incense — Prayer and the Spirit

> The third piece of the Holy Place stands west, set apart against the veil: prayer rising as incense, by which the Spirit is given — and without the Spirit there is neither understanding of the Word nor fruit on the branch.

**The altar named, and burned upon perpetually — Exo. 30:1, 7-8:**

- _Exo. 30:1._ "And thou shalt make an altar to burn incense upon..." — a distinct altar, standing in the Holy Place before the veil.
  - **altar of incense** = the place of intercession before God, where prayer is offered (_Exo. 30:1_; _Psa. 141:2_; _Rev. 8:3_) — the west-side piece, set apart against the veil.
- _PP 353.2._ White: "The incense, ascending with the prayers of Israel, represents the merits and intercession of Christ..." — the incense is Christ's righteousness mingled with the prayer.

**The Bible defines the incense — Psa. 141:2; Rev. 5:8; 8:3-4:**

- _Psa. 141:2._ "Let my prayer be set forth before thee as incense..." — the inspired equation: prayer = incense.
  - **incense (= prayer)** = the prayers of the saints ascending to God (_Psa. 141:2_; _Rev. 5:8_; _Rev. 8:3-4_).
- _Rev. 5:8._ "golden vials full of odours, which are the prayers of saints" — Heaven says outright what the incense is.

**DEFINITION — THE ALTAR OF INCENSE — PRAYER AND THE SPIRIT =** the third piece of the Holy Place, set west against the veil, where prayer ascends as incense (_Exo. 30:1_; _Psa. 141:2_; _Rev. 8:3-4_)... Prayer is the appointed channel by which the Holy Spirit is given (_Luke 11:13_; _Matt. 7:7_; _Jas. 1:5_)... So the third piece completes the daily walk (see "The Table of Shewbread — Eating the Word").

**Symbols defined here:**

- **altar of incense** = the place of intercession before God... (_Exo. 30:1_; _Psa. 141:2_; _Rev. 8:3_; _PP 353.2_).
- **incense (= prayer)** = the prayers of the saints ascending to God... (_Psa. 141:2_; _Rev. 5:8_; _Rev. 8:3-4_).
`.trim();

// ---------------------------------------------------------------------------
// The section spine.
// ---------------------------------------------------------------------------

const SECTIONS = [
  {
    n: 1,
    slug: '01-peace-christ-gives',
    part: 'Part I — The Gate: Peace by Faith',
    title: 'The Peace Christ Gives — the Gift at the Door',
    brief:
      'Jesus offers PEACE — His own, "not as the world giveth" (John 14:27; 16:33; 20:19-21,26 "Peace be unto you"). Define peace: reconciliation with God (Rom 5:1; Col 1:20 by the blood of the cross; Eph 2:14-17 "he is our peace"), and the fruit/keeping of the Spirit (Gal 5:22; Phil 4:6-7 the peace that passeth understanding; Isa 26:3). Show the peace is a PERSON and a gift, not an achievement. This is the door of the study. Cross-ref forward to "The Gate Is Faith" and "Peace Is the Spirit".',
  },
  {
    n: 2,
    slug: '02-gate-is-faith',
    part: 'Part I — The Gate: Peace by Faith',
    title: 'The Gate Is Faith — Entering In, Justified, at Peace',
    brief:
      'Christ is the door/gate (John 10:9 "I am the door"; John 14:6). We enter by FAITH and the entering IS justification, which YIELDS peace (Rom 5:1-2 "being justified by faith, we have peace with God... access by faith"; Eph 2:8; Heb 11:6). Define faith (Heb 11:1; Rom 10:17 faith by hearing the Word — hinge forward to the Table). The gate is the furniture station before the Holy Place proper; peace is what you carry through it. Sanctuary: the court/gate to Holy Place (Exo 27:16; Heb 9:2). Cross-ref "The Peace Christ Gives" and forward to the furniture.',
  },
  {
    n: 3,
    slug: '03-peace-is-the-spirit',
    part: 'Part I — The Gate: Peace by Faith',
    title: 'Peace Is the Spirit — the Comforter Who Abides',
    brief:
      'The peace Christ gives IS the abiding Holy Spirit. In John 14 the Comforter (vv16-17,26) and peace (v27) are given in one breath; "I will not leave you comfortless: I will come to you" (v18). The Spirit is peace because He is Christ-in-us (Rom 8:6 "to be spiritually minded is life and peace"; Gal 5:22 peace is the Spirit\'s fruit; Rom 14:17 kingdom is righteousness, peace, joy in the Holy Ghost). This section is the PIVOT: it shows the same Spirit who is our peace is the One who will open the Word and be asked for in prayer. Cross-ref all forward sections.',
  },
  {
    n: 4,
    slug: '04-table-shewbread-word',
    part: 'Part II — Inside the Holy Place: the Circuit',
    title: 'The Table of Shewbread — the Spirit Opens the Word',
    brief:
      'The Table and its twelve loaves (Exo 25:23-30 "shewbread... before me alway"; Lev 24:5-9 bread of the presence). Define the Word as BREAD (Matt 4:4 "by every word"; John 6:48-51,63 "the words... are spirit, and... life"; Jer 15:16 "thy words were found, and I did eat them"). The RELATION: the Spirit who is our peace OPENS the Word — without Him the table is shut (John 16:13 "guide you into all truth"; 1 Cor 2:10-14 natural man cannot discern; Luke 24:32,45 "opened he their understanding"). Pioneer/EGW (Haskell CIS on the table; EGW on eating the Word). Cross-ref "Peace Is the Spirit" and forward to incense/prayer.',
  },
  {
    n: 5,
    slug: '05-altar-incense-prayer',
    part: 'Part II — Inside the Holy Place: the Circuit',
    title: 'The Altar of Incense — Prayer, and the Spirit Asked For',
    brief:
      'The incense altar (Exo 30:1,7-8 perpetual, morning and evening). Bible defines incense = prayer (Ps 141:2; Rev 5:8; 8:3-4). The RELATION: prayer is HOW the Spirit is received — "ask and it shall be given... the Holy Spirit to them that ask" (Luke 11:13; Matt 7:7-11; Jas 1:5 ask for wisdom). Prayer feeds the Word and the Word feeds prayer (the incense stands by the table). Pioneer/EGW (Haskell CIS golden altar; EGW SC 93-98 on prayer, GW on prayer as the breath of the soul). NOTE: RBF already has a deep incense section — DEEPEN the relation (prayer→Spirit→opening the Word) rather than repeat. Cross-ref the table and forward to works.',
  },
  {
    n: 6,
    slug: '06-candlestick-works',
    part: 'Part II — Inside the Holy Place: the Circuit',
    title: 'The Candlestick — Works, the Light That Must Shine',
    brief:
      'The lampstand (Exo 25:31-37; Lev 24:1-4 to burn always; Zech 4:2-6 "not by might... but by my Spirit" — the oil is the Spirit). Define WORKS as LIGHT (Matt 5:14-16 "ye are the light of the world... let your light so shine... that they may see your good works"; Eph 2:10 created unto good works; Tit 2:14 zealous of good works). The RELATION: the light is not self-made — it burns by the Spirit\'s oil and shows the Word lived out; works are faith/Word made visible (John 15:5,8 "without me ye can do nothing... herein is my Father glorified, that ye bear much fruit"). Pioneer/EGW (Haskell CIS lampstand; EGW COL/DA on works as fruit). Cross-ref incense/Spirit and forward to "Faith Without Works Is Dead".',
  },
  {
    n: 7,
    slug: '07-faith-without-works-dead',
    part: 'Part II — Inside the Holy Place: the Circuit',
    title: 'Faith Without Works Is Dead — Why the Circuit Must Complete',
    brief:
      'The hinge of the whole study. James 2:14-26 ("faith without works is dead"; "shew me thy faith without thy works, and I will shew thee my faith by my works"; "by works was faith made perfect"). Resolve the apparent Paul/James tension: justified by faith ALONE, but the faith that justifies is never alone — it works by love (Gal 5:6 "faith which worketh by love"; Eph 2:8-10 saved by grace through faith... unto good works; Tit 3:5,8). The Word received without works is the closed-up light, the buried bread; the circuit must run all the way to the lampstand or it dies on the table. Pioneer/EGW (EGW SC on faith and works, COL; Waggoner/Jones on faith that works). Cross-ref the candlestick and the table.',
  },
  {
    n: 8,
    slug: '08-living-circuit',
    part: 'Part III — The Whole in One View',
    title: 'The Living Circuit — Peace, Word, Prayer, Works as One',
    brief:
      'The capstone: assemble the whole Holy Place as ONE circuit. Walk it once through: enter by faith with peace (the gate) → the peace is the Spirit (the Comforter) → the Spirit opens the Word (the table) → prayer asks and receives more Spirit (the incense) → the life shines in works (the lampstand) → the light draws others back to the gate. Show it is a CIRCUIT not a ladder — each piece feeds the next and the whole turns. Tie to the daily walk and to abiding (John 15:1-11). End with the call: receive the peace, enter by faith, eat the Word, pray for the Spirit, let the light shine. Heavier on SS application/discussion. Cross-ref every prior section by title.',
  },
];

// ---------------------------------------------------------------------------
// JSON schema for the research/review packets.
// ---------------------------------------------------------------------------

const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'bibleSpine', 'witnesses', 'relations', 'notes'],
  properties: {
    slug: { type: 'string' },
    bibleSpine: {
      type: 'array',
      description:
        'Bible-primary verse spine: the verses that DEFINE every symbol/claim, verified via `bible verse`.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'kjv', 'gloss'],
        properties: {
          ref: { type: 'string', description: 'e.g. "John 14:27"' },
          kjv: { type: 'string', description: 'exact KJV phrase, red-letter markers stripped' },
          gloss: { type: 'string', description: 'what it proves / how it defines the symbol' },
        },
      },
    },
    witnesses: {
      type: 'array',
      description:
        'SECONDARY pioneer/EGW corroboration, every refcode VERIFIED via `bible egw "REF"`.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'author', 'quote', 'gloss', 'verified'],
        properties: {
          ref: { type: 'string', description: 'e.g. "SC 93.2"' },
          author: { type: 'string', description: 'White / Waggoner / Jones / Haskell' },
          quote: { type: 'string', description: 'short exact quote from the corpus' },
          gloss: { type: 'string' },
          verified: { type: 'boolean', description: 'true ONLY if confirmed against the local DB' },
        },
      },
    },
    relations: {
      type: 'array',
      description:
        'The relation(s) this section establishes between furniture pieces — the heart of the study.',
      items: { type: 'string' },
    },
    notes: {
      type: 'string',
      description: 'open questions, risks, anything dropped for lack of verification',
    },
  },
};

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'verdict', 'defects', 'unverifiedRefs', 'bibleFirstOk'],
  properties: {
    slug: { type: 'string' },
    verdict: { type: 'string', enum: ['solid', 'needs-fixes', 'major-rework'] },
    bibleFirstOk: {
      type: 'boolean',
      description: 'true if every symbol is defined Bible-FIRST with pioneer/EGW only secondary',
    },
    defects: {
      type: 'array',
      description:
        'specific, actionable defects: mis-citations, wrong glosses, missing Bible definition, weak relations',
      items: { type: 'string' },
    },
    unverifiedRefs: {
      type: 'array',
      description:
        'any refcode/quote you could not confirm against the DB — these must be dropped or fixed',
      items: { type: 'string' },
    },
  },
};

// ---------------------------------------------------------------------------
// Phase 1+2+3 pipeline: research -> review -> synthesize, per section.
// pipeline() so a fast section can be synthesizing while a slow one researches.
// ---------------------------------------------------------------------------

phase('Research');

const built = await pipeline(
  SECTIONS,

  // Stage 1: cloud-of-witnesses research (Bible primary, pioneer/EGW verified).
  (sec) =>
    agent(
      `You are a Seventh-day Adventist sanctuary scholar with shell access to a verified corpus.
Research the cloud of witnesses for ONE section of a Sabbath School handbook study.

${THESIS}

${SOURCING}

THIS SECTION — ${sec.n}. ${sec.title}
Part: ${sec.part}
Brief: ${sec.brief}

YOUR JOB:
1. Build the BIBLE-PRIMARY verse spine: every symbol and claim DEFINED from Scripture
   first. Verify each verse with: bible verse "REF". Strip red-letter ‹ › markers.
2. Gather SECONDARY pioneer/EGW witnesses that corroborate. VERIFY every refcode with:
   bible egw "REF"  (and find quotes with: bible egw search "plain words" --limit 8).
   Set verified=true ONLY for refs you actually confirmed. DROP anything you cannot confirm.
3. State the RELATION(S) this section establishes between the furniture pieces — this is
   the heart of the study (what peace/faith/Word/prayer/works are to each other).

Be exhaustive on the Bible spine (aim 8-16 verses), disciplined on witnesses (6-12, all
verified). Receipts only — no invented refs. Return the structured object.`,
      {
        label: `research:${sec.slug}`,
        phase: 'Research',
        schema: RESEARCH_SCHEMA,
        agentType: 'general-purpose',
      },
    ).then((research) => ({ sec, research })),

  // Stage 2: cross-adversarial review (a DIFFERENT agent, told to refute).
  (prev) => {
    if (!prev || !prev.research) return null;
    const { sec, research } = prev;
    return agent(
      `You are an adversarial reviewer with shell access to the same verified corpus.
REFUTE, don't rubber-stamp. Another agent researched a handbook section; find its defects.

${SOURCING}

SECTION: ${sec.n}. ${sec.title}
Brief: ${sec.brief}

THE RESEARCH PACKET TO REVIEW:
${JSON.stringify(research, null, 2)}

CHECK HARD:
- Spot-check refcodes: run  bible egw "REF"  on the witness refs. Flag any that don't
  resolve or whose quote doesn't match — list them in unverifiedRefs.
- Spot-check scripture: run  bible verse "REF"  on key spine verses. Flag mis-quotes.
- BIBLE-FIRST: is every symbol defined from Scripture FIRST, with pioneer/EGW only
  secondary? If any symbol leans primarily on EGW/pioneer, set bibleFirstOk=false and
  say which.
- RELATIONS: are the stated relations actually proven by the cited verses, or asserted?
- Gaps: any obvious load-bearing verse missing?

Return the structured verdict. Be specific and actionable.`,
      {
        label: `review:${sec.slug}`,
        phase: 'Review',
        schema: REVIEW_SCHEMA,
        agentType: 'general-purpose',
      },
    ).then((review) => ({ sec, research, review }));
  },

  // Stage 3: opus synthesis into final handbook prose (+ SS questions).
  (prev) => {
    if (!prev || !prev.research) return null;
    const { sec, research, review } = prev;
    return agent(
      `You are an opus-tier writer composing ONE section of a Sabbath School handbook study,
in the EXACT style of the Righteousness by Faith handbook. Write FINAL, shippable prose.

${THESIS}

${SOURCING}

${FORMAT}

${EXEMPLAR}

THIS SECTION — write it as "## ${sec.n}. ${sec.title}"
Part: ${sec.part}
Brief: ${sec.brief}

VERIFIED RESEARCH (use this; do not invent beyond it — if you need a verse not here,
it must be one you are certain of in the KJV):
${JSON.stringify(research, null, 2)}

ADVERSARIAL REVIEW (you MUST address every defect and DROP every unverified ref):
${JSON.stringify(review, null, 2)}

REQUIREMENTS:
- Open with "## ${sec.n}. ${sec.title}" then a one-line ">" thesis blockquote.
- Bible-FIRST throughout: define each symbol from Scripture, pioneer/EGW only secondary.
- Use the grouped bold-lead-line + verse→gloss bullet structure from the exemplar.
- Make the RELATION explicit and Scripture-proven (what this piece is to the others).
- Close with "**DEFINITION — ${sec.title.toUpperCase()} =** ..." then "**Symbols defined here:**".
- Cross-reference other sections by their exact TITLE in quotes, never by number.
- End with "**For discussion:**" and 1-3 tight, Scripture-anchored questions (numbered).
- Match the exemplar's DENSITY. Do NOT include any narration, preamble, or sign-off —
  output ONLY the section markdown, starting with "## ".

Output the section markdown now.`,
      {
        label: `synth:${sec.slug}`,
        phase: 'Synthesize',
        model: 'opus',
        agentType: 'general-purpose',
      },
    ).then((markdown) => ({ sec, markdown }));
  },
);

const sections = built
  .filter(Boolean)
  .filter((b) => b.markdown && b.markdown.trim().startsWith('## '));
log(`synthesized ${sections.length}/${SECTIONS.length} sections`);

// ---------------------------------------------------------------------------
// Phase 4: opus aggregator — head + TOC + sections + appendix.
// ---------------------------------------------------------------------------

phase('Aggregate');

// Sort by section number to guarantee order regardless of pipeline timing.
sections.sort((a, b) => a.sec.n - b.sec.n);
const sectionsBundle = sections
  .map((s) => `=== SECTION ${s.sec.n} (${s.sec.part}) ===\n${s.markdown.trim()}`)
  .join('\n\n');

const finalDoc = await agent(
  `You are an opus-tier editor assembling the FINAL Sabbath School handbook from finished sections.

${THESIS}

${FORMAT}

You are given ${sections.length} finished section bodies (each already in handbook format).
ASSEMBLE the complete document. Do NOT rewrite the section bodies — place them verbatim,
in order, under their Part headings. Your job is the HEAD, the Parts/TOC scaffolding, and
the APPENDIX.

PRODUCE, in this exact order:

1. YAML frontmatter:
---
created_at: '2026-06-20T12:00:00Z'
topic: Peace, Faith & Works — A Sabbath School Study of the Holy Place
---

2. "# Peace, Faith & Works — A Sabbath School Study of the Holy Place"

3. "**Thesis.**" paragraph — the circuit (peace → faith/gate → the Spirit → the Word/table
   → prayer/incense → works/lampstand → the light shines back out), with the load-bearing
   refs inline (_John 14:27_; _John 10:9_; _Rom 5:1_; _John 16:13_; _Luke 11:13_;
   _Matt 5:14-16_; _Jas 2:26_). Then "**Method.**" paragraph — Haskell Bible-Handbook
   style, Miller's Rule 12 (the Bible defines its own figures), Bible-primary with the
   pioneer/EGW cloud of witnesses secondary, for Sabbath School use.

4. "## Table of Contents" — the three Parts with their numbered section titles, exactly
   matching the section bodies.

5. A "# Part I — The Gate: Peace by Faith", "# Part II — Inside the Holy Place: the
   Circuit", "# Part III — The Whole in One View" divider before each Part's sections,
   then the section bodies VERBATIM in order under them.

6. "## Appendix — Symbol Dictionary" — gather EVERY "**symbol** = meaning (refs)" defined
   across all sections into one alphabetized dictionary. Pull them from the sections'
   "Symbols defined here:" lists. Do not invent new symbols; consolidate duplicates.

Output ONLY the final markdown document, starting with "---". No narration, no sign-off.

THE SECTIONS:
${sectionsBundle}`,
  { label: 'aggregate', phase: 'Aggregate', model: 'opus', agentType: 'general-purpose' },
);

return {
  finalDoc,
  sectionCount: sections.length,
  sections: sections.map((s) => ({ n: s.sec.n, slug: s.sec.slug, markdown: s.markdown })),
};
