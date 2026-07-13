export const meta = {
  name: 'handbook-factory-fable',
  description:
    'Handbook factory, Fable edition: OPUS agents gather the clouds of witnesses (Bible + EGW/pioneer, verified); FABLE (the session model) drafts each section twice, cross-critiques, synthesizes, and dual-verifies with an auto-fix loop; the deterministic `bible handbook save` CLI assembles; a Fable dual final review + reconciler closes it out. Pass {specPath} as args.',
  whenToUse:
    'Generate a Bible handbook / Sabbath School study from a spec.js with opus witness-gathering and session-model (Fable) writing/verification. Pass args={specPath:"/abs/path/to/x.spec.js"}.',
  phases: [
    { title: 'Spec', detail: 'read + validate the handbook spec file' },
    {
      title: 'Witnesses',
      detail:
        'OPUS per section: gather the cloud of witnesses — Bible primary, EGW/pioneer secondary, all verified',
      model: 'opus',
    },
    {
      title: 'Draft',
      detail:
        'Fable dual-agent section creation: two writers draft each section independently from the witnesses',
    },
    {
      title: 'Critique',
      detail:
        'Fable cross-agent critique: each draft adversarially reviewed against the other + the witnesses',
    },
    {
      title: 'Synthesize',
      detail: 'Fable synthesizer fuses the two drafts + critique into one section',
    },
    {
      title: 'Verify-Section',
      detail:
        'Fable dual-agent verifier per section (citations + coherence); auto-fix loop capped at 2 rounds',
    },
    {
      title: 'Aggregate',
      detail:
        'deterministic `bible handbook save` stitches sections + front matter + TOC + Symbol Dictionary (no LLM)',
    },
    {
      title: 'Final-Review',
      detail:
        'Fable dual whole-document review + reconciler; fixes applied at section source, then re-assembled; capped at 2 rounds',
    },
  ],
};

// ===========================================================================
// Inputs
// ===========================================================================
const REPO = '/Users/cvr/Developer/personal/bible-tools';
const RAW = typeof args === 'string' ? { specPath: args } : args || {};
const SPEC_PATH = RAW.specPath;
if (!SPEC_PATH)
  throw new Error('handbook-factory-fable: pass args={specPath:"/abs/path/to/handbook.spec.js"}');

const SECTION_FIX_ROUNDS = RAW.sectionFixRounds ?? 2;
const FINAL_FIX_ROUNDS = RAW.finalFixRounds ?? 2;
// The witness-gatherers run on opus per the design; everything else inherits
// the session model (Fable).
const WITNESS_MODEL = RAW.witnessModel ?? 'opus';

// ===========================================================================
// Phase 0 — read + validate the spec (sandbox can't import; an agent reads it).
// ===========================================================================
phase('Spec');

const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title',
    'topic',
    'thesis',
    'method',
    'bibleOnly',
    'outPath',
    'sectionsDir',
    'templatePath',
    'sections',
  ],
  properties: {
    title: { type: 'string', description: 'the H1, e.g. "X — A Bible Handbook Study"' },
    topic: { type: 'string', description: 'the frontmatter topic (usually == title)' },
    createdAt: {
      type: 'string',
      description: "ISO date for frontmatter, e.g. '2026-06-20T12:00:00Z'",
    },
    thesis: { type: 'string', description: 'the Thesis paragraph text (or a tight brief for it)' },
    method: { type: 'string', description: 'the Method paragraph text (or a tight brief for it)' },
    bibleOnly: {
      type: 'boolean',
      description:
        'true = Scripture-primary, EGW/pioneer only for historical facts + capped confirmations',
    },
    sabbathSchool: {
      type: 'boolean',
      description: 'true = add "For discussion" questions to each section',
    },
    outPath: { type: 'string', description: 'absolute path to write the final handbook .md' },
    sectionsDir: { type: 'string', description: 'absolute dir to persist per-section .md files' },
    templatePath: {
      type: 'string',
      description: 'absolute path to a template handbook to copy the format from',
    },
    sources: {
      type: 'string',
      description: 'optional: extra source-map notes (which corpus books/codes to prefer)',
    },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'part', 'title', 'scope', 'terms', 'symbols'],
        properties: {
          key: { type: 'string', description: 'stable id, e.g. "01-casket-key"' },
          part: { type: 'string', description: 'Part label, e.g. "I — The Method"' },
          title: { type: 'string', description: 'exact section heading text (no "## N." prefix)' },
          scope: { type: 'string', description: 'what this section must cover, doctrinally' },
          terms: {
            type: 'array',
            items: { type: 'string' },
            description: 'KJV phrases / key terms to gather',
          },
          symbols: {
            type: 'array',
            items: { type: 'string' },
            description: 'symbols this section owns (must be Bible-definable)',
          },
        },
      },
    },
  },
};

