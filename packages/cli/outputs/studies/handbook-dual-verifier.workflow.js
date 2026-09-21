export const meta = {
  name: 'handbook-dual-verifier',
  description:
    'Dual-agent adversarial verifier for a Bible handbook study: two independent verifiers (citation-integrity + doctrinal-coherence) check the same file from different angles, then a reconciler cross-checks their findings — confirming overlaps, resolving disagreements, and surfacing what one caught and the other missed. Pass the handbook path as args.',
  whenToUse:
    'Verify a finished handbook/study markdown file: every refcode resolves and quotes match, the doctrine is coherent and Bible-first, cross-references and structure hold. Pass {path} or a bare path string as args.',
  phases: [
    {
      title: 'Verify',
      detail:
        'two independent verifiers run in parallel: A = citations/refcodes/quotes, B = doctrine/coherence/structure',
    },
    {
      title: 'Reconcile',
      detail:
        'adversarial reconciler cross-checks both reports, resolves conflicts, surfaces gaps, ranks the final defect list',
    },
  ],
};

// ---------------------------------------------------------------------------
// Inputs: pass args as a bare path string, or { path, bibleOnly }.
// ---------------------------------------------------------------------------
const REPO = '/Users/cvr/Developer/personal/bible-tools';
const RAW = typeof args === 'string' ? { path: args } : args || {};
const PATH =
  RAW.path ||
  `${REPO}/packages/cli/outputs/studies/2026-06-20-the-chain-of-truth-a-bible-only-handbook-study.md`;
// bibleOnly: when true, the verifiers also enforce the Bible-primary / pioneer-secondary discipline.
const BIBLE_ONLY = RAW.bibleOnly !== false; // default true; pass {bibleOnly:false} to relax

const TOOLS = `
## Tools (repo root: ${REPO}; local lookups need NO auth)
- KJV scripture:   bun run packages/cli/src/main.ts verse "Daniel 8:14" --json   (parse .verses[]; ranges not comma-lists; strip ‹ › red-letter markers)
- Pioneer/EGW:     bible egw "REF"                 read an exact paragraph (confirm it contains the quoted words)
- Find a refcode:  bible egw search "plain words" --limit 8   (NO hyphens/quotes inside the phrase — the FTS parser trips)
NEVER trust a citation you did not resolve with these tools. A refcode that does not resolve, or whose paragraph does not contain the quoted words, is a FAIL.
`;

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'checkedCount', 'fails', 'suspects', 'notes'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'pass-with-fixes', 'fail'] },
    checkedCount: {
      type: 'integer',
      description: 'how many distinct items you actually resolved with the tools',
    },
    fails: {
      type: 'array',
      description:
        'confirmed defects — each independently reproduced with a tool or by reading the file',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['where', 'problem', 'evidence', 'severity', 'fix'],
        properties: {
          where: { type: 'string', description: 'section title + the ref/line in question' },
          problem: { type: 'string' },
          evidence: {
            type: 'string',
            description: 'what the tool returned / what the file says, that proves the defect',
          },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          fix: { type: 'string' },
        },
      },
    },
    suspects: {
      type: 'array',
      description: 'things that look wrong but you could not conclusively confirm',
      items: { type: 'string' },
    },
    notes: { type: 'string' },
  },
};

// ---------------------------------------------------------------------------
// Phase 1: two independent verifiers, different angles, in parallel.
// ---------------------------------------------------------------------------
phase('Verify');

const bibleOnlyClause = BIBLE_ONLY
  ? `\nThis handbook is meant to be BIBLE-PRIMARY: every symbol/doctrine must be defined from Scripture, with pioneer/EGW citations only for bare historical facts or a single confirmation placed AFTER Scripture. FLAG as a defect any symbol or doctrine that rests primarily on a pioneer/EGW source, and any section exceeding ~2 pioneer refs.`
  : '';

