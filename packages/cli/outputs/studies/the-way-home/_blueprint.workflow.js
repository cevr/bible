export const meta = {
  name: 'way-home-blueprint',
  description:
    'Design the zero-to-100 historicist BIBLE-ONLY rewrite of the Way Home series: final study list, per-study scope, the texts that PROVE each doctrine, historical fulfillments to document, and spiritualizing defects to fix — one reviewable blueprint, no studies written yet',
  phases: [
    {
      title: 'Design slices',
      detail:
        'parallel architects each design one slice of the chain (foundation / Daniel+time-prophecies / Revelation / consummation) + a defect-mapper',
    },
    {
      title: 'Synthesize blueprint',
      detail: 'one agent stitches the slices into a single ordered series blueprint for review',
    },
  ],
};

const DIR = 'packages/cli/outputs/studies/the-way-home';

// ===========================================================================
// The governing directive — every architect receives this verbatim.
// ===========================================================================

const DIRECTIVE = `
# The rewrite directive (read carefully — this governs every design decision)

We are rewriting an existing 17-study narrative Bible series, "The Way Home," into a **zero-to-100 historicist, LITERAL, BIBLE-ONLY** study chain that recreates the chain of truth the SDA pioneers (Miller, Snow, Bates, Litch, Fitch, Hale, Uriah Smith, James White, J.N. Andrews, A.T. Jones, Waggoner, Haskell, Loughborough) established — but **proved from the Bible itself**, inside the Way Home narrative frame.

## The four non-negotiable rules

1. **BIBLE-ONLY PROOF.** Every doctrine is established from Scripture, by the Bible's own method: take the plain literal sense; let Scripture be its own expositor; gather precept upon precept (Isa 28:10); compare spiritual things with spiritual (1 Cor 2:13); never break Scripture against itself (John 10:35); the year-day key from the Bible (Num 14:34; Eze 4:6). **Do NOT prove doctrine by citing pioneers or Ellen White.** Their authority is NOT the ground of any doctrine here. The reader must be able to verify every doctrine with an open Bible alone.

2. **HISTORY IS THE ONE EXCEPTION — and only for FULFILLMENT, not doctrine.** The historicist proof is: the Bible predicts X → history records X happened on schedule. So when a prophecy's *fulfillment* is a datable historical EVENT, that event is documented from the historical record (and may cite a source for the event — e.g. a historian, an encyclopedia, a pioneer who recorded the date). Examples that REQUIRE a documented historical event: 538 AD & 1798 AD (the 1260); 457 BC (the decree); 27/31/34 AD; the three uprooted horns (Heruli 493, Vandals 534, Ostrogoths 538); Constantine's Sunday edict (321 AD); **the 6th-trumpet date August 11, 1840 (Litch's published-in-advance prediction and its fulfillment)**; the 6th-seal signs (Lisbon earthquake Nov 1, 1755; the Dark Day May 19, 1780; the falling stars Nov 13, 1833); the deadly wound (1798, Berthier takes the pope); the rise of the USA. The event is history; the *meaning* is still proved from the Bible.

3. **TYPOLOGY YES, SPIRITUALIZING NO.** This distinction is decisive and was stated explicitly by the user:
   - **Typology is LEGITIMATE and stays:** a literal historical thing the text itself authorizes as a figure of another literal thing. Jacob's wrestling → the literal time of trouble (Jer 30:7 *names* it); the sanctuary services → Christ's literal heavenly ministry (Heb 8); Passover → the literal cross (1 Cor 5:7); the Exodus as ensample (1 Cor 10:11). Keep all of this.
   - **Spiritualizing is the ERROR to remove:** asserting a DOCTRINE on the basis of a non-literal / inner / allegorical reading rather than establishing it from plain didactic Scripture. The test is what the doctrine RESTS ON, not whether a type is used. Examples that MUST be fixed: "ten hands = the Ten Commandments" numerology (study 13); the literal glory of Rev 18:1 redefined as merely "character reflected" (study 15); the literal 7th-day Sabbath reduced to "a trust-rest/beholding attitude" with no literal observance (study 12); the literal "come out of Babylon" subordinated to "waiting for inner transformation" (study 11); the paralytic's "go to thine house" allegorized into "the Holy Place is the journey home" (study 5).
   - **NOT a defect — legitimate, KEEP it: the Canaan / conquest framework (study 14).** Canaan-as-a-framework-for-the-spiritual-life is text-authorized typology, NOT spiritualizing: 1 Cor 10:11 ("written for our ensamples"), Heb 3-4 (the text itself makes Canaan a type of the rest that remains), Gal 4:24 (Paul's own marked allegory of the two covenants). The conquest (the spy report, the giants, "little by little," Joshua's Commander) may be used as the SCAFFOLDING to understand sanctification. The only requirement: the DOCTRINE underneath (progressive sanctification, the two covenants, righteousness by faith) must be anchored in plain NT texts (Romans, Galatians, Hebrews, Philippians 2:12-13) — with the conquest as the illustrative overlay, not the sole proof. Do NOT strip the Canaan framing.
   - **The test:** does a doctrine REST on a non-literal reading, or on plain didactic Scripture? If the type/allegory is the only proof → fix it (put the plain-text proof underneath; keep the type as the overlay). If the type is text-authorized AND the doctrine is anchored in plain Scripture → it is fine.

4. **KEEP THE NARRATIVE FRAME.** Do NOT strip the Way Home story (the cosmic trial → Satan's two charges → the broken bridge → exile in Babylon → the call home → restoration). Keep the whiteboard study format and its markers: \`[→]\` (insight), \`[DYK🔎]\` (did-you-know), \`[Q]\` (objection+answer), \`[ILL]\` (illustration), \`[STR]\` (structural/key point), \`[STR]\`, \`[TANGENT]\`. Keep prep-reading lists, a Central Verse, an Appeal, and a transition to the next study. Devotional appeals are welcome — they just may not carry doctrine.

## Doctrinal line: MATURE SDA (Uriah Smith DAR + Ellen White settled positions)
On contested pioneer points, follow the settled denominational position: the "daily" = paganism; the seals/trumpets/churches per the historicist DAR scheme; the investigative judgment beginning 1844. Use the Millerite movement (Miller/Snow/Litch/the charts) for the time-prophecies and the 1844 history, corrected where the pioneers later refined. (But remember rule 1 — even these are PROVED from the Bible, not asserted on Smith's/White's authority.)

## The existing 17 studies (the narrative spine to keep)
0. Hath God Said? — how to read the Book (already written; the method foundation)
1. The Cosmic Trial — why you exist (Satan's charges; sound)
2. The Bridge Destroyed and Restored — fall, proto-gospel, sanctuary introduced
3. What Salvation Really Is — image/law/character restoration
4. Why It Had to Be Christ — the atonement, the two natures
5. Thy Way O God — the sanctuary maps salvation (HAS the paralytic defect)
6. Two Laws — moral vs ceremonial law
7. The Counterfeit System — Satan's counterfeit through the four kingdoms (Dan 2)
8. Prophecy Names the System — Daniel 7, the little horn, the 1260 (strong historicist)
9. The Timeline Unlocked — 2300 days + 70 weeks math, 1844 (strong; needs the daily kept literal)
10. 1844 and the Judgment — the Day of Atonement, investigative judgment
11. Come Out of Her — Babylon, Rev 18:4 (HAS the "inner transformation" defect)
12. The Sabbath — seal of God (HAS the "trust-rest attitude" defect)
13. The Temple of the Holy Spirit — health/body (HAS the "ten hands" numerology defect)
14. Conquering Canaan — sanctification (HAS the "Canaan = your mind" defect — the prototype error)
15. The Final Crisis — Sunday law, mark of the beast, USA (HAS the Rev 18:1 glory defect; USA not named)
16. The Time of Trouble and Deliverance — close of probation, plagues, 2nd coming
17. The Image Restored — seal, 144000, millennium, new earth

## The MISSING literal-historicist content the series must gain (currently absent everywhere)
- The seven churches as successive church-history epochs (Rev 2-3)
- The seven seals as successive church history (Rev 6) incl. the 6th-seal signs (1755/1780/1833)
- The seven trumpets as literal judgments on Rome/Byzantium/Ottoman (Rev 8-9)
- **The Eastern Question / the 6th trumpet / Litch's August 11, 1840 prediction** (the pioneers' single most powerful proof of the year-day principle) — THE biggest gap
- The 1290 and 1335 days (Dan 12), shown converging on 1798/1843-44
- The 2520 "seven times" (Lev 26) as a parallel corroboration
- The 6000-year / great-week chronology (the 1843 chart's frame)
- Revelation 10 — the little book, the bittersweet, the 1843-44 disappointment + tarrying time + Habakkuk 2 + the true midnight cry (Snow, seventh-month)
- Revelation 12 (woman/dragon/1260) as its own treatment
- Revelation 13 split clearly: sea beast = papacy; two-horned beast = the USA NAMED; the image; the mark
- The three angels' messages as a unit (Rev 14)
- The 144,000 and the great multitude, treated as a literal sealed group
- Revelation 17 — the woman on the beast = Babylon
- State of the dead / spiritualism as the last deception
- Armageddon / the seven last plagues, distinguished from the post-millennial battle
`;

