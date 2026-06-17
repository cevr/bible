export const meta = {
  name: 'rbf-handbook',
  description:
    'Build a Haskell-Bible-Handbook-style study on Righteousness by Faith (sanctuary spine), drafting + verifying every ref against the local DBs',
  whenToUse:
    'Generate the righteousness-by-faith handbook from the gathered cloud of witnesses (Bible + EGW + pioneers incl. Jones & Waggoner)',
  phases: [
    { title: 'Gather', detail: 'per-section cloud of witnesses from Bible + EGW + pioneer DBs' },
    { title: 'Draft', detail: 'Opus drafts each section in handbook style from its cloud' },
    {
      title: 'Verify',
      detail: 'Opus re-runs every ref via bible verse / egw lookup, returns corrected markdown',
    },
    { title: 'Assemble', detail: 'stitch sections + build the Symbol Dictionary appendix' },
  ],
};

// ----------------------------------------------------------------------------
// CONSTANTS — paths, the section list, the style contract, the witness scope.
// ----------------------------------------------------------------------------
const SRC = 'packages/cli/outputs/studies/rbf-sources';
const MASTER =
  'packages/cli/outputs/studies/2026-06-10-daniel-and-the-revelation-a-bible-handbook-study.md';

// The pioneer cloud: the standard nine + Jones & Waggoner (1888 RBF men).
const PIONEERS = [
  'Ellet Joseph Waggoner',
  'Alonzo Trevier Jones',
  'James Springer White',
  'Uriah Smith',
  'Josiah Litch',
  'John Nevins Andrews',
  'Stephen Nelson Haskell',
  'William Miller',
  'Sylvester Bliss',
  'Apollos Hale',
  'Charles Fitch',
];

// Shared style contract handed to every drafter + verifier (kept terse but exact).
const STYLE = `
STYLE CONTRACT — this handbook copies "Daniel and the Revelation — A Bible Handbook Study" exactly:
- After Haskell's Bible Handbook: every line is **ref → gloss**, Bible and pioneer/EGW alike.
- Walk the passage; the FIRST time a symbol/term appears, define it inline:
  "  - **symbol** = meaning (_Receipt 1_; _Receipt 2_)" — let the Bible define its own figures.
- Quote KJV phrases inline in double quotes, italicize refs like _Gen 1:26_, _DA 24.1_, _ChS 50.1_.
- Pioneer / EGW lines look like: "- _DA 24.1._ White: \\"...short quote...\\" — one-line gloss."
- Section opens with a one-line ">" blockquote thesis. Section CLOSES with a bold
  "**DEFINITION — TITLE =** ..." paragraph summarizing what the verses built, then a
  "**Symbols defined here:**" bullet list, then "**Symbols carried:**" referencing the OWNING
  section by its exact TITLE (never a number — assembly renumbers).
- Cross-reference other sections by their exact TITLE in quotes, e.g. (see "The Altar of Sacrifice — Forgiveness").
- NEVER invent refcodes. Use only refs present in the provided CLOUD, or canonical KJV verses you are certain of.
- Tone: dense, reverent, evidence-first. No filler, no "in this section we will".
`;