const [reportA, reportB] = await parallel([
  // Verifier A — citation & quote integrity (the mechanical, exhaustive pass)
  () =>
    agent(
      `You are VERIFIER A — CITATION INTEGRITY. Read the handbook at ${PATH}.
${TOOLS}
Your job, exhaustively:
1. Extract EVERY pioneer/EGW refcode (italic ALLCAPS code + number, e.g. GC 374.1, DAR 192.1 — NOT bare Bible verses). For each, run \`bible egw "REF"\` and confirm (a) the paragraph exists and (b) it actually contains the quoted words. Any mismatch is a FAIL with the tool output as evidence.
2. Spot-check 25-30 KJV verse quotes spread across all parts via the verse tool — confirm the quoted phrase is truly in the verse. Misquotes are FAILs.
3. Report counts: total Bible refs (approx), total pioneer refs (with per-section count).${bibleOnlyClause}
Be adversarial — assume a citation is wrong until the tool proves it right. Return the structured verdict; checkedCount = how many refs you actually resolved.`,
      {
        label: 'verify:citations',
        phase: 'Verify',
        schema: VERDICT_SCHEMA,
        agentType: 'general-purpose',
      },
    ),

  // Verifier B — doctrinal coherence & structure (the judgment pass)
  () =>
    agent(
      `You are VERIFIER B — DOCTRINAL COHERENCE & STRUCTURE. Read the whole handbook at ${PATH} end to end.
${TOOLS}
Judge, with concrete section-level evidence:
1. COHERENCE: does the argument/chain hold section to section? Any internal CONTRADICTION — a symbol defined two ways, a date or number stated differently, a claim one section makes that another undercuts?
2. CROSS-REFERENCES: does every in-body "(see \\"TITLE\\")" / "Symbols carried" pointer reference a section title that ACTUALLY EXISTS in this file? List every dead pointer (the bogus title → which real section it should be, or "drop").
3. STRUCTURE: every section has its ">" thesis, its "**DEFINITION — ...**" closer, and the symbol machinery? TOC matches the body titles? Any stray template markers ([CHAIN]/[KEY]) or leftover narration that should not be there?
4. SYMBOLS: is each symbol defined from Scripture (verify a few definitional verses with the verse tool)?${bibleOnlyClause}
Be adversarial — press the weakest links. Return the structured verdict; checkedCount = how many sections/claims you scrutinized.`,
      {
        label: 'verify:coherence',
        phase: 'Verify',
        schema: VERDICT_SCHEMA,
        agentType: 'general-purpose',
      },
    ),
]);

log(
  `Verifier A: ${reportA?.verdict} (${reportA?.fails?.length ?? '?'} fails) · Verifier B: ${reportB?.verdict} (${reportB?.fails?.length ?? '?'} fails)`,
);

// ---------------------------------------------------------------------------
// Phase 2: adversarial reconciler — cross-check the two reports.
// ---------------------------------------------------------------------------
phase('Reconcile');

const RECONCILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overallVerdict',
    'confirmedDefects',
    'disputed',
    'missedByOne',
    'falsePositives',
    'summary',
  ],
  properties: {
    overallVerdict: { type: 'string', enum: ['pass', 'pass-with-fixes', 'fail'] },
    confirmedDefects: {
      type: 'array',
      description:
        'defects confirmed real — both verifiers found it, OR you independently re-verified it with a tool',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['where', 'problem', 'severity', 'fix', 'confirmedBy'],
        properties: {
          where: { type: 'string' },
          problem: { type: 'string' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          fix: { type: 'string' },
          confirmedBy: { type: 'string', description: 'both | A+tool | B+tool | reconciler-tool' },
        },
      },
    },
    disputed: {
      type: 'array',
      description:
        'one verifier flagged it, the other did not — and you could not settle it with a tool; needs a human eye',
      items: { type: 'string' },
    },
    missedByOne: {
      type: 'array',
      description:
        'a real defect that only ONE verifier caught — note which, so coverage gaps are visible',
      items: { type: 'string' },
    },
    falsePositives: {
      type: 'array',
      description:
        'a flagged "defect" you re-checked with a tool and found to be WRONG (the citation/claim is actually fine)',
      items: { type: 'string' },
    },
    summary: {
      type: 'string',
      description:
        'plain-language bottom line: is the handbook sound, and what must be fixed first',
    },
  },
};

const reconciled = await agent(
  `You are the ADVERSARIAL RECONCILER. Two independent verifiers checked the handbook at ${PATH}. Cross-check their findings — do NOT just merge them.
${TOOLS}
For EACH defect either verifier reported:
- If both reported it → confirmed (still spot-check the most severe with a tool).
- If only one reported it → independently RE-VERIFY with the tools. If the tool confirms it, it is a real defect that the OTHER verifier MISSED (record in missedByOne). If the tool shows the claim is actually fine, it is a FALSE POSITIVE (record in falsePositives, with the tool evidence).
- If you cannot settle it with a tool → disputed.
Then rank all confirmed defects P0/P1/P2 and give the overall verdict.

### VERIFIER A (citation integrity) report:
${JSON.stringify(reportA, null, 2)}

### VERIFIER B (coherence & structure) report:
${JSON.stringify(reportB, null, 2)}

Resolve hard, with receipts. Return the structured reconciliation.`,
  {
    label: 'reconcile',
    phase: 'Reconcile',
    schema: RECONCILE_SCHEMA,
    model: 'opus',
    agentType: 'general-purpose',
  },
);

return {
  path: PATH,
  bibleOnly: BIBLE_ONLY,
  verifierA: reportA,
  verifierB: reportB,
  reconciled,
};