const spec = await agent(
  `Read the JavaScript handbook-spec file at ${SPEC_PATH} (use the Read tool). It exports a spec object (default export or module.exports) with the handbook's title, thesis/method, sourcing flags, output paths, and a sections[] array. Parse it and return it as the structured object. Resolve any relative paths against ${REPO}. If a field is missing, infer a sensible default (createdAt = today at noon UTC; sabbathSchool default false; topic = title). Your final message IS the structured spec.`,
  { label: 'read-spec', phase: 'Spec', schema: SPEC_SCHEMA, agentType: 'general-purpose' },
);

const SECTIONS = spec.sections;
const BIBLE_ONLY = spec.bibleOnly;
const SABBATH_SCHOOL = !!spec.sabbathSchool;
log(
  `Spec loaded: "${spec.title}" — ${SECTIONS.length} sections, bibleOnly=${BIBLE_ONLY}, sabbathSchool=${SABBATH_SCHOOL}`,
);

// ===========================================================================
// Shared contracts (spec-driven)
// ===========================================================================
const TOOLS = `
## Tools (repo root: ${REPO}; local lookups need NO auth)
- KJV scripture:  bun run packages/cli/src/main.ts verse "Daniel 8:14" --json   (parse .verses[]; ranges not comma-lists; strip ‹ › red-letter markers)
- Pioneer/EGW:    bible egw "REF"                read an exact paragraph (confirm it contains the quoted words before citing)
- Find a refcode: bible egw search "plain words" --limit 8   (NO hyphens/quotes inside the phrase — the FTS parser trips)
NEVER invent a refcode or a quote. Verify each says what you claim, or DROP it.
${spec.sources ? `\n## Source map (prefer these)\n${spec.sources}` : ''}
`;

const SOURCING = BIBLE_ONLY
  ? `
## SOURCING — BIBLE-ONLY (Miller's Rule: the Bible defines its own figures)
- BIBLE PRIMARY. Every symbol/doctrine is defined FIRST and PRIMARILY from Scripture: the same verse, the
  same chapter, or cross-canon. Use a concordance approach — find where the Bible explains its own figure.
- PIONEER/EGW STRICTLY SECONDARY. Allowed ONLY for (a) a bare HISTORICAL fact Scripture cannot supply
  (a date/place/who), or (b) a single CONFIRMATION placed AFTER Scripture has carried the point. NEVER to
  prove a doctrine or define a symbol. Hard cap ~0-2 pioneer refs per section; zero where Scripture suffices.
`
  : `
