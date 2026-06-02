export const meta = {
  name: 'final-countdown-author',
  description:
    'Turn Final Countdown + Judgment Day transcripts (+OCR) into Bible-Handbook-format studies',
  phases: [
    { title: 'Author', detail: 'one agent per study: transcript+OCR -> Handbook format' },
    { title: 'Verify', detail: 'check verse refs against source, fix hallucinations' },
  ],
};

// args: [{order, vid, slug, seriesLabel, title, transcriptPath, ocrPath}]
// Each agent reads its own transcript + OCR from disk (keeps args tiny).
// Guard: the harness may deliver `args` as a JSON string instead of a parsed array.
const STUDIES = typeof args === 'string' ? JSON.parse(args) : args;

const STUDY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['markdown', 'sectionCount', 'verseCount'],
  properties: {
    markdown: {
      type: 'string',
      description: 'The finished study in Bible-Handbook markdown format',
    },
    sectionCount: { type: 'integer' },
    verseCount: { type: 'integer' },
  },
};

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['markdown', 'changed', 'notes'],
  properties: {
    markdown: {
      type: 'string',
      description: 'The corrected study markdown (unchanged if already accurate)',
    },
    changed: { type: 'boolean' },
    notes: { type: 'string', description: 'Brief list of corrections made, or "none"' },
  },
};

const FORMAT_SPEC = `
TARGET FORMAT — Stephen Haskell's "Bible Handbook" (verses with short explanations under titled separators):

  ## <Clean Study Title> — <Study N or Week N>

  ### <Topic Title (Title Case, the doctrinal theme of this section)>

  > <optional 1-2 sentence framing quote, only if the speaker opened the section with one>

  - **<Book Ch:Verse(s)>** — <one short sentence explanation, drawn from the study>. <Optional EGW ref e.g. "CL 9.5" or "GC 605">
  - **<Book Ch:Verse(s)>** — <short explanation>.
  ...

RULES:
- Open with a level-2 heading:  ## <Clean Study Title> — <Study/Week label>
- Group the study into 3-10 topical sections with ### Title-Case headings.
- Each bullet = ONE scripture reference (or a tight cluster like "Rev. 13:1, 2") + a SHORT explanation (one sentence, max two). Mirror Haskell: terse, declarative, teaching the point of the verse.
- Use standard abbreviated book names (Gen., Ex., Ps., Matt., Rev., Dan., 1 Thess., etc.).
- ONLY include scripture references that actually appear in the transcript or the on-screen OCR. Do NOT invent references. If the speaker discusses a passage without saying the ref aloud, use the ref shown on screen in the OCR.
- Prefer the EXACT verse reference and any EGW page citation as shown in the ON-SCREEN OCR (it is authoritative for refs the speaker only gestures at, e.g. "as you see here").
- Append EGW source citations (GC, DA, PP, PK, AA, EW, Country Living, Testimonies vol/p, etc.) when the study cites them, in Haskell's compact style.
- Keep explanations doctrinally faithful to what the SPEAKER taught — this is their study, not your commentary. Do not soften, debate, or add caveats or disclaimers.
- Do NOT include filler (greetings, prayer, "smash that like button", donation/subscribe appeals, Q&A logistics).
- If the video is a Q&A (e.g. "Country Living Q&A"), organize by the doctrinal questions answered, still anchored to the scriptures cited.

HANDLING THE OCR (it is auto-extracted from video frames, so it has artifacts):
- IGNORE live-chat / viewer-comment overlays in the OCR (lines that look like "FirstName LastName <a question or remark>", e.g. "Sonia Ramos Wu Do you think..."), website nav chrome ("Watch Read Prophecy News More Home / ..."), and registration/sign-up banners. These are NOT study content.
- The OCR of stylized PROPHECY CHARTS (e.g. the 1843 chart: Babylon / Medo-Persia / Grecia / Pagan Rome, dates like 457, 538, 1798, 1844) is often GARBLED. Recover the intended kingdoms/dates/labels from context + the transcript; cite the scripture the chart is built on (Dan. 2, Dan. 7, Dan. 8, Dan. 9) rather than transcribing garbled glyphs.
- When the OCR shows a clean QUOTE slide attributed to a historical source (Hobbes' Leviathan, Catholic Record, Lucius Ferraris, a council, etc.) that the study uses as evidence, you MAY include it as a short supporting note under the relevant section, but the BULLETS must remain scripture-first.
- Trust the TRANSCRIPT for what was taught and the OCR for exact verse references/numbers; when they conflict on a reference, prefer the OCR.
`;

