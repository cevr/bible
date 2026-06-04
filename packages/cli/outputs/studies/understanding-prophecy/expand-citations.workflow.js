export const meta = {
  name: 'understanding-prophecy-expand-citations',
  description:
    'Expand every pioneer/EGW citation pointer into the actual quoted source text, Haskell-style; one agent per section, then recompile',
  phases: [
    {
      title: 'Expand Citations',
      detail:
        'one agent per section file: replace each _(DAR/GC/…)_ pointer with the verbatim quoted source text',
    },
    { title: 'Recompile', detail: 'restitch the expanded sections into the master handbook' },
  ],
};

const DIR = 'packages/cli/outputs/studies/understanding-prophecy';
const SECTIONS_DIR = `${DIR}/sections`;

// The 29 section files, in order, with their part assignment (for the compiler).
const SECTIONS = [
  ['01-year-day-principle', 'I — Foundation'],
  ['02-rules-of-interpretation', 'I — Foundation'],
  ['03-daniel-2-statue', 'II — The Outlines of Daniel'],
  ['04-daniel-7-beasts', 'II — The Outlines of Daniel'],
  ['05-daniel-8-sanctuary', 'II — The Outlines of Daniel'],
  ['06-daniel-9-seventy-weeks', 'II — The Outlines of Daniel'],
  ['07-daily-and-1290-1335', 'II — The Outlines of Daniel'],
  ['08-seven-churches', 'III — The Revelation'],
  ['09-seven-seals', 'III — The Revelation'],
  ['10-seven-trumpets', 'III — The Revelation'],
  ['11-revelation-10-little-book', 'III — The Revelation'],
  ['12-chart-tarrying-midnight-cry', 'III — The Revelation'],
  ['13-woman-in-white', 'III — The Revelation'],
  ['14-beast-power', 'III — The Revelation'],
  ['15-two-horned-beast-usa', 'III — The Revelation'],
  ['16-mark-of-the-beast', 'III — The Revelation'],
  ['17-three-angels-messages', 'III — The Revelation'],
  ['18-144000-great-multitude', 'III — The Revelation'],
  ['19-woman-on-beast-babylon', 'III — The Revelation'],
  ['20-sanctuary-1844-judgment', 'IV — Sanctuary & Consummation'],
  ['21-law-and-sabbath-in-prophecy', 'IV — Sanctuary & Consummation'],
  ['22-two-covenants', 'IV — Sanctuary & Consummation'],
  ['23-state-of-the-dead-spiritualism', 'IV — Sanctuary & Consummation'],
  ['24-comparing-the-sevens', 'IV — Sanctuary & Consummation'],
  ['25-babylon-fallen-loud-cry', 'IV — Sanctuary & Consummation'],
  ['26-close-of-probation-time-of-trouble', 'IV — Sanctuary & Consummation'],
  ['27-armageddon-seven-plagues', 'IV — Sanctuary & Consummation'],
  ['28-second-coming', 'IV — Sanctuary & Consummation'],
  ['29-millennium-two-resurrections', 'IV — Sanctuary & Consummation'],
];

