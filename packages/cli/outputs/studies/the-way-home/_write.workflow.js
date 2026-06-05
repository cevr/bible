export const meta = {
  name: 'way-home-write',
  description:
    'Write/rewrite the 33-study historicist BIBLE-ONLY Way Home series from _BLUEPRINT.md: one agent per study (Bible-only proof, history only for fulfillment, typology kept, defects fixed, narrative frame + whiteboard markers preserved). Args-subsettable for ~8-per-batch; compile gated behind a full-run flag.',
  phases: [
    {
      title: 'Write studies',
      detail: 'one agent per study: author/rewrite its NN-slug.md to its blueprint spec',
    },
    { title: 'Compile', detail: 'verify the set + write a series index (full runs only)' },
  ],
};

const DIR = 'packages/cli/outputs/studies/the-way-home';
const BLUEPRINT = `${DIR}/_BLUEPRINT.md`;

// ===========================================================================
// The 33 studies. `num` = NEW number; `out` = output file (new numbering);
// `src` = existing file to READ/preserve (for keep-reframe / heavy-rewrite),
// or null for NEW studies. `kind` summarizes the work for labeling.
// Specs live in _BLUEPRINT.md (the contract) — agents read their own section.
// ===========================================================================

const STUDIES = [
  // num, slug, out, src, kind
  [1, 'the-cosmic-trial', '01-the-cosmic-trial.md', '01-the-cosmic-trial.md', 'keep-reframe'],
  [
    2,
    'the-bridge-destroyed-and-restored',
    '02-the-bridge-destroyed-and-restored.md',
    '02-the-bridge-destroyed-and-restored.md',
    'keep-reframe',
  ],
  [
    3,
    'what-salvation-really-is',
    '03-what-salvation-really-is.md',
    '03-what-salvation-really-is.md',
    'keep-reframe',
  ],
  [
    4,
    'why-it-had-to-be-christ',
    '04-why-it-had-to-be-christ.md',
    '04-why-it-had-to-be-christ.md',
    'keep-reframe',
  ],
  [5, 'thy-way-o-god', '05-thy-way-o-god.md', '05-thy-way-o-god.md', 'keep-reframe-ADDITIVE'],
  [6, 'two-laws', '06-two-laws.md', '06-two-laws.md', 'keep-reframe'],
  [
    7,
    'the-counterfeit-system',
    '07-the-counterfeit-system.md',
    '07-the-counterfeit-system.md',
    'keep-reframe',
  ],
  [
    8,
    'prophecy-names-the-system',
    '08-prophecy-names-the-system.md',
    '08-prophecy-names-the-system.md',
    'keep-reframe',
  ],
  [9, 'a-day-for-a-year', '09-a-day-for-a-year.md', null, 'new'],
  [10, 'the-seven-churches', '10-the-seven-churches.md', null, 'new'],
  [11, 'the-seven-seals', '11-the-seven-seals.md', null, 'new'],
  [12, 'the-seven-trumpets', '12-the-seven-trumpets.md', null, 'new'],
  [13, 'august-11-1840', '13-august-11-1840.md', null, 'new'],
  [
    14,
    'the-timeline-unlocked',
    '14-the-timeline-unlocked.md',
    '09-the-timeline-unlocked.md',
    'heavy-rewrite',
  ],
  [15, 'every-clock-agrees', '15-every-clock-agrees.md', null, 'new'],
  [16, 'the-little-book', '16-the-little-book.md', null, 'new'],
  [17, 'the-midnight-cry', '17-the-midnight-cry.md', null, 'new'],
  [
    18,
    '1844-and-the-judgment',
    '18-1844-and-the-judgment.md',
    '10-1844-and-the-judgment.md',
    'keep-reframe',
  ],
  [19, 'the-three-angels-messages', '19-the-three-angels-messages.md', null, 'new'],
  [20, 'the-woman-and-the-dragon', '20-the-woman-and-the-dragon.md', null, 'new'],
  [21, 'the-two-beasts', '21-the-two-beasts.md', null, 'new'],
  [22, 'babylon-the-great', '22-babylon-the-great.md', null, 'new'],
  [23, 'come-out-of-her', '23-come-out-of-her.md', '11-come-out-of-her.md', 'heavy-rewrite'],
  [24, 'the-sabbath', '24-the-sabbath.md', '12-the-sabbath.md', 'keep-reframe'],
  [
    25,
    'the-temple-of-the-holy-spirit',
    '25-the-temple-of-the-holy-spirit.md',
    '13-the-temple-of-the-holy-spirit.md',
    'keep-reframe',
  ],
  [
    26,
    'conquering-canaan',
    '26-conquering-canaan.md',
    '14-conquering-canaan.md',
    'keep-reframe-ADDITIVE',
  ],
  [
    27,
    'the-state-of-the-dead-and-spiritualism',
    '27-the-state-of-the-dead-and-spiritualism.md',
    null,
    'new',
  ],
  [28, 'the-final-crisis', '28-the-final-crisis.md', '15-the-final-crisis.md', 'heavy-rewrite'],
  [
    29,
    'the-144000-and-the-great-multitude',
    '29-the-144000-and-the-great-multitude.md',
    null,
    'new',
  ],
  [
    30,
    'close-of-probation-jacobs-trouble-plagues',
    '30-close-of-probation-jacobs-trouble-plagues.md',
    '16-the-time-of-trouble.md',
    'heavy-rewrite-split1',
  ],
  [
    31,
    'armageddon-second-coming-deliverance',
    '31-armageddon-second-coming-deliverance.md',
    '16-the-time-of-trouble.md',
    'heavy-rewrite-split2',
  ],
  [
    32,
    'the-image-restored',
    '32-the-image-restored.md',
    '17-the-image-restored.md',
    'keep-reframe',
  ],
];