// The ~22 sections. key = stable id; title = exact heading; scope = what to cover;
// terms = the Bible search terms used to gather the cloud; symbols = the symbol-dictionary
// entries this section OWNS (defined here).
const SECTIONS = [
  {
    key: 'image-lost',
    part: 'I',
    title: 'The Image of God, and What Sin Lost',
    scope:
      'Man made in the image of God (Gen 1:26, 5:3); image = God’s glory/name/character (Exo 33-34); sin lost the image, the presence (Isa 59:2), and the life (Eze 18:20) — all stemming from losing the image.',
    terms: [
      'image of God',
      'after our likeness',
      'glory',
      'my name',
      'separated',
      'soul that sinneth',
    ],
    symbols: ['image of God', 'glory (of God)', 'name (of God)'],
  },

  {
    key: 'law-image',
    part: 'I',
    title: 'The Law — an Image of God',
    scope:
      'Do the law and live (Lev 18:5; Luke 10:25-28); law summarized to love God/neighbour (Matt 22:36-40), then to one principle: love; God IS love (1 John 4:8) so the law is an image of God; sin = transgression of the law (1 John 3:4), pushed to: anything that mars God’s character (Matt 5).',
    terms: [
      'do, he shall live',
      'love the Lord thy God',
      'God is love',
      'transgression of the law',
      'whosoever is angry',
      'schoolmaster',
    ],
    symbols: ['the law (as image of God)', 'love'],
  },

  {
    key: 'christ-image',
    part: 'I',
    title: 'Christ — the Express Image, the Life',
    scope:
      'Jesus is the Life (John 14:6); to know God and Jesus is life (John 17:3); He is the express image of God and brightness of His glory (Heb 1:3); seen Him = seen the Father (John 14:9, John 16); He came to give life (John 10:10) = to restore the image.',
    terms: [
      'I am the way',
      'express image',
      'this is life eternal',
      'seen the Father',
      'I am come that they',
      'image of the invisible God',
    ],
    symbols: ['the Life', 'express image'],
  },

  {
    key: 'nature-of-christ',
    part: 'I',
    title: 'The Nature of Christ — Tempted in All Points',
    scope:
      'Christ took our nature (Heb 2:14-18), was tempted in all points like as we are yet without sin (Heb 4:15), made of the seed of David according to the flesh (Rom 1:3), in the likeness of sinful flesh (Rom 8:3); the nature-of-man question (materialism vs dualism, from the transcript) bears on whether sin can be overcome. Pull HEAVILY from the transcript and Waggoner/Jones/EGW (DA, 1SM 256, etc.).',
    terms: [
      'tempted like as we are',
      'took on him the seed',
      'flesh and blood',
      'likeness of sinful flesh',
      'made of a woman',
      'in all things',
    ],
    symbols: ['the seed of David / our nature'],
  },

  {
    key: 'beholding-transform',
    part: 'I',
    title: 'Beholding We Are Changed — Truth the Sanctifier',
    scope:
      'By beholding the glory (character) of God we are changed into the same image (2 Cor 3:18); sanctify them through thy truth (John 17:17); man lives by every word (Deut 8:3; Matt 4:4); the Word is Jesus (John 1:1); we must eat His flesh / drink His blood (John 6:53) = come to know Him.',
    terms: [
      'beholding',
      'changed into the same image',
      'sanctify them through thy truth',
      'every word that proceedeth',
      'eat the flesh',
      'Word was God',
    ],
    symbols: ['beholding (= becoming)', 'truth (the sanctifier)', 'bread / the Word'],
  },

  {
    key: 'death-separation',
    part: 'I',
    title: 'Two Things to Be Dealt With — Death and Separation',
    scope:
      'The impassable gulf between man and God; man must die a slave to sin (Rom 6); yet God desires to dwell with us (Exo 25:8). Frame the two problems the sanctuary solves: death (the penalty) and separation (the gulf).',
    terms: [
      'wages of sin',
      'great gulf fixed',
      'your iniquities have separated',
      'dead in trespasses',
      'reconcile',
    ],
    symbols: ['the gulf / separation', 'death (the penalty of sin)'],
  },

  {
    key: 'ladder-gate-sanctuary',
    part: 'I',
    title: 'The Ladder, the Gate, the House of God — Christ the Sanctuary',
    scope:
      'Jacob’s ladder, Gate of heaven, House of God (Gen 28:12-17); Jesus = the ladder (John 1:51); Jesus = the door/gate (John 10:9); the sanctuary = House of God (1 Chr 28:10); therefore Jesus = Ladder = Gate = Sanctuary; God’s purpose: dwell with us (Exo 25:8); the sanctuary reverses sin.',
    terms: [
      'ladder set up on the earth',
      'gate of heaven',
      'I am the door',
      'house of God',
      'angels of God ascending',
      'sanctuary; that I may dwell',
    ],
    symbols: ['ladder', 'gate / door', 'house of God / sanctuary'],
  },

  {
    key: 'sanctuary-three',
    part: 'I',
    title: 'The Three Compartments — Justification, Sanctification, Glorification',
    scope:
      'The sanctuary’s three compartments (Outer Court, Holy Place, Most Holy) map to the three stages of salvation (Heb 9). Establish the spine before walking each piece of furniture.',
    terms: [
      'first tabernacle',
      'holiest of all',
      'the way into the holiest',
      'pattern shewed thee',
      'court of the tabernacle',
    ],
    symbols: [
      'outer court (= justification)',
      'holy place (= sanctification)',
      'most holy place (= glorification)',
    ],
  },

  {
    key: 'court-gate-faith',
    part: 'II',
    title: 'The Gate — Faith',
    scope:
      'Outer-court step 1. Mark 2:5 (Jesus saw their faith); John 8:11 (No man, Lord); faith is the gift of God (Eph 2:8-9); Jesus draws all men (John 12:32); without faith impossible to please (Heb 11:6). Gate = faith, the entrance.',
    terms: [
      'saw their faith',
      'by grace are ye saved through faith',
      'I will draw all men',
      'without faith it is impossible',
      'gate',
    ],
    symbols: ['gate (= faith)'],
  },

  {
    key: 'court-altar-forgiveness',
    part: 'II',
    title: 'The Altar of Sacrifice — Forgiveness',
    scope:
      'Outer-court step 2. Jesus forgives the paralytic’s sins (Mark 2:5); Neither do I condemn thee (John 8:11); the Substitute pays the debt; the altar/lamb (Lev 1; John 1:29); without shedding of blood no remission (Heb 9:22).',
    terms: [
      'thy sins be forgiven',
      'neither do I condemn',
      'Lamb of God',
      'without shedding of blood',
      'altar',
      'lay his hand upon the head',
    ],
    symbols: [
      'altar of sacrifice (= forgiveness)',
      'the Lamb / Substitute',
      'blood (= the ransom)',
    ],
  },

  {
    key: 'court-laver-power',
    part: 'II',
    title: 'The Laver — Power to Overcome',
    scope:
      'Outer-court step 3. Jesus gives power to walk / go and sin no more (Mark 2:11; John 8:11); washing of regeneration (Titus 3:5); partakers of the divine nature (2 Peter 1:4); born of water and Spirit (John 3:5). Healing never separated from power.',
    terms: [
      'take up thy bed',
      'go, and sin no more',
      'washing of regeneration',
      'partakers of the divine nature',
      'born of water',
      'laver',
    ],
    symbols: ['laver (= power / regeneration)'],
  },

  {
    key: 'justification-summary',
    part: 'II',
    title: 'Justification — Faith, Forgiveness, Power as One',
    scope:
      'Tie the three court pieces together: Mark 2 and John 8 each show all three steps; justification is faith + forgiveness + power, never forgiveness without power. Waggoner/Jones on justification by faith (1888).',
    terms: [
      'justified by faith',
      'being justified freely',
      'faith which worketh',
      'sin shall not have dominion',
    ],
    symbols: ['justification'],
  },

  {
    key: 'holy-walk',
    part: 'II',
    title: 'The Daily Walk to Heaven — Entering Sanctification',
    scope:
      'The healed man chooses daily to go home (John 14:2-3); strait gate, narrow way (Matt 7:13-14); the Holy Place has a gate (= faith again, Heb 11:6). Sanctification is the daily decision.',
    terms: [
      'in my Father’s house',
      'strait is the gate',
      'narrow is the way',
      'I die daily',
      'walk in the Spirit',
    ],
    symbols: ['the narrow way / daily walk'],
  },

  {
    key: 'holy-shewbread',
    part: 'II',
    title: 'The Table of Shewbread — Daily the Word',
    scope:
      'Shewbread (north); eat His flesh/blood (John 6:53); man lives by every word (Deut 8:3; Matt 4:4); the Word is Jesus (John 1:1); only through knowing God are we transformed. Bread = the Word.',
    terms: [
      'shewbread',
      'eat the flesh of the Son',
      'every word that proceedeth',
      'bread of life',
      'thy words were found',
    ],
    symbols: ['table of shewbread', 'shewbread / bread (= the Word, daily)'],
  },

  {
    key: 'holy-candlestick',
    part: 'II',
    title: 'The Candlestick — the Light of Good Works',
    scope:
      'Candlestick (south), light never to go out; ye are the light of the world (Matt 5:14-16); let your light so shine; good works lead others to faith. Candlestick = the witness of good works / the church.',
    terms: [
      'light of the world',
      'let your light so shine',
      'candlestick',
      'good works',
      'lamps burning',
    ],
    symbols: ['candlestick (= light / good works)'],
  },

  {
    key: 'holy-incense',
    part: 'II',
    title: 'The Altar of Incense — Prayer and the Spirit',
    scope:
      'Incense (west, set apart) = prayer (Psa 141:2; Rev 5:8); the Spirit given through prayer (Luke 11:13); Scripture inspired by the Spirit (2 Peter 1:21); without Me ye can do nothing (John 15:5); we in Him by the Spirit (John 14:16-18). Without prayer, neither understanding nor fruit.',
    terms: [
      'let my prayer be set forth as incense',
      'odours, which are the prayers',
      'give the Holy Spirit to them that ask',
      'holy men of God spake',
      'without me ye can do nothing',
      'Comforter',
    ],
    symbols: ['altar of incense', 'incense (= prayer)'],
  },

  {
    key: 'sanctification-summary',
    part: 'II',
    title: 'Sanctification — the Daily Transformation',
    scope:
      'Pray, Read, Do — daily, as the sanctuary service was daily; transformed more and more into His image until the image is restored. Waggoner/Jones/EGW on sanctification as the work of a lifetime.',
    terms: [
      'sanctify you wholly',
      'from glory to glory',
      'work of a lifetime',
      'grow in grace',
      'perfecting holiness',
    ],
    symbols: ['sanctification'],
  },

  {
    key: 'most-holy-glorification',
    part: 'II',
    title: 'The Most Holy Place — Glorification',
    scope:
      'No sin enters God’s presence; His presence is consuming fire (Isa 33:14-16); the flesh remains sinful (Rom 8:3); at His coming our bodies are changed, incorruptible (1 Cor 15:51-52); we shall be like Him (1 John 3:2); presented before the throne with exceeding joy (Jude 24-25).',
    terms: [
      'who among us shall dwell with the devouring fire',
      'we shall all be changed',
      'this corruptible must put on',
      'we shall be like him',
      'present you faultless',
    ],
    symbols: ['most holy place (= glorification)', 'consuming fire (= God’s presence)'],
  },

  {
    key: 'image-restored',
    part: 'II',
    title: 'The Image Restored — the Whole in One View',
    scope:
      'The closing synthesis: image lost -> law (image) the teacher -> Christ (express image) the Life that restores -> truth the sanctifier -> the sanctuary the structure. Restate the governing thread; the plan of salvation = restoration of the image of God in man.',
    terms: [
      'renewed in knowledge after the image',
      'changed into the same image',
      'till we all come',
      'conformed to the image of his Son',
    ],
    symbols: ['restoration (of the image)'],
  },
];