## SOURCING — BIBLE-PRIMARY with a verified cloud of witnesses
- BIBLE FIRST. Every symbol/doctrine is defined first from Scripture (Miller's Rule). Let the Bible define its figures.
- The pioneer/EGW cloud of witnesses (Waggoner, Jones, Haskell, Andrews, Smith, Litch, and Ellen White)
  CORROBORATES after the Scripture — never the sole/primary proof of a doctrine. Verify EVERY refcode.
`;

const STYLE = `
## STYLE — copy the template handbook EXACTLY
Template (format reference only): ${spec.templatePath}. Read it before writing.
- After Haskell's Bible Handbook: every line is **ref → gloss**, SCANNABLE.
- Section opens "## ${'${'}TITLE}" then a one-line ">" blockquote thesis for the section.
- Walk the passages. FIRST time a symbol appears, define it inline FROM SCRIPTURE:
  "  - **symbol** = meaning (_Scripture receipt 1_; _receipt 2_)."
- Verse→gloss: "- _Dan. 8:14._ \\"KJV phrase...\\" — one-line gloss." Italicize refs; quote KJV verbatim.
- ${BIBLE_ONLY ? 'Pioneer/EGW lines are RARE, clearly secondary, labeled a confirmation, placed AFTER the Scripture.' : 'Pioneer/EGW line: "- _GC 324.3._ White: \\"...short quote...\\" — gloss." after the Scripture.'}
- Section CLOSES with "**DEFINITION — TITLE =** ..." (one dense paragraph of what the verses built), then
  "**Symbols defined here:**" (bullets) and "**Symbols carried:**" (referencing the OWNING section by exact TITLE).
- Cross-reference other sections by exact TITLE in quotes — and ONLY titles that exist in THIS handbook's section list. NEVER by number.
- NO [CHAIN]/[KEY] markers. Tone: dense, reverent, evidence-first. No filler.
${SABBATH_SCHOOL ? '- SABBATH SCHOOL: end each section with "**For discussion:**" and 1-3 tight, Scripture-anchored, application questions (numbered).' : ''}
`;

const ALL_TITLES = SECTIONS.map((s) => s.title);
const TITLES_NOTE = `\n## The ONLY valid cross-reference targets (this handbook's ${SECTIONS.length} section titles):\n${ALL_TITLES.map((t) => `- "${t}"`).join('\n')}\nNever cite a section title not in this list.`;

// ===========================================================================
// Schemas
// ===========================================================================
const WITNESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['bibleSpine', 'symbolDefs', 'witnesses', 'historyAnchor', 'uncertainties'],
  properties: {
    bibleSpine: {
      type: 'array',
      description: 'Bible-primary verse spine, verified via the verse tool',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'kjv', 'gloss'],
        properties: { ref: { type: 'string' }, kjv: { type: 'string' }, gloss: { type: 'string' } },
      },
    },
    symbolDefs: {
      type: 'array',
      description: 'each symbol defined from SCRIPTURE receipts',
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
    witnesses: {
      type: 'array',
      description: `secondary EGW/pioneer corroboration, every refcode VERIFIED${BIBLE_ONLY ? ' (0-2 max, historical/confirmation only)' : ''}`,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'author', 'quote', 'gloss', 'role'],
        properties: {
          ref: { type: 'string' },
          author: { type: 'string' },
          quote: { type: 'string' },
          gloss: { type: 'string' },
          role: { type: 'string', enum: ['confirmation', 'historical-fact'] },
        },
      },
    },
    historyAnchor: {
      type: 'string',
      description: 'at most one sentence locating the link in time, or ""',
    },
    uncertainties: { type: 'array', items: { type: 'string' } },
  },
};

const CRITIQUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'bibleFirstOk', 'defects', 'unverifiedRefs', 'bestOf'],
  properties: {
    verdict: { type: 'string', enum: ['A-stronger', 'B-stronger', 'comparable'] },
    bibleFirstOk: { type: 'boolean' },
    defects: {
      type: 'array',
      items: { type: 'string' },
      description: 'actionable defects in EITHER draft (label which)',
    },
    unverifiedRefs: {
      type: 'array',
      items: { type: 'string' },
      description: 'refs/quotes that fail tool verification — must be dropped',
    },
    bestOf: {
      type: 'string',
      description: 'which elements of each draft the synthesizer should keep',
    },
  },
};

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'fails', 'notes'],
  properties: {
    verdict: { type: 'string', enum: ['pass', 'pass-with-fixes', 'fail'] },
    fails: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['where', 'problem', 'severity', 'fix'],
        properties: {
          where: { type: 'string' },
          problem: { type: 'string' },
          severity: { type: 'string', enum: ['P0', 'P1', 'P2'] },
          fix: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
  },
};