// ===========================================================================
// The five design slices. Each architect designs ONE slice's studies.
// ===========================================================================

const BLUEPRINT_SCHEMA = {
  type: 'object',
  required: ['slice', 'studies'],
  properties: {
    slice: { type: 'string' },
    notes: { type: 'string', description: 'cross-cutting notes for the synthesizer' },
    studies: {
      type: 'array',
      items: {
        type: 'object',
        required: [
          'proposedNumber',
          'slug',
          'title',
          'status',
          'thesis',
          'doctrinesProvenFromBible',
          'keyTexts',
          'historicalEventsToDocument',
          'spiritualizingDefectsToFix',
          'typologyToKeep',
          'narrativeBeat',
        ],
        properties: {
          proposedNumber: {
            type: 'string',
            description: 'e.g. "9" to keep, "9a" to insert after 9, "NEW" if order is open',
          },
          slug: { type: 'string', description: 'kebab-case file slug, no number prefix' },
          title: { type: 'string' },
          status: {
            type: 'string',
            enum: ['keep-reframe', 'heavy-rewrite', 'new'],
            description:
              'keep-reframe = existing study, fix defects + add content; heavy-rewrite = existing but mostly redone; new = brand new study',
          },
          existingFile: {
            type: 'string',
            description: 'the existing NN-slug.md this maps to, or "" if new',
          },
          thesis: { type: 'string', description: 'one-sentence controlling claim' },
          doctrinesProvenFromBible: {
            type: 'array',
            items: { type: 'string' },
            description: 'each doctrine this study must PROVE from Scripture',
          },
          keyTexts: {
            type: 'array',
            items: { type: 'string' },
            description:
              'the Bible passages that carry the proof (the backbone of the study), e.g. "Daniel 8:14", "Numbers 14:34"',
          },
          historicalEventsToDocument: {
            type: 'array',
            items: { type: 'string' },
            description:
              'datable historical fulfillments to document from the record (the ONLY place external sources appear), e.g. "August 11 1840 — Litch\'s prediction + fulfillment"; "" entries fine if none',
          },
          spiritualizingDefectsToFix: {
            type: 'array',
            items: { type: 'string' },
            description: 'specific non-literal-doctrine moves in the existing file to remove/fix',
          },
          typologyToKeep: {
            type: 'array',
            items: { type: 'string' },
            description:
              'legitimate text-authorized types to preserve (so the writer does not over-correct)',
          },
          narrativeBeat: {
            type: 'string',
            description: 'how this study sits in the Way Home story arc',
          },
        },
      },
    },
  },
};