// ----------------------------------------------------------------------------
// ARGS — allow running a subset by key, and gating the assemble phase.
//   args.only  : array of section keys to (re)build; default = all
//   args.assemble : boolean; only stitch + appendix when true (default: true)
// args may arrive JSON-stringified (known workflow gotcha) — parse defensively.
// ----------------------------------------------------------------------------
let A = args;
if (typeof A === 'string' && A.trim().startsWith('{')) A = JSON.parse(A);
A = A || {};
const ONLY = Array.isArray(A.only)
  ? A.only
  : typeof A.only === 'string' && A.only.startsWith('[')
    ? JSON.parse(A.only)
    : null;
const DO_ASSEMBLE = A.assemble !== false;

const RUN = ONLY ? SECTIONS.filter((s) => ONLY.includes(s.key)) : SECTIONS;
// THROW on unknown keys (gotcha guard) so a typo can't silently skip work.
if (ONLY) {
  const known = new Set(SECTIONS.map((s) => s.key));
  const bad = ONLY.filter((k) => !known.has(k));
  if (bad.length) throw new Error('Unknown section key(s): ' + bad.join(', '));
}
log('RBF handbook — sections to build: ' + RUN.map((s) => s.key).join(', '));
log('assemble phase: ' + DO_ASSEMBLE);

