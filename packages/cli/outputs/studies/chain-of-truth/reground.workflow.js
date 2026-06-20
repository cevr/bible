export const meta = {
  name: 'chain-of-truth-reground',
  description:
    'Re-ground every symbol in The Chain of Truth handbook so the BIBLE defines the symbol first (verse / chapter / cross-canon), with pioneer/EGW demoted to secondary corroboration. Per-section: find-receipts → adversarial verify-they-define → opus rewrite. Then appendix reconcile + final verify.',
  phases: [
    {
      title: 'Find',
      detail:
        'per section, find biblical receipts that DEFINE each symbol (verse, chapter, cross-canon)',
    },
    {
      title: 'Verify',
      detail:
        'adversarially check each receipt truly defines (not merely mentions) the symbol; flag weak-Bible cases',
    },
    {
      title: 'Rewrite',
      detail: 'opus rewrites each section: Scripture proves first, pioneer/EGW corroborates after',
    },
    {
      title: 'Appendix',
      detail: 'reconcile the Symbol Dictionary to the re-grounded section defs',
    },
    {
      title: 'Assemble+Verify',
      detail: 'stitch the handbook; machine re-verify every Bible + pioneer receipt',
    },
  ],
};

const REPO = '/Users/cvr/Developer/personal/bible-tools';
const WORK = `${REPO}/packages/cli/outputs/studies/chain-of-truth/reground`;
const SECT = `${WORK}/sections`;
const OUTSECT = `${WORK}/out`;
const OUT = `${REPO}/packages/cli/outputs/studies/2026-06-19-the-chain-of-truth-a-bible-handbook-study.md`;

const RULE = `
## THE RE-GROUNDING RULE (the whole point of this pass)
Miller's Rule 12 / "the key opens the casket": the BIBLE must define its own figures. For EVERY symbol definition in the handbook — every "**symbol** = meaning (...)" — the PRIMARY proof must be SCRIPTURE: the verse itself, another verse in the same chapter, or verses elsewhere in the canon that DEFINE the symbol. Pioneer/EGW citations (DAR, MWV*, GC, EW, PREX*, etc.) may remain ONLY as SECONDARY corroboration, placed AFTER the biblical receipts. A pioneer/EGW reference must NEVER be the sole or first proof of a symbol's meaning.

WHERE SCRIPTURE GENUINELY DOES NOT SELF-DEFINE the symbol (established by historical fulfillment, not a defining verse — e.g. little horn = Rome; the 1843/1844 dating; the year-day APPLIED to a specific date): do NOT force or strain a verse. Mark it explicitly — e.g. "(no direct biblical definition — established by historical fulfillment; see _PIONEER REF_)" — and let the pioneer/EGW citation carry it, honestly labeled. Honesty over false rigor.

A receipt "DEFINES" a symbol only if Scripture itself makes the equation, e.g.:
- within the verse: "the seven heads are seven mountains" (Rev 17:9), "the waters... are peoples" (Rev 17:15)
- within the chapter / context: Dan 7:17,23 "these great beasts are four kings/kingdoms"
- cross-canon: a beast = a kingdom (Dan 7:17,23) used to read Rev 13's beast; a day = a year (Num 14:34; Eze 4:6)
A verse that merely MENTIONS or USES the symbol without equating it to a meaning does NOT define it — flag those.
`;

const TOOLS = `
## Tools (repo root: ${REPO})
KJV verse text (authoritative — quote exactly; parse .verses[]):
  bun run packages/cli/src/main.ts verse "Daniel 7:17" --json
  (avoid commas in the ref; use ranges. One verse or a range per call.)
Pioneer/EGW (to KEEP a secondary ref valid, confirm it still resolves):
  bible egw "DAR 52.1"        (read a paragraph)   ·   bible egw search "phrase" --limit 6
NEVER invent a refcode. Verify every Bible quote and every retained pioneer refcode.
`;

// ---- the 16 sections (file slices already written to disk) ----
const SECTIONS = Array.from({ length: 16 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { key: n, file: `${SECT}/${n}.md`, out: `${OUTSECT}/${n}.md` };
});