const TRANSFORM_RECIPE = `
## The deviation we are applying (the ONLY change to these files)

In Stephen N. Haskell's "Bible Handbook," when a pioneer/EGW source is cited, the actual sentence(s) from that source are QUOTED, followed by the page reference — e.g. under "Second Advent of Christ": _"THE doctrine of the second advent is the very key-note of the Sacred Scriptures. From the day the first pair turned their sorrowing steps from Eden..." G.C. 299._

Right now each bullet ends with a bare citation POINTER like \`_(DAR 192; GC 326.)_\` or \`_(GC 381.2.)_\`. **Your job: replace each such pointer with the actual QUOTED TEXT from that source, attributed.**

### Rules — read carefully

1. **Only expand pioneer/EGW citations.** These cite works abbreviated DAR, GC, EW, MWV1/2/3, PREX1/2, BP2/BP3, AJB, GEP, TTR, ECE, EVCO, GTI, WOR, TRMC, STTHD, TTHDS, CET, SLWM, SSP, KPC, and the like (anything that is NOT a book of the Bible).
2. **DO NOT touch Bible references.** The bolded scripture at the head of each bullet (e.g. **Daniel 9:24** — "...") stays exactly as it is — it is already quoted/explained. Never add a pioneer-style quote block for a Bible verse.
3. **Quote EVERY source in a multi-ref citation.** \`_(DAR 192; GC 326.)_\` becomes TWO quotes — one from DAR 192 AND one from GC 326 — each attributed. \`_(GC 545-549.)_\` is one source spanning pages; quote the most relevant sentence(s) and attribute to the range.
4. **Pull the real text — never invent or paraphrase a quote.** For each refcode run:
   \`\`\`
   bun run packages/cli/src/main.ts egw lookup "DAR 192" --json
   bun run packages/cli/src/main.ts egw lookup "GC 326.2" --json   # paragraph-level refcodes work too
   \`\`\`
   Parse \`.paragraphs[].text\`. Choose the 1-3 sentences on that page that actually support the bullet's point (not just the first sentence). Quote them VERBATIM (preserve the source's own KJV quotations, italics-as-plain, em-dashes). If a refcode returns multiple paragraphs (a page), pick the paragraph(s) that match the claim.
   - Page-level refcode (e.g. \`DAR 192\`) → may return several paragraphs; select the relevant one(s).
   - Paragraph-level refcode (e.g. \`GC 381.2\`, \`DAR 141.1\`) → returns that exact paragraph; quote from it.
   - **Page RANGES do not resolve directly.** \`egw lookup "GC 549-550"\` returns EMPTY. For a range, look up the FIRST page (\`egw lookup "GC 549"\`) — and if the needed sentence continues, also \`egw lookup "GC 550"\`. Attribute to the range as cited (\`— GC 549-550.\`).
   - **If a lookup returns EMPTY, do not give up — recover:** (a) try the first page of a range; (b) try the bare page without a paragraph suffix (\`DAR 525\` instead of \`DAR 525.3\`); (c) use \`egw search "<a few words from the bullet's point>" --book <CODE> --limit 3\` to find the correct nearby refcode, then look that up. Only after these fail, keep the bare pointer and append \` <!-- TODO: refcode did not resolve -->\` — do NOT fabricate a quote.
5. **Keep quotes tight.** 1-3 sentences each — enough to carry the point, in Haskell's suggestive spirit, not the whole page. Trim with an ellipsis (…) where you skip material inside a quote.

### Output shape per bullet

Transform:
\`\`\`
- **Daniel 9:24** — "Seventy weeks are determined upon thy people..." 490 years to finish transgression and anoint the most Holy. _(DAR 196; GC 326.)_
\`\`\`
into (a 4-space-indented quote block per source, blank line before the first):

\`\`\`
- **Daniel 9:24** — "Seventy weeks are determined upon thy people..." 490 years to finish transgression and anoint the most Holy.

    > "<verbatim sentence(s) from DAR 196 that support this point>" — DAR 196.

    > "<verbatim sentence(s) from GC 326 that support this point>" — GC 326.
\`\`\`

- Indent each quote block by 4 spaces so it nests under the bullet in Markdown.
- One \`>\` block per cited source, in the order they appeared in the original pointer.
- Attribution at the END of each quote, em-dash + the refcode exactly as cited (e.g. \`— DAR 196.\`, \`— GC 326.2.\`, \`— MWV1 21.\`).
- Remove the old trailing \`_(...)_\` pointer entirely (its sources are now quoted).
- Leave the bullet's own lead text (bolded Bible ref + explanation) UNCHANGED.

### Intro/epigraph blocks
If the section's italic intro paragraph (the \`>\` blockquote under the heading) ends with a citation pointer like \`(DAR 520-582; GC 439.)\`, you MAY leave that as-is (it is a navigational summary, not a bullet) OR lightly expand it — your call, but prioritize the bullets. Do not break the intro's formatting.
`;