// `args`: array of study numbers (or numeric strings) to write a subset; if
// omitted, write all 33. Compile (Phase 2) runs only on a full run.
const onlyNums =
  Array.isArray(args) && args.length > 0 ? args.map((a) => parseInt(String(a), 10)) : null;
const SELECTED = onlyNums ? STUDIES.filter(([num]) => onlyNums.includes(num)) : STUDIES;
const FULL_RUN = !onlyNums;

// ===========================================================================
// The locked directive — every writer receives this verbatim.
// ===========================================================================

const DIRECTIVE = `
# THE LOCKED DIRECTIVE — "The Way Home" historicist, literal, BIBLE-ONLY rewrite

You are writing ONE study in a 33-study chain (0-32) that takes a reader from zero to mastery of the historicist, literal, SDA-pioneer system of prophecy and doctrine — but PROVED FROM THE BIBLE ITSELF, inside an existing narrative frame ("The Way Home": the cosmic trial → Satan's two charges → the broken bridge → exile in Babylon → the call home → restoration).

## The four non-negotiable rules

1. **BIBLE-ONLY PROOF.** Establish every doctrine from Scripture by the Bible's own method: plain literal sense; Scripture its own expositor; precept upon precept (Isa 28:10); compare spiritual with spiritual (1 Cor 2:13); never break Scripture against itself (John 10:35); the year-day key from the Bible (Num 14:34; Eze 4:6). **Do NOT prove doctrine by citing the pioneers or Ellen White.** Their words may appear ONLY as a brief confirming/devotional ECHO *after* the Bible has already proved the point — never as the ground. A reader must be able to verify every doctrine with an open Bible alone. (If the existing study leaned on an EGW/pioneer quote to PROVE something, replace that with the Scripture proof and demote the quote to a confirming echo, or cut it.)

2. **HISTORY IS THE ONE EXCEPTION — FULFILLMENT ONLY, NEVER DOCTRINE.** The historicist proof-form is always: *the Bible predicts X → history records X happened on schedule.* When a prophecy's FULFILLMENT is a datable event, document that event from the historical record — and there you MAY cite a source for the DATE/FACT (a historian, encyclopedia, or a pioneer who recorded it; e.g. Gibbon for the Ottoman dates, Litch's published 1840 prediction). The MEANING is still proved from the Bible. History belongs only in the study's fulfillment lane.

3. **TYPOLOGY YES, SPIRITUALIZING NO.** This distinction is decisive.
   - **Typology is LEGITIMATE — keep it:** a literal thing the text itself authorizes as a figure of another literal/spiritual thing. The text-authorized types in THIS series include: Jacob's wrestling → the literal time of trouble (Jer 30:7 NAMES it); the sanctuary services → Christ's literal heavenly ministry (Heb 8); Passover → the literal cross (1 Cor 5:7); the Exodus AND the conquest of Canaan as ensamples for the believer's spiritual life (1 Cor 10:11), Canaan as a type of the rest that remains (Heb 3-4 names it), Hagar/Sarah = the two covenants (Gal 4:24, Paul's own marked allegory); Jesus = the Ladder (John 1:51) = the Gate/Door (John 10:9) = the House of God/Sanctuary (1 Chr 28:10; Ex 25:8). Use these freely.
   - **Spiritualizing is the ERROR — remove it:** asserting a DOCTRINE on the basis of a non-literal/inner/allegorical reading INSTEAD OF establishing it from plain didactic Scripture. The test is what the doctrine RESTS ON, not whether a type is used. (Examples to fix where flagged: "ten hands = the Ten Commandments" numerology; the literal glory of Rev 18:1 redefined as merely "character reflected"; the literal seventh-day Sabbath reduced to a "trust-rest attitude" with no literal observance; the literal "come out of Babylon" subordinated to "waiting for inner transformation.")
   - **If a type is text-authorized AND the doctrine is anchored in plain Scripture underneath, it is FINE** — do not strip it. (Notably: the Canaan/conquest framework in Study 26, and the paralytic + sanctuary-stages in Study 5, are LEGITIMATE — keep them; just make sure the doctrine rests on plain texts underneath.)

4. **KEEP THE NARRATIVE FRAME + FORMAT.** Keep the Way Home story and the whiteboard study format with its markers: \`[→]\` (insight/arrow), \`[DYK🔎]\` (did-you-know), \`[Q]\` (objection + answer), \`[ILL]\` (illustration), \`[STR]\` (structural/key point), \`[TANGENT]\`. Keep: YAML frontmatter (\`created_at\`, \`topic\`), a \`# Study N: Title\` heading, a bold thesis line, a \`## Prep Reading\` list, flat \`##\`/\`###\` sections with bulleted verse-points, a \`**Central Verse:**\`, an \`## Appeal\`, and a \`**[→ Study N+1]**\` transition. Devotional appeals are welcome — they just may not carry doctrine.

## Doctrinal line: MATURE SDA (Uriah Smith DAR + settled Ellen White positions)
On contested points follow the settled denominational position: the "daily" = PAGANISM (the continual desolating power; "sacrifice" is a supplied word, *tamid* = "continual"); the seals/trumpets/churches per the historicist DAR scheme; the investigative judgment beginning 1844. Use the Millerite movement (Miller/Snow/Litch/Fitch/the charts) for the time-prophecies and the 1844 history. But even these are PROVED from the Bible, not asserted on Smith's or White's authority. (The 2520 "seven times" → 1843 and 666 = VICARIVS FILII DEI are KEPT but framed MODESTLY — the 2520 as a secondary corroborating witness that Smith/DAR set aside while Miller taught it; 666 as "count the number of a man" the way the verse frames it, not free numerology.)

## How to verify a Bible text (use the CLI)
Run \`set -a; source packages/cli/.env; set +a\` once, then:
- \`bun run packages/cli/src/main.ts verse "Daniel 8:14" --json\` — get the KJV text. Use RANGES ("Daniel 7:23-25") or single verses; AVOID comma-lists (they fall into search mode).
Quote the KJV VERBATIM. Bible references are the proof and stay as bullets (no pioneer-style quote block needed for a Bible verse). Only a pioneer/EGW source, if you use one as a confirming echo, gets a short attributed quote.
`;

