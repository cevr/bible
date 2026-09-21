export const meta = {
  name: 'day3-narrative-notes',
  description:
    'Rewrite every Day-3 ("Why Suffering?") slide presenter note as a NARRATIVE story-telling helper, grounded in EGW Story of Redemption (primary) + the Conflict of the Ages series (PP, PK, DA, AA, GC) pulled and verified via the `bible egw` CLI. Also audits the deck against the full Story of Redemption arc and reports major moments the deck is missing. Returns {notes:[{slide,newNote}], gaps:[...]}. Pass args={slides:[start,end]} to subset.',
  whenToUse:
    'Regenerate the Day-3 deck presenter notes as narrative helpers from SR + Conflict-of-Ages. Pass args={deckJson, slides:[start,end]} to subset a range.',
  phases: [
    { title: 'Map', detail: 'read the deck; map each slide to its story beat + SR/COA chapter' },
    {
      title: 'Write',
      detail:
        'OPUS per slide: pull SR + Conflict-of-Ages passages, rewrite the note as a narrative helper',
      model: 'opus',
    },
    {
      title: 'Gap-Audit',
      detail:
        'OPUS: compare the deck beat-map to the full Story of Redemption arc; report missing major moments',
      model: 'opus',
    },
  ],
};

// ===========================================================================
// Inputs
// ===========================================================================
const REPO = '/Users/cvr/Developer/personal/bible-tools';
let RAW = args || {};
if (typeof RAW === 'string') {
  try {
    RAW = JSON.parse(RAW);
  } catch {
    RAW = {};
  }
}
const _DECK_JSON =
  RAW.deckJson || `${REPO}/packages/cli/outputs/decks/what-is-truth/day3-slides-current.json`;
const RANGE = Array.isArray(RAW.slides) && RAW.slides.length === 2 ? RAW.slides : null; // [start,end] inclusive, 1-based
const RUN_AUDIT = RAW.audit !== false;
// Per-batch output suffix so parallel range-batches don't clobber one result file.
const RUN_TAG = RAW.runTag
  ? String(RAW.runTag).replace(/[^a-z0-9_-]/gi, '')
  : RANGE
    ? `${RANGE[0]}-${RANGE[1]}`
    : 'all';

// ===========================================================================
// Shared contract
// ===========================================================================
const TOOLS = `
## EGW source tools (repo root: ${REPO}; local, NO auth needed)
- READ a paragraph:  bun run packages/cli/src/main.ts egw "SR 50.1"      (bare refcode → prints the paragraph; works for SR, PP, PK, DA, AA, GC, COL, etc.)
- SEARCH (FTS):      bun run packages/cli/src/main.ts egw search "plain words here" --limit 8   (NO hyphens/quotes inside the phrase — the FTS parser trips)
- NEVER run \`egw open\` (it launches an interactive TUI and hangs). Use the bare-refcode read and \`egw search\` ONLY.
- Story of Redemption (SR) is the PRIMARY narrative spine. The Conflict of the Ages series corroborates and enriches:
  Patriarchs and Prophets (PP), Prophets and Kings (PK), The Desire of Ages (DA), The Acts of the Apostles (AA), The Great Controversy (GC), Christ's Object Lessons (COL).
- Verify every quote before you lean on it. Paraphrase freely for the NOTE (it is a speaker helper, not a citation list), but the STORY must be faithful to what SR/COA actually say.
`;

const VOICE = `
## VOICE — the note is a NARRATIVE STORY-TELLING HELPER
The presenter reads this to himself, then TELLS the story to a non-Christian audience. So each note must:
- Read like the beat of a story being told — vivid, warm, human, sequential. NOT a bullet outline, NOT a citation dump, NOT a lecture.
- Give the speaker the SCENE (what is happening, the emotional weight) and the THREAD (how this beat connects to the one before and the great-controversy arc).
- Be grounded in Story of Redemption's telling of this moment (and the fuller Conflict-of-Ages account where it deepens the scene) — use SR's imagery, emphases, and cause-and-effect.
- Preserve any concrete facts/cues already in the current note (a date, a name, a QR instruction, a "IF ASKED" fact-check, a callback to an earlier night) — do not drop stage directions the speaker relies on.
- Be tellable aloud in ~20-45 seconds. Tight, evocative, moving the story forward. No slogans.
- Honor the deck's canon: the Father is never described as a visible figure; keep the reverent tone; this is for a non-Christian audience so lead with story and human stakes, not jargon.
Return the rewritten note as plain prose (may use short paragraph breaks). Your final message IS the new note text — nothing else.
`;