const SLICES = [
  {
    key: 'foundation',
    label: 'I — Foundation & the Gospel',
    brief: `Design the FOUNDATION slice (current studies 1-6, plus the already-written Study 0 which you only REFERENCE, do not redesign). This slice establishes: the cosmic trial and Satan's two charges; the fall and the proto-gospel; what salvation is (image/law/character restored); why it had to be Christ; the sanctuary as the literal map of salvation and of Christ's literal heavenly ministry; the two laws (moral vs ceremonial).
    Your job: keep the narrative, but (a) ensure every doctrinal claim is proved from the BIBLE (flag where studies 3,4 currently have zero grounding and which TEXTS should carry the proof); (b) FIX study 5's paralytic-allegory defect (the "Holy Place = journey home" move) — re-anchor the Holy Place in the literal sanctuary type; (c) preserve legitimate sanctuary TYPOLOGY (Heb 8 — earthly copy of the literal heavenly); (d) make sure the sanctuary study plants the literal two-apartment / Day-of-Atonement structure that studies 9-10 will date to 1844. Decide whether the 6000-year chronology + the year-day principle should be introduced here as part of "how prophecy is read" or deferred to the Daniel slice (recommend, with reasons).`,
  },
  {
    key: 'daniel',
    label: 'II — Daniel & the Time-Prophecies',
    brief: `Design the DANIEL + TIME-PROPHECIES slice. This is the literal-historicist heart and currently spans studies 7,8,9 plus large MISSING content. It must take the reader from zero to mastery of: Daniel 2 (four kingdoms, the stone); Daniel 7 (four beasts, the little horn, the 1260, the judgment); Daniel 8 (the ram/he-goat, the 2300 days, the sanctuary); the year-day principle proved from Num 14:34 + Eze 4:6; Daniel 9 (the 70 weeks as the keystone that DATES the 2300 days — the 457 BC decree, 27/31/34 AD, 1844); **the "daily"** (Dan 8:11-13; 11:31; 12:11 — mature SDA = paganism, kept literal-historical); **the 1290 and 1335 days** (Dan 12) converging on 1798/1843-44; **the 2520 "seven times"** (Lev 26) as a parallel corroboration; and the 6000-year great-week frame (the 1843 chart).
    Decide the study breakdown (likely: keep & strengthen 7,8,9; ADD a dedicated "year-day principle" study, a "daily/1290/1335/2520 convergence" study). For EACH, list the Bible texts that prove it and the historical events to document (457 BC decree; 538/1798; the three uprooted horns w/ dates). Keep the existing strong historicist work in 8 and the 70-weeks math in 9 — your job is to fill gaps and ensure Bible-only proof + documented history, NOT to undo what works.`,
  },
  {
    key: 'revelation',
    label: 'III — The Revelation Series',
    brief: `Design the REVELATION slice — almost entirely NEW content (the current series has essentially none of the Revelation prophetic sequences). Design dedicated studies for: the seven churches (Rev 2-3) as successive church-history epochs; the seven seals (Rev 6) incl. the 6th-seal signs (Lisbon 1755, Dark Day 1780, falling stars 1833); the seven trumpets (Rev 8-9) as literal judgments on Rome→Byzantium→Ottoman, culminating in **the Eastern Question / the 6th trumpet / Litch's August 11, 1840 prediction-and-fulfillment** (give this its own prominence — it is the biggest gap and the pioneers' strongest year-day proof); Revelation 10 (the little book, the bittersweet, the 1843-44 disappointment, the tarrying time, Habakkuk 2, the true midnight cry / seventh-month movement / Snow); Revelation 12 (woman/dragon/1260); Revelation 13 (sea beast = papacy; two-horned beast = the USA, NAMED and proved from the text's specifications; the image; the mark — proved as the Sabbath/Sunday issue); the three angels' messages (Rev 14); the 144,000 + great multitude; Revelation 17 (the woman on the beast = Babylon).
    For each: the Bible texts that prove it, and the historical events to document. The proof method is the historicist signature — prophecy spec → matching historical fact. Slot these as new studies; propose where they sit relative to the existing 7-12 (e.g. the churches/seals/trumpets likely come as a block, the daily/Revelation-10/charts thread with the 1844 studies). Keep proof BIBLE-FIRST, history only for fulfillment dates.`,
  },
  {
    key: 'consummation',
    label: 'IV — Sanctuary, Sabbath & Consummation',
    brief: `Design the CONSUMMATION slice (current studies 10-17). It must cover: 1844 / the sanctuary cleansing / the investigative judgment (study 10 — keep & strengthen, prove from Dan 7:9-10,13-14; 8:14; Lev 16; Heb 8-9); the Sabbath as the seal of God (study 12 — FIX the "trust-rest attitude" defect; establish LITERAL 7th-day observance proved from Scripture, Dan 7:25 the changing of times/laws, the seal's name/title/territory); "come out of Babylon" (study 11 — FIX the "inner transformation" defect; keep the literal call literal); the body temple / health (study 13 — REMOVE the "ten hands = Ten Commandments" numerology; keep Daniel 1 as literal history + the literal eschatological-readiness point); sanctification / "conquering Canaan" (study 14 — NOT a defect: the Canaan/conquest framework is LEGITIMATE text-authorized typology (1 Cor 10:11; Heb 3-4 makes Canaan a type of the rest that remains; Gal 4:24 the two covenants). KEEP the conquest scaffolding — the spy report, the giants, "little by little," Joshua's Commander — as the framework for understanding the spiritual life. The ONLY adjustment: make sure the DOCTRINE underneath (progressive sanctification, the two covenants, righteousness by faith) is anchored in plain NT proof-texts (Romans, Galatians, Hebrews, Phil 2:12-13), with the conquest as the illustrative overlay. Do NOT strip the Canaan framing or treat it as an error); the final crisis / mark of the beast / image of the beast / USA (study 15 — FIX the Rev 18:1 "glory=character only" defect; NAME the USA; keep the literal Sunday-law sequence); state of the dead + spiritualism as the last deception (currently thin — propose a dedicated study); the close of probation + time of Jacob's trouble (study 16); Armageddon + the seven last plagues (distinguish from the post-millennial battle); the literal second coming; the millennium + two resurrections + the new earth (study 17).
    For each: the Bible texts that prove it; historical events to document (1798 deadly wound; the USA's rise; Sunday-law history). The hard cases are 12, 13, 14, 15 — show exactly what to cut and what to prove-from-Scripture instead, and exactly which typology to KEEP so the writer does not over-correct a legitimate type into nothing.`,
  },
];