function agentPrompt(num, slug, out, src, kind) {
  const isNew = src === null;
  const splitNote =
    kind === 'heavy-rewrite-split1'
      ? `\nThis is PART 1 of a SPLIT: take ONLY the close-of-probation + Jacob's-trouble + seven-last-plagues material from the source file. Armageddon + the second coming go to Study 31 (do NOT include them here). Reuse the relevant prose from the source where it fits the new, tighter scope.`
      : kind === 'heavy-rewrite-split2'
        ? `\nThis is PART 2 of a SPLIT: take ONLY the Armageddon + literal-second-coming + deliverance material. Close of probation + Jacob's trouble + the plagues go to Study 30 (do NOT re-cover them here beyond a one-line bridge). ADD the Armageddon treatment (Rev 16:12-16) the original lacked, distinguished from the post-millennial Rev 20:7-9. Reuse the source's literal-advent prose where it fits.`
        : '';
  const srcLine = isNew
    ? `This is a NEW study — there is no existing file. Write it from scratch to the spec.`
    : `Read the EXISTING source file \`${DIR}/${src}\` IN FULL first. ${
        kind.startsWith('keep-reframe')
          ? "This is a KEEP-REFRAME: preserve most of the existing prose, structure, illustrations, and voice; make the spec's changes surgically. Do NOT rewrite what already works."
          : 'This is a HEAVY-REWRITE: keep the parts the spec says to keep and the narrative voice, but substantially rework per the spec.'
      }${splitNote}`;

  const additiveNote = kind.endsWith('ADDITIVE')
    ? `\n\n## IMPORTANT — this study is ADDITIVE, not a defect-removal\nThe audit's "defect" flag for this study was OVERTURNED by the user. Do NOT remove the flagged material:\n- **Study 5:** KEEP the paralytic BOTH ways (forgiveness→power AND "go to thine house" = the daily walk home) — it is Christ's own author-marked physical→spiritual connection. Your job is ADDITIVE: make the Jesus=Ladder=Gate=Sanctuary hinge (John 1:51; 10:9; 1 Chr 28:10; Ex 25:8) explicit, and gather the front-half chain (image=glory=name=character; law=an image of God; Christ is Life; beholding transforms).\n- **Study 26:** KEEP the "Conquering Canaan" title and the whole conquest framework (spy report, giants, "little by little," Joshua's Captain) as the God-given framework for the spiritual life (Heb 3-4; 1 Cor 10:11; Gal 4:24). The ONLY adjustment: make sure the doctrine (sanctification, two covenants, righteousness by faith) is anchored in the plain NT texts UNDERNEATH the framework.`
    : '';

  return `You are authoring ONE Bible study in the historicist, Bible-only "Way Home" series. Repo root: /Users/cvr/Developer/personal/bible-tools.

${DIRECTIVE}

# YOUR STUDY: Study ${num} — slug \`${slug}\`
Output file (WRITE here, new numbering): \`${DIR}/${out}\`

## Your spec is in the blueprint
Read \`${BLUEPRINT}\` and find the section beginning \`### Study ${num} —\`. That spec is your CONTRACT: its Thesis, "Proves from the Bible" (the doctrines to establish), "Proof texts" (your backbone), "Document from history" (the ONLY external lane), the defects/additions to fix, "Typology to keep", and "Narrative beat". Build exactly to it. Also read the blueprint's top matter (the four rules + doctrinal line) so the whole study obeys them.

## Source
${srcLine}

## Format to match
Open \`${DIR}/00-hath-god-said.md\` to match the whiteboard format EXACTLY: YAML frontmatter (\`created_at: '2026-06-04T00:00:00.000Z'\`, \`topic: 'The Way Home Series — Study ${num}: <Title>'\`), the \`# Study ${num}: <Title>\` heading, a bold thesis line, \`## Prep Reading\`, flat sections with bulleted verse-points and the markers (\`[→]\` \`[DYK🔎]\` \`[Q]\` \`[ILL]\` \`[STR]\` \`[TANGENT]\`), a \`**Central Verse:**\`, an \`## Appeal\`, and a \`**[→ Study ${num + 1}]**\` transition. Quote KJV verbatim (verify with the \`verse\` CLI).${additiveNote}

## Procedure
1. Read your blueprint spec (\`### Study ${num} —\`) + the four rules at the top of the blueprint.
2. ${isNew ? 'Plan the study from the spec.' : `Read the source file \`${src}\` in full.`}
3. Verify each backbone proof-text with \`bun run packages/cli/src/main.ts verse "REF" --json\` and quote KJV verbatim. Build each doctrine from the Bible FIRST; document any historical fulfillment from the record in its own clearly-marked spot; keep all text-authorized typology; fix only the real spiritualizing defects the spec names.
4. Write the full study to \`${DIR}/${out}\` (Write tool). It should be a complete, standalone, study-able whiteboard study, zero-to-100 on its topic, in the Way Home voice.

## Report back (one line)
\`Study ${num} · <out filename> · N sections · N verse-points · N historical-fulfillment notes documented · defects fixed: <list or none> · typology kept: <short>.\`

Work autonomously. BIBLE-ONLY proof; history only for fulfillment; keep typology; keep the narrative frame. Accuracy of every quoted verse is essential.`;
}

