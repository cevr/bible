export const meta = {
  name: 'handbook-finisher',
  description:
    'FINISHER for the LGT handbook: reuses the 8 salvaged (Fable) synth sections + the Opus witness clouds from the interrupted prior run; OPUS synthesizes the 2 remaining sections from their draft-pairs, dual-verifies ALL 10 (citations + coherence) with an auto-fix loop, assembles with the deterministic `bible handbook save` CLI, and runs an Opus dual final review + reconciler. No re-gathering of witnesses.',
  whenToUse:
    'Finish a partially-built handbook where most sections are already synthesized and staged in sectionsDir. Pass args={specPath, salvageDir}.',
  phases: [
    { title: 'Spec', detail: 'read + validate the handbook spec' },
    {
      title: 'Synthesize-Missing',
      detail: 'OPUS synthesizes the 2 un-synthesized sections from their drafts + witnesses',
    },
    {
      title: 'Verify-Section',
      detail: 'OPUS dual verify (citations + coherence) every section; auto-fix capped at 2 rounds',
    },
    {
      title: 'Aggregate',
      detail:
        'deterministic `bible handbook save` stitches sections + front matter + TOC + Symbol Dictionary',
    },
    {
      title: 'Final-Review',
      detail:
        'OPUS dual whole-document review + reconciler; fixes at section source, re-assembled; capped at 2 rounds',
    },
  ],
};

// ===========================================================================
// Inputs
// ===========================================================================
const REPO = '/Users/cvr/Developer/personal/bible-tools';
// args may arrive as an object, or as a JSON string (the harness sometimes
// stringifies args) — normalize both.
let RAW = args || {};
if (typeof RAW === 'string') {
  try {
    RAW = JSON.parse(RAW);
  } catch {
    RAW = { specPath: RAW };
  }
}
// Fallback to committed defaults so the workflow is self-contained and resumable.
const SPEC_PATH =
  RAW.specPath ||
  '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/last-generation-theology.spec.js';
const SALVAGE =
  RAW.salvageDir ||
  '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/studies/last-generation-theology/_salvage-prior-run';
if (!SPEC_PATH || !SALVAGE) throw new Error('handbook-finisher: pass args={specPath, salvageDir}');

const SECTION_FIX_ROUNDS = RAW.sectionFixRounds ?? 2;
const FINAL_FIX_ROUNDS = RAW.finalFixRounds ?? 2;

// The two sections that never reached synthesis in the prior run.
// Each: spec key, the two draft files, and the matched Opus witness cloud.
const MISSING = [
  {
    key: '02-what-sin-is',
    part: 'I — The Man',
    title: 'What Sin Is — Transgression, Not Inheritance',
    draftA: `${SALVAGE}/sections/02-what-sin-is.draftA.md`,
    draftB: `${SALVAGE}/sections/02-what-sin-is.draftB.md`,
    witness: `${SALVAGE}/w-02-what-sin-is.json`,
  },
  {
    key: '07-victory-over-sin',
    part: 'III — The Remedy',
    title: 'Complete Victory — Overcoming as He Overcame',
    draftA: `${SALVAGE}/sections/07-victory-over-sin.draftA.md`,
    draftB: `${SALVAGE}/sections/07-victory-over-sin.draftB.md`,
    witness: `${SALVAGE}/w-07-victory-over-sin.json`,
  },
];

// ===========================================================================
// Phase 0 — read + validate the spec
// ===========================================================================
phase('Spec');