// ===========================================================================
// Helper: dual-verify a chunk of markdown (citations + coherence), return
// the merged confirmed-fail list. Used for sections AND the final doc.
// Verifiers run on the session model (Fable).
// ===========================================================================
async function dualVerify(label, phaseName, markdown, scopeNote) {
  const [a, b] = await parallel([
    () =>
      agent(
        `You are VERIFIER A — CITATION INTEGRITY for ${scopeNote}.
${TOOLS}
Resolve EVERY pioneer/EGW refcode with \`bible egw "REF"\` (paragraph exists AND contains the quoted words) and spot-check the KJV quotes with the verse tool. Any mismatch is a FAIL with the tool evidence. ${BIBLE_ONLY ? 'Also FLAG any symbol/doctrine resting on a pioneer source, or any section >2 pioneer refs.' : ''}
Be adversarial — assume wrong until the tool proves right.
### CONTENT:
${markdown}`,
        {
          label: `${label}:cite`,
          phase: phaseName,
          schema: VERDICT_SCHEMA,
          agentType: 'general-purpose',
        },
      ),
    () =>
      agent(
        `You are VERIFIER B — COHERENCE & STRUCTURE for ${scopeNote}.
${TOOLS}${TITLES_NOTE}
Judge: internal contradictions (a symbol defined two ways, a date stated differently); cross-references that point to a section title NOT in this handbook's list (dead pointers — name each + the right target or "drop"); structure (">" thesis, "DEFINITION" closer, symbol machinery present); stray [CHAIN]/[KEY] markers or leftover narration; ${BIBLE_ONLY ? 'and whether any symbol/doctrine rests on a pioneer source instead of Scripture.' : 'and whether each symbol is Scripture-defined.'}
Be adversarial — press the weakest links.
### CONTENT:
${markdown}`,
        {
          label: `${label}:cohere`,
          phase: phaseName,
          schema: VERDICT_SCHEMA,
          agentType: 'general-purpose',
        },
      ),
  ]);
  const fails = [...(a?.fails ?? []), ...(b?.fails ?? [])];
  const verdicts = [a?.verdict, b?.verdict];
  return { fails, verdicts, a, b };
}

// ===========================================================================
// Phase 1-6 pipeline, per section:
//   opus witnesses → fable dual draft → fable critique → fable synth →
//   fable verify+fix loop → save
// ===========================================================================
phase('Witnesses');