// ===========================================================================
// Phase 1 — one writer per selected study (run in batches of ~8 via args).
// ===========================================================================

phase('Write studies');
log(
  `Writing ${SELECTED.length} stud${SELECTED.length === 1 ? 'y' : 'ies'}` +
    (onlyNums ? ` (subset: ${onlyNums.join(', ')})` : ' (FULL run — all 33)') +
    `. Reminder: long agents — keep batches ~8.`,
);

const results = await parallel(
  SELECTED.map(
    ([num, slug, out, src, kind]) =>
      () =>
        agent(agentPrompt(num, slug, out, src, kind), {
          label: `write:${num}-${slug}`,
          phase: 'Write studies',
        }).then((report) => ({ num, slug, out, report })),
  ),
);

const ok = results.filter(Boolean);
log(`${ok.length}/${SELECTED.length} studies written`);
for (const r of ok.sort((a, b) => a.num - b.num))
  log(`  ✓ Study ${r.num} — ${String(r.report).slice(0, 140)}`);

// ===========================================================================
// Phase 2 — compile/verify + series index (full runs only).
// ===========================================================================

if (!FULL_RUN) {
  log(
    `Subset run (${SELECTED.length} studies) — skipping compile. Run the workflow with NO args once all batches are done to verify the full set and build the index.`,
  );
  return {
    wrote: ok.map((r) => ({ num: r.num, out: r.out, report: r.report })),
    compiled: false,
  };
}