const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: [
    'title',
    'thesis',
    'method',
    'bibleOnly',
    'outPath',
    'sectionsDir',
    'templatePath',
    'sections',
  ],
  properties: {
    title: { type: 'string' },
    topic: { type: 'string' },
    createdAt: { type: 'string' },
    thesis: { type: 'string' },
    method: { type: 'string' },
    bibleOnly: { type: 'boolean' },
    sabbathSchool: { type: 'boolean' },
    outPath: { type: 'string' },
    sectionsDir: { type: 'string' },
    templatePath: { type: 'string' },
    sources: { type: 'string' },
    sections: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['key', 'part', 'title'],
        properties: {
          key: { type: 'string' },
          part: { type: 'string' },
          title: { type: 'string' },
          scope: { type: 'string' },
          terms: { type: 'array', items: { type: 'string' } },
          symbols: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const spec = await agent(
  `Read the JavaScript handbook-spec file at ${SPEC_PATH} (Read tool). It default-exports a spec object. Return it as the structured object. Resolve relative paths against ${REPO}. Defaults: createdAt = today noon UTC; sabbathSchool false; topic = title. Your final message IS the structured spec.`,
  { label: 'read-spec', phase: 'Spec', schema: SPEC_SCHEMA, agentType: 'general-purpose' },
);

const SECTIONS = spec.sections;
const BIBLE_ONLY = spec.bibleOnly;
const SABBATH_SCHOOL = !!spec.sabbathSchool;
log(
  `Spec: "${spec.title}" — ${SECTIONS.length} sections, bibleOnly=${BIBLE_ONLY}, sabbathSchool=${SABBATH_SCHOOL}. Reusing 8 staged synth sections; synthesizing ${MISSING.length}.`,
);

// ===========================================================================
// Shared contracts (copied from the factory so verification matches)
// ===========================================================================
const TOOLS = `
## Tools (repo root: ${REPO}; local lookups need NO auth)
- KJV scripture:  bun run packages/cli/src/main.ts verse "Daniel 8:14" --json   (parse .verses[]; ranges not comma-lists; strip ‹ › red-letter markers)
- Pioneer/EGW:    bible egw "REF"                read an exact paragraph (confirm it contains the quoted words before citing)
- Find a refcode: bible egw search "plain words" --limit 8   (NO hyphens/quotes inside the phrase — the FTS parser trips)
NEVER invent a refcode or a quote. Verify each says what you claim, or DROP it.
${spec.sources ? `\n## Source map (prefer these)\n${spec.sources}` : ''}
`;

const STYLE = `
## STYLE — copy the template handbook EXACTLY
Template (format reference only): ${spec.templatePath}. Read it before writing.
- After Haskell's Bible Handbook: every line is **ref → gloss**, SCANNABLE.
- Section opens "## ${'${'}TITLE}" then a one-line ">" blockquote thesis for the section.
- Walk the passages. FIRST time a symbol appears, define it inline FROM SCRIPTURE:
  "  - **symbol** = meaning (_Scripture receipt 1_; _receipt 2_)."
- Verse→gloss: "- _Dan. 8:14._ \\"KJV phrase...\\" — one-line gloss." Italicize refs; quote KJV verbatim.
- Pioneer/EGW line: "- _GC 324.3._ White: \\"...short quote...\\" — gloss." after the Scripture.
- Section CLOSES with "**DEFINITION — TITLE =** ..." (one dense paragraph of what the verses built), then
  "**Symbols defined here:**" (bullets) and "**Symbols carried:**" (referencing the OWNING section by exact TITLE).
- Cross-reference other sections by exact TITLE in quotes — and ONLY titles that exist in THIS handbook's section list. NEVER by number.
- NO [CHAIN]/[KEY] markers. Tone: dense, reverent, evidence-first. No filler.
${SABBATH_SCHOOL ? '- SABBATH SCHOOL: end each section with "**For discussion:**" and 1-3 tight, Scripture-anchored, application questions (numbered).' : ''}
`;

const ALL_TITLES = SECTIONS.map((s) => s.title);
const TITLES_NOTE = `\n## The ONLY valid cross-reference targets (this handbook's ${SECTIONS.length} section titles):\n${ALL_TITLES.map((t) => `- "${t}"`).join('\n')}\nNever cite a section title not in this list.`;

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

// dual-verify a chunk of markdown (citations + coherence), OPUS verifiers.
async function dualVerify(label, phaseName, markdown, scopeNote) {
  const [a, b] = await parallel([
    () =>
      agent(
        `You are VERIFIER A — CITATION INTEGRITY for ${scopeNote}.
${TOOLS}
Resolve EVERY pioneer/EGW refcode with \`bible egw "REF"\` (paragraph exists AND contains the quoted words) and spot-check the KJV quotes with the verse tool. Any mismatch is a FAIL with the tool evidence. Be adversarial — assume wrong until the tool proves right.
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
Judge: internal contradictions (a symbol defined two ways, a date stated differently); cross-references that point to a section title NOT in this handbook's list (dead pointers — name each + the right target or "drop"); structure (">" thesis, "DEFINITION" closer, symbol machinery present); stray [CHAIN]/[KEY] markers or leftover narration; and whether each symbol is Scripture-defined. Be adversarial — press the weakest links.
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
// Phase 1 — OPUS synthesizes the 2 missing sections from their draft-pairs + witness
// ===========================================================================
phase('Synthesize-Missing');

await parallel(
  MISSING.map((m) => async () => {
    const synthMd = await agent(
      `You are the SYNTHESIZER for handbook section "${m.title}", Part ${m.part}.
Two writers drafted this section independently (below). Fuse them into ONE final section — keep the stronger exposition of each, drop weaker/duplicated lines, and DROP any refcode or quote you cannot verify with the tools. Bible-first throughout; define each symbol from Scripture; pioneer/EGW corroborate AFTER the Scripture. Verify the load-bearing refcodes with \`bible egw "REF"\` and the verse tool before keeping them.
${STYLE.replace('${TITLE}', m.title)}
Read the two drafts and the verified witness cloud, then output ONLY the section markdown starting with "## ${m.title}" — no preamble, no code fences.
${TOOLS}${TITLES_NOTE}
### DRAFT A (Read ${m.draftA}):
(read it with the Read tool)
### DRAFT B (Read ${m.draftB}):
(read it with the Read tool)
### VERIFIED WITNESS CLOUD (ground truth — Read ${m.witness}):
(read it with the Read tool)`,
      {
        label: `synth:${m.key}`,
        phase: 'Synthesize-Missing',
        model: 'opus',
        agentType: 'general-purpose',
      },
    );
    await agent(
      `Write this exact content to ${spec.sectionsDir}/${m.key}.md (Write tool), then reply "saved ${m.key}". Content between markers, exclusive:\n<<<BEGIN>>>\n${synthMd}\n<<<END>>>`,
      { label: `save:${m.key}`, phase: 'Synthesize-Missing', agentType: 'general-purpose' },
    );
    return m.key;
  }),
);
log(`Synthesized + saved ${MISSING.length} missing sections.`);

// ===========================================================================
// Phase 2 — OPUS dual-verify + auto-fix EVERY section (all 10 now on disk)
// ===========================================================================
phase('Verify-Section');

const verified = await pipeline(SECTIONS, async (s) => {
  // read current section markdown
  let md = await agent(
    `Read ${spec.sectionsDir}/${s.key}.md (Read tool) and return its FULL contents verbatim as your final message — nothing else, no fences, no preamble. If the file does not exist, return exactly "MISSING".`,
    { label: `read:${s.key}`, phase: 'Verify-Section', agentType: 'general-purpose' },
  );
  if (!md || md.trim() === 'MISSING' || !md.includes('## ')) {
    log(`WARNING: ${s.key}.md missing or malformed at verify.`);
    return null;
  }
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
      `You are the SECTION FIXER for "${s.title}". Apply EVERY fix below to the section markdown and return the corrected FULL section (same format, "## ${s.title}" start, no preamble/fences). Do not introduce new claims; if a fix says drop a ref, drop it.
${TITLES_NOTE}
### DEFECTS TO FIX:
${JSON.stringify(fails, null, 2)}
### CURRENT SECTION:
${md}`,
      {
        label: `fixsec:${s.key}:r${round}`,
        phase: 'Verify-Section',
        model: 'opus',
        agentType: 'general-purpose',
      },
    );
    // persist the fixed section
    await agent(
      `Write this exact content to ${spec.sectionsDir}/${s.key}.md (Write tool), then reply "saved ${s.key}". Content between markers, exclusive:\n<<<BEGIN>>>\n${md}\n<<<END>>>`,
      { label: `resave:${s.key}:r${round}`, phase: 'Verify-Section', agentType: 'general-purpose' },
    );
  }
  return { key: s.key, title: s.title, part: s.part, residual };
});