const FIND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['symbols'],
  properties: {
    symbols: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: [
          'symbol',
          'currentMeaning',
          'biblicalReceipts',
          'pioneerSecondary',
          'selfDefiningStatus',
        ],
        properties: {
          symbol: { type: 'string' },
          currentMeaning: {
            type: 'string',
            description: 'the meaning as the handbook currently states it',
          },
          biblicalReceipts: {
            type: 'array',
            description: 'verses that DEFINE the symbol, with the defining clause',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['ref', 'definingText', 'kind'],
              properties: {
                ref: { type: 'string' },
                definingText: {
                  type: 'string',
                  description: 'verbatim KJV clause that makes the equation',
                },
                kind: { type: 'string', description: 'in-verse | in-chapter | cross-canon' },
              },
            },
          },
          pioneerSecondary: {
            type: 'array',
            items: { type: 'string' },
            description: 'pioneer/EGW refs to KEEP as secondary corroboration',
          },
          selfDefiningStatus: {
            type: 'string',
            description: 'self-defining | historical-fulfillment (flag, keep pioneer) | indirect',
          },
        },
      },
    },
  },
};

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['symbol', 'receiptChecks', 'ruling', 'note'],
        properties: {
          symbol: { type: 'string' },
          receiptChecks: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['ref', 'status'],
              properties: {
                ref: { type: 'string' },
                status: {
                  type: 'string',
                  description: 'defines | only-mentions | misquoted | not-found',
                },
              },
            },
          },
          ruling: {
            type: 'string',
            description:
              'bible-grounded | needs-better-verse | historical-fulfillment-ok | unresolved',
          },
          note: { type: 'string' },
        },
      },
    },
  },
};

// ===========================================================================
phase('Find');

const built = await pipeline(
  SECTIONS,

  // Stage 1: find biblical receipts for every symbol in the section
  (s) =>
    agent(
      `You are the SCRIPTURE-GROUNDER for one handbook section. Read the section file at ${s.file}. List EVERY symbol definition in it (every "**symbol** = meaning (...)", inline and in its "Symbols defined here" block). For each, find the SCRIPTURE that DEFINES the symbol — in the verse, in the chapter, or cross-canon — and pull the verbatim KJV defining clause via the verse CLI. Mark which existing pioneer/EGW refs should stay as SECONDARY. Where the Bible does not self-define (historical fulfillment), say so and keep the pioneer ref.
${RULE}
${TOOLS}
Work only on symbols THIS section owns/defines (skip ones it merely carries from another section). Your final message IS the structured data.`,
      { label: `find:${s.key}`, phase: 'Find', schema: FIND_SCHEMA, agentType: 'general-purpose' },
    ).then((find) => ({ s, find })),

  // Stage 2: adversarial verify each receipt actually DEFINES the symbol
  (bundle) => {
    const { s, find } = bundle;
    return agent(
      `You are the ADVERSARIAL RECEIPT VERIFIER. For the section file ${s.file}, the grounder proposed biblical receipts for each symbol (below). REFUTE, don't rubber-stamp. For each receipt, run the verse CLI and decide: does the verse TEXT actually DEFINE the symbol (make the equation), or does it merely MENTION/USE it? Mark "only-mentions" for the latter — those don't count as definitions. Confirm each retained pioneer ref still resolves (\`bible egw "REF"\`). Rule each symbol: bible-grounded / needs-better-verse / historical-fulfillment-ok / unresolved.
${RULE}
${TOOLS}
### GROUNDER OUTPUT:
${JSON.stringify(find)}
Verify hard. Your final message IS the structured review.`,
      {
        label: `verify:${s.key}`,
        phase: 'Verify',
        schema: VERIFY_SCHEMA,
        agentType: 'general-purpose',
      },
    ).then((verify) => ({ s, find, verify }));
  },

  // Stage 3: opus rewrites the section, Scripture-first
  async (bundle) => {
    const { s, find, verify } = bundle;
    const md = await agent(
      `You are the OPUS REWRITER for one handbook section. Read the current section at ${s.file}. Rewrite it so EVERY symbol definition leads with its SCRIPTURE receipts (the verses that DEFINE it) and demotes pioneer/EGW to SECONDARY corroboration after the biblical proof. Use ONLY receipts the verifier ruled "defines" (drop "only-mentions"). For symbols ruled "historical-fulfillment-ok", keep the pioneer ref but add the explicit flag "(no direct biblical definition — established by historical fulfillment)". For "needs-better-verse"/"unresolved", use the best defining verse the verifier accepted, or flag honestly — never fabricate.

PRESERVE EVERYTHING ELSE about the section: its prose, narrative, ref→gloss flow, the ">" thesis line, the DEFINITION closer, the "Symbols defined here / carried" blocks, exact handbook style and formatting. This is a SURGICAL re-grounding of the symbol-definition parentheticals + any inline definition bullets — not a rewrite of the history or doctrine. Keep KJV quotes verbatim. Do not renumber the section.
${RULE}
### FIND (proposed receipts):
${JSON.stringify(find)}
### VERIFY (authoritative — obey rulings):
${JSON.stringify(verify)}

Output ONLY the full rewritten section markdown (starting with its "## N." header). No preamble, no code fences. Your final message IS the section markdown.`,
      { label: `rewrite:${s.key}`, phase: 'Rewrite', model: 'opus', agentType: 'general-purpose' },
    );
    await agent(
      `Write this exact content to ${s.out} using the Write tool, then reply "ok ${s.key}". Content between markers, exclusive:\n<<<BEGIN>>>\n${md}\n<<<END>>>`,
      { label: `save:${s.key}`, phase: 'Rewrite', agentType: 'general-purpose' },
    );
    return { key: s.key, markdown: md, find, verify };
  },
);