// ===========================================================================
// Phase 1 — parallel slice architects + a defect-mapper.
// ===========================================================================

phase('Design slices');
log(`Designing ${SLICES.length} slices of the historicist Bible-only chain, in parallel`);

const sliceResults = await parallel(
  SLICES.map(
    (s) => () =>
      agent(
        `You are a Bible-study ARCHITECT designing one slice of a rewritten historicist study chain. Repo root: /Users/cvr/Developer/personal/bible-tools.

${DIRECTIVE}

# YOUR SLICE: ${s.label}
${s.brief}

# What to do
1. Read the relevant existing files in \`${DIR}/\` for your slice (the study numbers named in your brief) so your design builds on the real prose, not a guess. Also skim \`${DIR}/00-hath-god-said.md\` for the format/markers and \`packages/cli/outputs/studies/understanding-prophecy/understanding-prophecy.md\` (the literal 29-study chain) for the historicist content you can mine.
2. You may run \`set -a; source packages/cli/.env; set +a\` then \`bun run packages/cli/src/main.ts verse "REF" --json\` to confirm a Bible text proves the point. (You are designing, not writing — only spot-check the load-bearing texts.)
3. Design the studies for your slice. For EACH study return the full schema object: proposed number/order, slug, title, status (keep-reframe / heavy-rewrite / new), the existing file it maps to, the thesis, the doctrines it must PROVE FROM THE BIBLE, the key proof-texts, the historical events to document (the ONLY external sources), the spiritualizing defects to fix, the legitimate typology to keep, and the narrative beat.

Bias: keep what already works (esp. the strong historicist studies 8 and 9, and sound typology); fix only real spiritualizing defects; fill the missing literal content; prove everything from the Bible; document history only for fulfillments. Return ONLY the structured object.`,
        {
          label: `design:${s.key}`,
          phase: 'Design slices',
          schema: BLUEPRINT_SCHEMA,
        },
      ).then((r) => ({ key: s.key, label: s.label, design: r })),
  ),
);