const okSections = verified.filter(Boolean);
log(`Verified ${okSections.length}/${SECTIONS.length} sections.`);

// ===========================================================================
// Phase 3 — aggregate (DETERMINISTIC: `bible handbook save`)
// ===========================================================================
phase('Aggregate');

const manifest = {
  title: spec.title,
  topic: spec.topic || spec.title,
  createdAt: spec.createdAt || '2026-07-06T12:00:00Z',
  thesis: spec.thesis,
  method: spec.method,
  outPath: spec.outPath,
  // order strictly by the spec's section order
  sections: SECTIONS.map((s) => ({ file: `${s.key}.md`, part: s.part })),
};

async function assembleViaCli(stepLabel) {
  return agent(
    `Assemble the handbook with the deterministic CLI (no hand-stitching).
1. Write this EXACT JSON to ${spec.sectionsDir}/handbook.json (Write tool):
${JSON.stringify(manifest, null, 2)}
2. Run (Bash, from the repo root ${REPO}):
   bun run packages/cli/src/main.ts handbook save ${spec.sectionsDir}
3. Confirm it printed "✓ Assembled" and wrote ${spec.outPath}. Reply with that one summary line.
Do NOT edit any section file or the output — the CLI does the stitching, renumbering, TOC, and Symbol Dictionary.`,
    { label: stepLabel, phase: 'Aggregate', agentType: 'general-purpose' },
  );
}