const built = await pipeline(
  SECTIONS,

  // Stage 1: OPUS gathers the cloud of witnesses (Bible primary, EGW/pioneer verified)
  (s) =>
    agent(
      `You are the WITNESS-GATHERER for handbook section "${s.title}".
Build the cloud of witnesses, BIBLE PRIMARY. Walk the passages, quote KJV verbatim (verify with the verse tool), define every symbol from Scripture, and gather verified ${BIBLE_ONLY ? 'historical/confirmation' : 'pioneer/EGW corroborating'} witnesses.
SECTION SCOPE: ${s.scope}
TERMS to gather: ${(s.terms || []).join(', ')}
SYMBOLS this section owns: ${(s.symbols || []).join(', ')}
${SOURCING}
${TOOLS}
Be exhaustive on the Bible spine (8-16 verses). ${BIBLE_ONLY ? 'At most 0-2 pioneer refs, all historical/confirmation.' : '6-12 verified witnesses.'} Your final message IS the structured witnesses.`,
      {
        label: `witness:${s.key}`,
        phase: 'Witnesses',
        schema: WITNESS_SCHEMA,
        model: WITNESS_MODEL,
        agentType: 'general-purpose',
      },
    ).then((w) => ({ s, w })),

  // Stage 2: FABLE dual-agent section creation — two independent writers from the witnesses
  (prev) => {
    if (!prev) return null;
    const { s, w } = prev;
    const draftPrompt = (angle) =>
      `You are a section WRITER (${angle}) for handbook section "${s.title}", Part ${s.part}.
Write the FULL section markdown in exact handbook style using the verified witnesses below. Bible-first; define each symbol from Scripture; ${BIBLE_ONLY ? 'pioneer refs rare, secondary, labeled confirmations after Scripture' : 'pioneer/EGW corroborate after the Scripture'}.
${STYLE.replace('${TITLE}', s.title)}
Start with "## ${s.title}", the ">" thesis, the walked body, the "**DEFINITION — ...**" closer, "**Symbols defined here:**", "**Symbols carried:**"${SABBATH_SCHOOL ? ', then "**For discussion:**"' : ''}. Output ONLY the section markdown — no preamble, no code fences.
### VERIFIED WITNESSES:
${JSON.stringify(w)}`;
    return parallel([
      () =>
        agent(draftPrompt('EXPOSITION-FORWARD — walk the text verse by verse'), {
          label: `draftA:${s.key}`,
          phase: 'Draft',
          agentType: 'general-purpose',
        }),
      () =>
        agent(draftPrompt('THEME-FORWARD — foreground the symbols and the doctrinal throughline'), {
          label: `draftB:${s.key}`,
          phase: 'Draft',
          agentType: 'general-purpose',
        }),
    ]).then(([draftA, draftB]) => ({ s, w, draftA, draftB }));
  },

  // Stage 3: FABLE cross-agent critique — adversarially compare the two drafts
  (prev) => {
    if (!prev) return null;
    const { s, w, draftA, draftB } = prev;
    return agent(
      `You are the CROSS-CRITIC for handbook section "${s.title}". Two writers drafted it independently. REFUTE, don't rubber-stamp. Verify the load-bearing refcodes/quotes with the tools. Identify every defect in EITHER draft, list any ref that fails verification (must be dropped), and say which elements of each the synthesizer should keep.
${TOOLS}${TITLES_NOTE}
### DRAFT A:
${draftA || '(A failed)'}
### DRAFT B:
${draftB || '(B failed)'}
### THE VERIFIED WITNESSES (ground truth):
${JSON.stringify(w)}
Return the structured critique.`,
      {
        label: `critique:${s.key}`,
        phase: 'Critique',
        schema: CRITIQUE_SCHEMA,
        agentType: 'general-purpose',
      },
    ).then((critique) => ({ s, w, draftA, draftB, critique }));
  },

  // Stage 4-6: FABLE synthesize → fable dual-verify + auto-fix loop → persist
  async (prev, s, i) => {
    if (!prev) return null;
    const { w, draftA, draftB, critique } = prev;

    let md = await agent(
      `You are the SYNTHESIZER for handbook section ${i + 1}, "${s.title}", Part ${s.part}.
Fuse the two drafts into ONE final section, keeping the best of each per the critique, dropping every ref the critique flagged unverified, fixing every defect. Bible-first throughout.
${STYLE.replace('${TITLE}', s.title)}
Output ONLY the section markdown, starting with "## ${s.title}". No preamble, no code fences.
### DRAFT A:
${draftA || '(none)'}
### DRAFT B:
${draftB || '(none)'}
### CROSS-CRITIQUE (obey it):
${JSON.stringify(critique)}
### VERIFIED WITNESSES (ground truth):
${JSON.stringify(w)}`,
      { label: `synth:${s.key}`, phase: 'Synthesize', agentType: 'general-purpose' },
    );

    // Dual-verify + auto-fix loop (capped)
    let residual = [];
    for (let round = 0; round < SECTION_FIX_ROUNDS; round++) {
      const { fails, verdicts } = await dualVerify(
        `vsec:${s.key}:r${round}`,
        'Verify-Section',
        md,
        `handbook section "${s.title}"`,
      );
      residual = fails;
      if (fails.length === 0 || verdicts.every((v) => v === 'pass')) break;
      md = await agent(
        `You are the SECTION FIXER for "${s.title}". Apply EVERY fix below to the section markdown and return the corrected FULL section (same format, "## ${s.title}" start, no preamble/fences). Do not introduce new claims; if a fix says drop a ref, drop it. Re-verify nothing — just apply.
${TITLES_NOTE}
### DEFECTS TO FIX:
${JSON.stringify(fails, null, 2)}
### CURRENT SECTION:
${md}`,
        {
          label: `fixsec:${s.key}:r${round}`,
          phase: 'Verify-Section',
          agentType: 'general-purpose',
        },
      );
    }

    await agent(
      `Write this exact content to ${spec.sectionsDir}/${s.key}.md (Write tool), then reply "saved ${s.key}". Content between markers, exclusive:\n<<<BEGIN>>>\n${md}\n<<<END>>>`,
      { label: `save:${s.key}`, phase: 'Verify-Section', agentType: 'general-purpose' },
    );
    return { key: s.key, title: s.title, part: s.part, order: i + 1, markdown: md, residual };
  },
);

const sections = built.filter(Boolean).filter((x) => x.markdown && x.markdown.includes('## '));
sections.sort((a, b) => a.order - b.order);
log(`Built ${sections.length}/${SECTIONS.length} sections.`);

// ===========================================================================
// Phase 7 — aggregate (DETERMINISTIC: `bible handbook save`, no aggregator LLM)
// ===========================================================================
phase('Aggregate');