const sections = built.filter(Boolean).sort((a, b) => a.key.localeCompare(b.key));
log(`Re-grounded ${sections.length}/16 sections.`);

// ===========================================================================
phase('Appendix');

const allDefs = sections.map((s) => `<<<SECTION ${s.key}>>>\n${s.markdown}`).join('\n\n');
const appendixMd = await agent(
  `You are the OPUS APPENDIX RECONCILER. The 16 sections were just re-grounded so each symbol is defined Scripture-first, pioneer-secondary. Read the current appendix at ${SECT}/99-appendix.md and rewrite EVERY Symbol Dictionary entry to match the re-grounded section definitions: biblical receipts first, pioneer/EGW secondary, historical-fulfillment flags carried through. Keep alphabetical order (leading articles ignored), keep the "— defined in \\"TITLE\\"" attribution, keep the "## Appendix — Symbol Dictionary" header and intro line. Every entry's receipts must match what its owning section now says.
${RULE}
### THE RE-GROUNDED SECTIONS (source of truth for each symbol's receipts):
${allDefs}

Output ONLY the full appendix markdown (starting with "## Appendix — Symbol Dictionary"). No preamble, no fences.`,
  { label: 'appendix', phase: 'Appendix', model: 'opus', agentType: 'general-purpose' },
);
await agent(
  `Write this exact content to ${OUTSECT}/99-appendix.md using the Write tool, then reply "ok appendix". Content between markers, exclusive:\n<<<BEGIN>>>\n${appendixMd}\n<<<END>>>`,
  { label: 'save:appendix', phase: 'Appendix', agentType: 'general-purpose' },
);

// ===========================================================================
phase('Assemble+Verify');

// Stitch head + 16 rewritten sections + rewritten appendix into the final handbook.
await agent(
  `Assemble the final handbook with the Bash/Read/Write tools. Concatenate, in this exact order, with a single blank line between files:
1. ${SECT}/00-head.md  (unchanged front matter + thesis + method + TOC)
2. ${OUTSECT}/01.md through ${OUTSECT}/16.md  (the re-grounded sections, in numeric order)
3. ${OUTSECT}/99-appendix.md  (the reconciled appendix)
Write the result to ${OUT} (overwrite). Then reply with the final line count.`,
  { label: 'assemble', phase: 'Assemble+Verify', agentType: 'general-purpose' },
);

const [bibleReport, ruleReport] = await Promise.all([
  agent(
    `You are the RECEIPT VERIFIER. Read the finished handbook at ${OUT}. (1) Extract every italicized BIBLE verse reference inside a symbol definition and a sample of body verses; run \`bun run packages/cli/src/main.ts verse "REF" --json\` and confirm the quoted KJV words match. (2) Extract every pioneer/EGW refcode; run \`bible egw "REF"\` and confirm it resolves and (where quoted) contains the words. Report PASS count and a FAIL list (ref → problem). Be exhaustive on symbol-definition verses.
Repo root: ${REPO}.`,
    { label: 'verify:receipts', phase: 'Assemble+Verify', agentType: 'general-purpose' },
  ),
  agent(
    `You are the RULE AUDITOR. Read the finished handbook at ${OUT}. Audit the re-grounding rule: for EVERY symbol definition (inline + appendix), confirm SCRIPTURE comes FIRST and any pioneer/EGW ref is SECONDARY (after the biblical proof). FLAG any symbol where (a) a pioneer/EGW ref is still the FIRST or SOLE proof, (b) the biblical receipt merely mentions rather than defines the symbol, or (c) a "historical-fulfillment" flag is missing where Scripture clearly doesn't self-define. List each violation with section + symbol + the fix. Also confirm section defs and appendix entries agree.
Repo root: ${REPO}.`,
    { label: 'verify:rule', phase: 'Assemble+Verify', agentType: 'general-purpose' },
  ),
]);

return { sectionsRegrounded: sections.length, handbookPath: OUT, bibleReport, ruleReport };