// ===========================================================================
// Phase 0 — Map: load the precomputed beat-map (deterministic, no agent).
// The beat-map is built once from the deck (slide/beat/srChapter/body/note) and
// committed to disk so every batch reads it instantly — no per-batch map-deck
// agent (which was a slow single-point-of-failure).
// ===========================================================================
phase('Map');

const BEATMAP_PATH =
  RAW.beatmap || `${REPO}/packages/cli/outputs/decks/what-is-truth/day3-beatmap.json`;
const mapRaw = await agent(
  `Read the JSON file at ${BEATMAP_PATH} with the Read tool and return its EXACT contents as your entire reply — a JSON array of {slide,beat,srChapter,body,note}. Do not summarize, reformat, or add anything.`,
  { label: 'load-beatmap', phase: 'Map', effort: 'low', agentType: 'general-purpose' },
);
let beatmap;
try {
  const m = String(mapRaw).match(/\[[\s\S]*\]/);
  beatmap = JSON.parse(m ? m[0] : mapRaw);
} catch (e) {
  throw new Error(`Could not parse beat-map from ${BEATMAP_PATH}: ${e.message}`, { cause: e });
}
const deckMap = { slides: beatmap };

let slides = deckMap.slides.slice().sort((a, b) => a.slide - b.slide);
if (RANGE) slides = slides.filter((s) => s.slide >= RANGE[0] && s.slide <= RANGE[1]);
log(
  `Mapped ${deckMap.slides.length} slides; rewriting ${slides.length}${RANGE ? ` (range ${RANGE[0]}-${RANGE[1]})` : ''}.`,
);

// ===========================================================================
// Phase 1 — Write: OPUS per slide, grounded in SR + Conflict-of-Ages
// ===========================================================================
phase('Write');