// ----------------------------------------------------------------------------
// SCHEMAS
// ----------------------------------------------------------------------------
const CLOUD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'bible', 'egw', 'pioneer'],
  properties: {
    key: { type: 'string' },
    bible: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'text'],
        properties: { ref: { type: 'string' }, text: { type: 'string' } },
      },
    },
    egw: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'author', 'text'],
        properties: {
          ref: { type: 'string' },
          author: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
    pioneer: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'author', 'text'],
        properties: {
          ref: { type: 'string' },
          author: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
  },
};
const SECTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'title', 'markdown', 'symbols'],
  properties: {
    key: { type: 'string' },
    title: { type: 'string' },
    markdown: { type: 'string' },
    symbols: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'definition'],
        properties: { name: { type: 'string' }, definition: { type: 'string' } },
      },
    },
  },
};

// ----------------------------------------------------------------------------
// PHASE 1+2+3 pipelined per section: GATHER -> DRAFT -> VERIFY (no barrier).
// Each section flows through all three stages independently.
// ----------------------------------------------------------------------------
const pioneerList = PIONEERS.map((p) => '"' + p + '"').join(', ');

const built = await pipeline(
  RUN,

  // --- STAGE 1: GATHER the cloud of witnesses from the local DBs --------------
  (s) =>
    agent(
      `You are gathering the CLOUD OF WITNESSES for one section of a Righteousness-by-Faith handbook.
SECTION key="${s.key}", title="${s.title}".
SCOPE: ${s.scope}

Use the local databases via Bash (set dangerouslyDisableSandbox: true for ~/.bible paths). For EGW/pioneer
remote-auth commands first run: set -a; source packages/cli/.env; set +a.

1) BIBLE: query ~/.bible/bible.db (table verses: book INTEGER, chapter, verse, version_code='KJV', text;
   books table: number, name). Collect the KJV text for EVERY verse named in SCOPE plus close cross-refs
   you find via these search terms: ${JSON.stringify(s.terms)}. Return ref like "John 1:1" + exact KJV text.
2) EGW: query ~/.bible/egw-paragraphs.db (paragraphs p JOIN books b ON p.book_id=b.book_id WHERE
   b.book_author='Ellen Gould White'). Find 6-12 of the STRONGEST paragraphs on this section's theme
   (use content_text LIKE on the key phrases, esp. from DA, SC, COL, 1SM, GC, MB, Ed). Return refcode_short,
   author, and the first ~280 chars of content_text.
3) PIONEER: same DB, WHERE b.book_author IN (${pioneerList}). Find 4-10 strong paragraphs — prioritize
   E.J. Waggoner and A.T. Jones (the 1888 righteousness-by-faith men). Return refcode_short, author, snippet.
4) Also read ${SRC}/transcript.txt and ${SRC}/definition.md for context — but DB refs are what you return.

Return ONLY the structured object. Verify each ref actually returned a row before including it.`,
      { label: 'gather:' + s.key, phase: 'Gather', schema: CLOUD_SCHEMA },
    ).then((cloud) => ({ s, cloud })),

  // --- STAGE 2: DRAFT the section in handbook style from the cloud ------------
  (prev) => {
    if (!prev || !prev.cloud) return null;
    const { s, cloud } = prev;
    return agent(
      `You are drafting ONE section of a Haskell-Bible-Handbook-style study on RIGHTEOUSNESS BY FAITH.

${STYLE}

The MASTER you are imitating is at ${MASTER} — read its section "## 17. The Day of the LORD" and the
appendix to match voice and the DEFINITION/Symbols-defined-here/Symbols-carried closing pattern EXACTLY.
Also read ${SRC}/definition.md (the author's governing thesis — the IMAGE thread) and
${SRC}/transcript.txt (the nature-of-man source; lean on it for any nature-of-Christ material).

SECTION key="${s.key}"
TITLE (use verbatim as the "## ${s.title}" heading): "${s.title}"
SCOPE: ${s.scope}
This section OWNS (defines) these symbols: ${JSON.stringify(s.symbols)}.

CLOUD OF WITNESSES you may cite (use ONLY these refs + canonical KJV verses you are certain of —
NEVER invent a refcode):
BIBLE:
${cloud.bible.map((b) => '  ' + b.ref + ' :: ' + b.text).join('\n')}
EGW:
${cloud.egw.map((e) => '  ' + e.ref + ' (' + e.author + ') :: ' + e.text).join('\n')}
PIONEER:
${cloud.pioneer.map((p) => '  ' + p.ref + ' (' + p.author + ') :: ' + p.text).join('\n')}

Produce the section markdown: the "## ${s.title}" heading, the ">" thesis line, the verse-walk with
inline symbol definitions, the closing "**DEFINITION — ${s.title.toUpperCase()} =** ..." paragraph,
"**Symbols defined here:**" list, and "**Symbols carried:**" (reference owning sections by title).
Return markdown + the structured symbols list (name + one-line definition with receipts) for the appendix.`,
      { label: 'draft:' + s.key, phase: 'Draft', schema: SECTION_SCHEMA },
    ).then((draft) => ({ s, draft }));
  },

  // --- STAGE 3: VERIFY every ref against the DBs, return corrected markdown ----
  // NOTE: the agent returns its OWN key field; we DO NOT trust it. We re-attach the
  // script's original section `s` so assembly keys off our table, not the LLM's echo.
  (prev) => {
    if (!prev || !prev.draft) return null;
    const { s, draft } = prev;
    return agent(
      `You are the VERIFIER for one handbook section. Adversarially re-check EVERY citation.

SECTION title="${s.title}". Here is the drafted markdown:
---
${draft.markdown}
---

For EVERY reference in the draft:
- BIBLE refs (e.g. _John 1:1_): run \`bun run packages/cli/src/main.ts verse "John 1:1"\` (from
  /Users/cvr/Developer/personal/bible-tools) and confirm the quoted KJV phrase actually appears. Fix any
  misquote; DELETE any verse that does not exist or does not say what the gloss claims.
- EGW/pioneer refs (e.g. _DA 24.1_, _ChS 50.1_): first \`set -a; source packages/cli/.env; set +a\`, then
  run \`bun run packages/cli/src/main.ts egw lookup "DA 24.1"\` and confirm the quoted phrase + author.
  Fix misquotes/wrong author; DELETE any refcode that does not resolve. (Bash needs dangerouslyDisableSandbox
  for ~/.bible.) You may also query ~/.bible/egw-paragraphs.db directly via sqlite/bun to confirm author.
- Keep the handbook STYLE intact (ref→gloss, inline symbol defs, the DEFINITION + Symbols-defined-here +
  Symbols-carried closing). Do not add new claims; only correct/trim to what verifies.

Return the corrected section markdown + the (corrected) symbols list. Note in NOTHING but the data —
the markdown IS the deliverable.`,
      { label: 'verify:' + s.key, phase: 'Verify', schema: SECTION_SCHEMA },
    ).then((v) =>
      v
        ? { key: s.key, title: s.title, part: s.part, markdown: v.markdown, symbols: v.symbols }
        : null,
    );
  },
);