const manifest = {
  title: spec.title,
  topic: spec.topic || spec.title,
  createdAt: spec.createdAt || '2026-07-06T12:00:00Z',
  thesis: spec.thesis,
  method: spec.method,
  outPath: spec.outPath,
  sections: sections.map((s) => ({ file: `${s.key}.md`, part: s.part })),
};

async function assembleViaCli(stepLabel) {
  return agent(
    `Assemble the handbook with the deterministic CLI (no hand-stitching).
1. Write this EXACT JSON to ${spec.sectionsDir}/handbook.json (Write tool):
${JSON.stringify(manifest, null, 2)}
2. Run (Bash, from the repo root ${REPO}):
   bun run packages/cli/src/main.ts handbook save ${spec.sectionsDir}
3. Confirm the command printed "✓ Assembled" and wrote ${spec.outPath}. Reply with that one summary line (e.g. "✓ Assembled ... — N sections, M symbols.").
Do NOT edit any section file or the output yourself — the CLI does the stitching, renumbering, TOC, and Symbol Dictionary.`,
    { label: stepLabel, phase: 'Aggregate', agentType: 'general-purpose' },
  );
}

const aggSummary = await assembleViaCli('assemble-cli');
log(`Aggregated via CLI: ${String(aggSummary).trim().split('\n')[0]}`);

// ===========================================================================
// Phase 8 — FABLE dual final review + reconciler + auto-fix loop (capped)
// ===========================================================================
phase('Final-Review');

let finalResidual = [];
for (let round = 0; round < FINAL_FIX_ROUNDS; round++) {
  // Do NOT round-trip the assembled file through an agent's final message —
  // large handbooks (200k+) kill that agent. The verifiers read it themselves.
  const { fails, a, b } = await dualVerify(
    `final:r${round}`,
    'Final-Review',
    `(The assembled handbook is too large to inline here. Read it yourself with the Read tool: ${spec.outPath} — read the WHOLE file, in chunks via offset/limit if needed, before judging.)`,
    `the WHOLE handbook "${spec.title}"`,
  );

  const reconciled = await agent(
    `You are the ADVERSARIAL RECONCILER for the whole handbook "${spec.title}". Cross-check the two final reviews — confirm overlaps, RE-VERIFY anything only one caught with the tools (real → keep; wrong → false positive), drop false positives, rank P0/P1/P2. For each confirmed fail, name the SECTION FILE it lives in (one of: ${sections.map((s) => s.key + '.md').join(', ')}) so it can be fixed at source.
${TOOLS}${TITLES_NOTE}
### REVIEW A (citations): ${JSON.stringify(a)}
### REVIEW B (coherence): ${JSON.stringify(b)}
Return the structured verdict (only CONFIRMED fails, ranked).`,
    {
      label: `reconcile:r${round}`,
      phase: 'Final-Review',
      schema: VERDICT_SCHEMA,
      agentType: 'general-purpose',
    },
  );
  finalResidual = reconciled?.fails ?? fails;
  if (finalResidual.length === 0 || reconciled?.verdict === 'pass') break;

  await agent(
    `You are the FINAL FIXER for "${spec.title}". Apply EVERY confirmed fix below by editing the relevant per-section markdown file(s) in ${spec.sectionsDir} (Read then Edit/Write each one). The files are: ${sections.map((s) => s.key + '.md').join(', ')}. Each fix names where it lives; map it to the right section file. Apply only — do not re-verify, do not introduce new claims, do not touch frontmatter/TOC/appendix (the CLI regenerates those). Keep cross-references pointing only to titles that exist in this handbook. When done, reply "fixed" with the list of files you edited.
${TITLES_NOTE}
### CONFIRMED FIXES:
${JSON.stringify(finalResidual, null, 2)}`,
    {
      label: `finalfix:r${round}`,
      phase: 'Final-Review',
      agentType: 'general-purpose',
    },
  );

  await assembleViaCli(`reassemble:r${round}`);
}

return {
  title: spec.title,
  outPath: spec.outPath,
  sectionsBuilt: sections.length,
  sectionsExpected: SECTIONS.length,
  finalResidualDefects: finalResidual,
  perSectionResidual: sections.map((s) => ({ title: s.title, residual: s.residual?.length ?? 0 })),
};