phase('Author');

const results = await pipeline(
  STUDIES,
  // STAGE 1: author
  (s) =>
    agent(
      `You are compiling a Bible study in the style of Stephen Haskell's "Bible Handbook" — a topical index of scripture references with short explanations under titled separators.

This study is "${s.title}" (series: ${s.seriesLabel}).

First, READ these two files with the Read tool:
- SPOKEN TRANSCRIPT (auto-captions, may have minor errors): ${s.transcriptPath}
- ON-SCREEN OCR (slides — AUTHORITATIVE for exact verse references and EGW page numbers): ${s.ocrPath}

${FORMAT_SPEC}

EGW CITATIONS — when the study cites an Ellen G. White passage, give a precise refcode in the form "<BOOK> <page>.<para>" (e.g. "PK 626.1", "GC 605.2", "CL 9.5", "5T 451.1"). These will be verified against a local EGW database, so be as exact as the OCR/transcript allows. Common book codes: GC, PP, PK, DA, AA, EW, CL (Country Living), 1T–9T (Testimonies vols), LDE (Last Day Events), DAR (Daniel & Revelation).

Produce the finished study markdown now. Be comprehensive: capture every scripture the study walks through, in the order the study presents them, grouped into sensible titled sections.`,
      { label: `author:${s.order}`, phase: 'Author', schema: STUDY_SCHEMA },
    ).then((r) => ({ s, draft: r })),
  // STAGE 2: verify + fix
  (prev) => {
    if (!prev) return null;
    const { s, draft } = prev;
    return agent(
      `You are a meticulous fact-checker for a Bible study compiled in Haskell "Bible Handbook" format.

First, READ the source files the draft was built from:
- SPOKEN TRANSCRIPT: ${s.transcriptPath}
- ON-SCREEN OCR: ${s.ocrPath}

=== DRAFT TO CHECK ===
${draft.markdown}

Your job:
1. SCRIPTURE REFS: Verify EVERY Bible reference in the draft actually appears in (or is clearly supported by) the transcript or OCR. Remove or correct any reference that was invented or mis-cited.
2. EGW QUOTE VERIFICATION (IMPORTANT — use the CLI): For EVERY Ellen G. White citation in the draft (e.g. "PK 626.1", "GC 605.2", "CL 9.5", "5T 451"), verify it against the local EGW database by running the Bash tool from the repo root /Users/cvr/Developer/personal/bible-tools:
     bun run packages/cli/src/main.ts egw lookup "<REFCODE>" --json
   - If the command returns "found": true and the paragraph text MATCHES what the study attributes to that ref, keep it.
   - If the text does NOT match the study's claim, or "found": false, the refcode is wrong. Try to locate the correct page: search the DB with
       bun run packages/cli/src/main.ts egw search "<a distinctive phrase from the quote>" --book <CODE> --json
     and correct the refcode. If you cannot confirm it, drop the EGW citation (keep the scripture bullet) rather than leave a fabricated page number.
   - Prefer the verified DB refcode over the OCR's page number when they differ.
3. Verify explanations reflect what the SPEAKER actually taught (not outside commentary).
4. Keep the Haskell format intact (## title, ### sections, "- **Ref** — explanation" bullets).
5. Do NOT add new material the study didn't cover. Only correct/trim.

In "notes", list each EGW refcode you checked and its verdict (verified / corrected X->Y / dropped). Return the corrected markdown (unchanged if already accurate).`,
      { label: `verify:${s.order}`, phase: 'Verify', schema: VERIFY_SCHEMA },
    ).then((v) => ({
      order: s.order,
      vid: s.vid,
      slug: s.slug,
      title: s.title,
      seriesLabel: s.seriesLabel,
      markdown: v.markdown,
      changed: v.changed,
      notes: v.notes,
    }));
  },
);

const clean = results.filter(Boolean);
log(
  `Authored ${clean.length}/${STUDIES.length}; ${clean.filter((c) => c.changed).length} corrected in verify`,
);

return clean;