function agentPrompt(slug) {
  return `You are applying ONE precise transform to a single Bible-study file. Repo root: /Users/cvr/Developer/personal/bible-tools.

Target file: \`${SECTIONS_DIR}/${slug}.md\`

${TRANSFORM_RECIPE}

## Procedure
1. Read \`${SECTIONS_DIR}/${slug}.md\` in full.
2. Find every bullet ending in a pioneer/EGW citation pointer \`_(...)_\` (grep for \`_(\` — there may be 20-50 of them).
3. For each, run \`egw lookup\` on each refcode it cites, read the actual paragraph text, select the 1-3 verbatim sentences that support that bullet's point, and rewrite the bullet per the output shape (one indented \`>\` quote block per cited source, attributed, old pointer removed).
4. Leave Bible references and explanations untouched. Quote VERBATIM — never fabricate.
5. Overwrite the same file with the Write tool (full file, all bullets transformed).

## Report back (one line)
filename · number of citation pointers expanded · number of distinct quote blocks added · any refcodes that did not resolve (left as TODO).

Work autonomously. Accuracy over speed — every quote must be real text from the cited page.`;
}

// ===========================================================================
// Phase 1 — one agent per section, expanding citations in place.
// ===========================================================================

phase('Expand Citations');
log(`Expanding pioneer/EGW citations into quoted source text across ${SECTIONS.length} sections`);

const results = await parallel(
  SECTIONS.map(
    ([slug]) =>
      () =>
        agent(agentPrompt(slug), { label: `expand:${slug}`, phase: 'Expand Citations' }).then(
          (r) => ({
            slug,
            report: r,
          }),
        ),
  ),
);

const ok = results.filter(Boolean);
log(`${ok.length}/${SECTIONS.length} sections expanded`);
for (const r of ok) log(`  ✓ ${r.slug} — ${String(r.report).slice(0, 120)}`);

// ===========================================================================
// Phase 2 — recompile the master from the (now expanded) sections.
// ===========================================================================

phase('Recompile');

const partsOrder = [
  'I — Foundation',
  'II — The Outlines of Daniel',
  'III — The Revelation',
  'IV — Sanctuary & Consummation',
];
const orderList = partsOrder
  .map((p) => {
    const items = SECTIONS.filter(([, part]) => part === p)
      .map(([slug], i) => `      sections/${slug}.md`)
      .join('\n');
    return `  PART ${p}\n${items}`;
  })
  .join('\n');

const compilePrompt = `You are recompiling the master file of the "Understanding Prophecy — The Full Chain" Bible Handbook after each section's pioneer/EGW citations were expanded into full quoted source text. Repo root: /Users/cvr/Developer/personal/bible-tools.

The ${SECTIONS.length} section files in \`${SECTIONS_DIR}/\` have just been UPDATED in place (citations expanded). Re-read all of them and rebuild the master at \`${DIR}/understanding-prophecy.md\` (OVERWRITE it).

Section order, grouped by part:
${orderList}

Reuse the SAME master structure as before (it already exists at \`${DIR}/understanding-prophecy.md\` — read it first to copy its frontmatter, intro, abbreviations, contents, and part dividers):
1. YAML frontmatter (unchanged).
2. Title + intro + Haskell epigraph (unchanged).
3. Abbreviations block (unchanged).
4. Contents — numbered list under the four PART headings, working GitHub-slug anchor links matching each \`# N. Title\` heading.
5. The ${SECTIONS.length} studies in order (1→${SECTIONS.length}) under their four \`# Part …\` dividers, separated by \`---\`. Paste each section's body VERBATIM from its (now expanded) file — including all the new quote blocks. Do NOT alter, summarize, or re-trim the quotes.
6. The closing colophon (unchanged).

After writing, verify: all ${SECTIONS.length} \`# N.\` headings present in order; all ${SECTIONS.length} contents anchors resolve; the new \`>\`-quote blocks are present (grep \`^    > \` should now be in the hundreds). Return one line: study count, count of indented quote blocks (\`grep -c '^    > '\`), and confirmation the file was written.`;

const compileSummary = await agent(compilePrompt, {
  label: 'recompile:master',
  phase: 'Recompile',
});

log('Recompile complete.');
return { expanded: ok.map((r) => r.slug), compile: compileSummary };