const aggSummary = await assembleViaCli('assemble-cli');
log(`Aggregated: ${String(aggSummary).trim().split('\n')[0]}`);

// ===========================================================================
// Phase 4 — OPUS dual final review + reconciler + auto-fix loop (capped)
// ===========================================================================
phase('Final-Review');

let finalResidual = [];
for (let round = 0; round < FINAL_FIX_ROUNDS; round++) {
  const handbook = await agent(
    `Read the file ${spec.outPath} (Read tool) and return its FULL contents verbatim as your final message — nothing else, no fences, no preamble.`,
    { label: `read-final:r${round}`, phase: 'Final-Review', agentType: 'general-purpose' },
  );

  const { fails, a, b } = await dualVerify(
    `final:r${round}`,
    'Final-Review',
    handbook,
    `the WHOLE handbook "${spec.title}"`,
  );

  const reconciled = await agent(
    `You are the ADVERSARIAL RECONCILER for the whole handbook "${spec.title}". Cross-check the two final reviews — confirm overlaps, RE-VERIFY anything only one caught with the tools (real → keep; wrong → drop), rank P0/P1/P2. For each confirmed fail, name the SECTION FILE it lives in (one of: ${SECTIONS.map((s) => s.key + '.md').join(', ')}) so it can be fixed at source.
${TOOLS}${TITLES_NOTE}
### REVIEW A (citations): ${JSON.stringify(a)}
### REVIEW B (coherence): ${JSON.stringify(b)}
Return the structured verdict (only CONFIRMED fails, ranked).`,
    {
      label: `reconcile:r${round}`,
      phase: 'Final-Review',
      schema: VERDICT_SCHEMA,
      model: 'opus',
      agentType: 'general-purpose',
    },
  );
  finalResidual = reconciled?.fails ?? fails;
  if (finalResidual.length === 0 || reconciled?.verdict === 'pass') break;

  await agent(
    `You are the FINAL FIXER for "${spec.title}". Apply EVERY confirmed fix below by editing the relevant per-section markdown file(s) in ${spec.sectionsDir} (Read then Edit/Write each). Files: ${SECTIONS.map((s) => s.key + '.md').join(', ')}. Each fix names where it lives; map it to the right file. Apply only — do not re-verify, do not add claims, do not touch frontmatter/TOC/appendix (the CLI regenerates those). Keep cross-references pointing only to titles that exist in this handbook. Reply "fixed" with the files you edited.
${TITLES_NOTE}
### CONFIRMED FIXES:
${JSON.stringify(finalResidual, null, 2)}`,
    {
      label: `finalfix:r${round}`,
      phase: 'Final-Review',
      model: 'opus',
      agentType: 'general-purpose',
    },
  );

  await assembleViaCli(`reassemble:r${round}`);
}

return {
  title: spec.title,
  outPath: spec.outPath,
  sectionsVerified: okSections.length,
  sectionsExpected: SECTIONS.length,
  finalResidualDefects: finalResidual,
  perSectionResidual: okSections.map((s) => ({
    title: s.title,
    residual: s.residual?.length ?? 0,
  })),
};