const sections = built.filter(Boolean);
log('verified sections: ' + sections.length + ' / ' + RUN.length);

if (!DO_ASSEMBLE) {
  return { built: sections.map((x) => ({ key: x.key, title: x.title, bytes: x.markdown.length })) };
}

// ----------------------------------------------------------------------------
// PHASE 4: ASSEMBLE — order by the SECTIONS list, number headings, build TOC,
// and regenerate the Symbol Dictionary appendix (dedup, alphabetical).
// ----------------------------------------------------------------------------
const order = new Map(SECTIONS.map((s, i) => [s.key, i]));
sections.sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99));

// Part assignment + numbering follow each section's OWN part field (carried from the
// script table in stage 3 — never the LLM-echoed key).
let n = 0;
const partI = [],
  partII = [];
for (const sec of sections) {
  n++;
  // renumber the "## Title" heading to "## n. Title"
  const numbered = sec.markdown.replace(/^##\s+.*$/m, '## ' + n + '. ' + sec.title);
  (sec.part === 'I' ? partI : partII).push({ n, title: sec.title, md: numbered });
}

const toc = (arr) => arr.map((x) => x.n + '. ' + x.title).join('\n');

// Symbol dictionary: gather every symbol, keyed by the OWNING section title.
const dict = new Map();
for (const sec of sections) {
  for (const sym of sec.symbols || []) {
    const key = sym.name
      .toLowerCase()
      .replace(/^the\s+/, '')
      .replace(/^a\s+/, '')
      .trim();
    if (!dict.has(key)) dict.set(key, { name: sym.name, def: sym.definition, owner: sec.title });
  }
}
const appendix = [...dict.values()]
  .sort((a, b) =>
    a.name
      .toLowerCase()
      .replace(/^(the|a)\s+/, '')
      .localeCompare(b.name.toLowerCase().replace(/^(the|a)\s+/, '')),
  )
  .map(
    (d) =>
      '- **' +
      d.name +
      '** = ' +
      d.def.replace(/^\*\*?[^=]*=\s*/, '') +
      ' — defined in "' +
      d.owner +
      '".',
  )
  .join('\n');

const doc = `---
created_at: '2026-06-17T12:00:00Z'
topic: 'Righteousness by Faith — A Bible Handbook Study'
---

# Righteousness by Faith — A Bible Handbook Study

**Thesis.** What sin lost was the IMAGE of God in man (_Gen. 1:26_; _Gen. 5:3_) — His glory, His name, His character (_Exo. 33-34_); and with it His presence (_Isa. 59:2_) and the life that comes from Him (_Eze. 18:20_). The Law is an image of God (God is love — _1 John 4:8_ — and the law is love's standard), so the schoolmaster shows us the image we have marred. Christ is the EXPRESS image (_Heb. 1:3_) and the Life (_John 14:6_); He took our nature, was tempted in all points yet without sin (_Heb. 4:15_), and came to restore the image. By beholding His glory we are changed into the same image (_2 Cor. 3:18_), and truth is the sanctifier (_John 17:17_). The sanctuary is the structure of that restoration: Christ is the Ladder, the Gate, the House of God (_John 1:51_; _John 10:9_; _1 Chr. 28:10_), and its three compartments are Justification, Sanctification, and Glorification.

**Method.** After Haskell's _Bible Handbook_: every line is ref → gloss, Bible and pioneer/EGW alike. Each passage is walked, and every symbol is defined the first time it appears — **symbol** = meaning, with the Scripture receipts that prove it (Miller's Rule 12: let the Bible define its own figures); later sections reference the owning section by title. Every section closes with the **DEFINITION** the verses built; the appendix gathers every symbol into one dictionary. The cloud of witnesses is the pioneers (esp. Waggoner and Jones of 1888) and Ellen White, each verified against the local corpus.

---

## Table of Contents

**Part I — The Image, the Law, the Life**

${toc(partI)}

**Part II — The Sanctuary: Justification, Sanctification, Glorification**

${partII.map((x) => x.n + '. ' + x.title).join('\n')}

Appendix — Symbol Dictionary

---

# Part I — The Image, the Law, the Life

${partI.map((x) => x.md).join('\n\n---\n\n')}

---

# Part II — The Sanctuary: Justification, Sanctification, Glorification

${partII.map((x) => x.md).join('\n\n---\n\n')}

---

## Appendix — Symbol Dictionary

Every symbol defined in this handbook, alphabetically (leading articles ignored), with its receipts and owning section.

${appendix}
`;

// Scripts have no filesystem access — return the assembled doc; the caller writes it to disk.
return { doc, sectionCount: sections.length, partI: partI.length, partII: partII.length };