const notes = await pipeline(slides, async (s) => {
  // logistics slides (no SR chapter) get a lighter touch — keep their function, warm the voice
  const isLogistics =
    !s.srChapter || /qr|title|ask|study with me|criteria callback/i.test(s.beat || '');
  const newNote = await agent(
    `You are rewriting the presenter note for Day-3 slide ${s.slide} of the "Why Suffering?" evangelistic deck.
STORY BEAT: ${s.beat}
${s.srChapter ? `STORY OF REDEMPTION CHAPTER: ${s.srChapter}` : 'This is a logistics/framing slide (no SR chapter).'}
ON-SLIDE TEXT: ${s.body || '(none — full-bleed image)'}
CURRENT NOTE (preserve its concrete cues; improve its telling):
"""${s.note}"""

${
  isLogistics
    ? 'This is a framing/logistics slide. Keep its exact FUNCTION and every concrete instruction (QR text, URL, "study with me" ask, night-callback, fact-check). Just make the voice warm and narrative where natural. Do NOT invent story content for it.'
    : `Pull the Story of Redemption account of this beat (READ the relevant SR paragraphs with \`bun run packages/cli/src/main.ts egw "SR <page>"\`; search first if unsure which page: \`egw search "few plain words"\`). Deepen with the Conflict-of-Ages parallel (PP/PK/DA/AA/GC) where it enriches the scene. Then rewrite the note as a narrative helper faithful to SR's telling.`
}
${TOOLS}
${VOICE}`,
    { label: `note:${s.slide}`, phase: 'Write', model: 'opus', agentType: 'general-purpose' },
  );
  // Extraction guard: strip any leaked reasoning preamble the writer may have prepended.
  const cleaned = await agent(
    `The text below is meant to be a presenter's narrative note, but it may have a leaked reasoning preamble before the actual note (e.g. "I have the full SR arc…", a bullet list of sources, or a "---" divider). Return ONLY the finished narrative note prose — the part a speaker would read aloud to tell the story. Strip any preamble, source-list, meta-commentary, or divider. Do not rewrite, shorten, or add anything; return the story prose verbatim from where it actually begins. Your entire reply IS the cleaned note.
### RAW:
${newNote || ''}`,
    { label: `clean:${s.slide}`, phase: 'Write', effort: 'low', agentType: 'general-purpose' },
  );
  return {
    slide: s.slide,
    beat: s.beat,
    srChapter: s.srChapter,
    oldNote: s.note,
    newNote: (cleaned || newNote || '').trim(),
  };
});

const writtenNotes = notes.filter(Boolean).filter((n) => n.newNote && n.newNote.length > 0);
log(`Rewrote ${writtenNotes.length}/${slides.length} notes.`);

// ===========================================================================
// Phase 2 — Gap audit against the full Story of Redemption arc
// ===========================================================================
let gaps = [];
if (RUN_AUDIT) {
  phase('Gap-Audit');
  const GAP_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['missing', 'notes'],
    properties: {
      missing: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['moment', 'srChapter', 'whyItMatters', 'suggestedPlacement'],
          properties: {
            moment: {
              type: 'string',
              description: 'the major redemption-story moment the deck omits',
            },
            srChapter: { type: 'string', description: 'where SR covers it' },
            whyItMatters: {
              type: 'string',
              description: 'why it belongs in a "why suffering / great controversy" arc',
            },
            suggestedPlacement: {
              type: 'string',
              description: 'after which existing slide/beat it would go',
            },
          },
        },
      },
      notes: {
        type: 'string',
        description: "overall assessment of the deck's coverage of the SR arc",
      },
    },
  };
  const beatList = deckMap.slides
    .map((s) => `${s.slide}. ${s.beat}${s.srChapter ? ` [SR: ${s.srChapter}]` : ''}`)
    .join('\n');
  gaps = await agent(
    `You are auditing the Day-3 "Why Suffering?" deck against the full arc of Ellen White's STORY OF REDEMPTION (SR). The deck tells the great-controversy story from a pre-fall universe through to the end. Here is the deck's complete beat-map (${deckMap.slides.length} slides):

${beatList}

Walk the ENTIRE Story of Redemption arc, chapter by chapter (use \`bun run packages/cli/src/main.ts egw "SR <page>"\` and \`egw search\` to survey its chapters — it runs from the fall of Satan, creation, the fall, the flood, the patriarchs, the exodus, the earthly sanctuary, Israel's history, the first advent, the cross, the resurrection, Pentecost, the apostolic church, the great apostasy, the Reformation, the advent movement, the great controversy's close, and God's love triumphant at last). Identify the MAJOR redemption-story moments that the deck OMITS or underserves and that would strengthen a "why suffering / vindication of God's character" narrative for a non-Christian audience.
${TOOLS}
Return the structured gap report — real, significant omissions only (not nitpicks), ranked by importance, each with where SR covers it and where it would slot into this deck.`,
    {
      label: 'gap-audit',
      phase: 'Gap-Audit',
      schema: GAP_SCHEMA,
      model: 'opus',
      agentType: 'general-purpose',
    },
  );
  log(`Gap audit: ${gaps.missing?.length ?? 0} missing moments flagged.`);
}

// Persist the results to disk so they survive regardless of how the caller consumes them.
const outPath = `${REPO}/packages/cli/outputs/decks/what-is-truth/day3-narrative-notes.${RUN_TAG}.json`;
await agent(
  `Write this EXACT JSON to ${outPath} (Write tool), then reply "saved". JSON:\n${JSON.stringify({ notes: writtenNotes, gaps }, null, 1)}`,
  { label: 'persist-result', phase: 'Gap-Audit', agentType: 'general-purpose' },
);

return {
  rewritten: writtenNotes.length,
  expected: slides.length,
  resultPath: outPath,
  gaps: gaps.missing ?? [],
  gapNotes: gaps.notes ?? '',
};