const designs = sliceResults.filter(Boolean);
log(`${designs.length}/${SLICES.length} slices designed`);
for (const d of designs) log(`  ✓ ${d.label} — ${d.design?.studies?.length ?? 0} studies`);

// ===========================================================================
// Phase 2 — synthesize one ordered blueprint document for review.
// ===========================================================================

phase('Synthesize blueprint');

const synthesisInput = JSON.stringify(
  designs.map((d) => ({ slice: d.label, ...d.design })),
  null,
  2,
);

const synthPrompt = `You are the EDITOR assembling four slice-designs into ONE reviewable series blueprint for "The Way Home — Historicist, Bible-Only" rewrite. Repo root: /Users/cvr/Developer/personal/bible-tools.

${DIRECTIVE}

# The four slice designs (JSON)
\`\`\`json
${synthesisInput}
\`\`\`

# Your job
Write a single Markdown blueprint to \`${DIR}/_BLUEPRINT.md\` (Write tool, overwrite). It must:
1. Open with a short statement of the rewrite's thesis and the four rules (Bible-only proof; history only for fulfillment; typology-yes / spiritualizing-no; keep the narrative frame), and the mature-SDA doctrinal line.
2. Resolve the four slices into ONE coherent, FINAL NUMBERED study list, 0..N, with no gaps and no collisions. Reconcile overlaps between slices (e.g. if two slices both proposed a Revelation-10 / charts / 1844 study, merge them). Decide the running order so the chain truly goes zero-to-100 and the narrative arc holds. Where you insert new studies, renumber cleanly and note the old→new mapping for the existing 17.
3. For EACH final study, a compact spec block: number + title; status (keep-reframe / heavy-rewrite / new) + which existing file it maps to; one-line thesis; "Proves from the Bible:" (bullet doctrines); "Proof texts:" (the backbone passages); "Document from history:" (datable fulfillments — the only external sources, or "none"); "Defects to fix:" (for existing studies); "Typology to keep:"; "Narrative beat:".
4. A "Defects master-list" table: every spiritualizing defect found across the existing 17, which study, and the fix.
5. A "New studies added" list and a "Coverage check" confirming every item from the MISSING-content list is now home (seven churches; seven seals incl. 1755/1780/1833; seven trumpets; the Eastern Question / 1840; Rev 10 / tarrying / midnight cry; 1290/1335; 2520; 6000yr; Rev 12; Rev 13 with USA named; three angels; 144000; Rev 17; state of the dead/spiritualism; Armageddon/plagues; literal 2nd coming; millennium/new earth).
6. End with a short "Open questions for review" list (anything genuinely ambiguous the user should decide — keep it to real forks, not busywork).

Keep it tight and scannable — this is a plan to APPROVE, not the studies themselves. After writing, return one line: final study count, how many keep-reframe vs heavy-rewrite vs new, and confirmation the file was written.`;

const summary = await agent(synthPrompt, {
  label: 'synthesize:blueprint',
  phase: 'Synthesize blueprint',
});

log('Blueprint synthesized.');
return {
  slices: designs.map((d) => ({ slice: d.label, studyCount: d.design?.studies?.length ?? 0 })),
  blueprint: summary,
};