phase('Compile');

const compilePrompt = `You are verifying and indexing the completed 33-study "Way Home" historicist Bible-only series. Repo root: /Users/cvr/Developer/personal/bible-tools.

The series lives in \`${DIR}/\` as \`00-…\` through \`32-…\`. The contract is \`${BLUEPRINT}\`.

Do this:
1. Confirm all 33 files exist (00 through 32) with the slugs in the blueprint's old→new map. List any missing/mis-slugged.
2. Spot-check format compliance across the set: each has YAML frontmatter, a \`# Study N:\` heading, a bold thesis, \`## Prep Reading\`, the whiteboard markers, a \`**Central Verse:**\`, an \`## Appeal\`, and a \`**[→ Study N+1]**\` transition (study 32 may close the series instead).
3. Spot-check the LOCKED rules on a sample (studies 5, 24, 25, 26, 28): Bible-only proof (no doctrine resting on an EGW/pioneer quote); history only in the fulfillment lane; Study 5 keeps the paralytic both ways + the Ladder/Gate/Sanctuary hinge; Study 26 keeps the Conquering-Canaan framework; Study 24 establishes the LITERAL seventh-day Sabbath (not a "rest attitude"); Study 25 has NO "ten hands = Ten Commandments" numerology; Study 28 names the USA and keeps Rev 18:1 glory literal.
4. Write a series index to \`${DIR}/_INDEX.md\`: the four parts, the 33 numbered studies with titles + one-line theses (pull from each file's thesis line), and the old→new mapping. Keep it scannable.

Return one line: studies present (N/33), any format/rule gaps found, and confirmation the index was written.`;

const compileSummary = await agent(compilePrompt, { label: 'compile:index', phase: 'Compile' });

log('Series written + indexed.');
return {
  wrote: ok.map((r) => ({ num: r.num, out: r.out })),
  compile: compileSummary,
};
