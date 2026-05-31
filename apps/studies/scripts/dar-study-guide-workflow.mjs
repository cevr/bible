export const meta = {
  name: 'dar-study-guides',
  description: 'Author + verify a Study Guide (quiz + key points) for each DAR chapter',
  phases: [
    { title: 'Author', detail: 'one agent per chapter: write public guide + private key points' },
    { title: 'Verify', detail: 'adversarially check each guide against its source' },
    { title: 'Repair', detail: 'fix any chapter the verifier rejected' },
  ],
};

// The full work-list is embedded (the args channel stringifies values, so we don't
// rely on it for structured data). `args` is an OPTIONAL slug filter: a
// comma-separated string ("dan-1,dan-2") or an array of slugs. Omit to run all 34.
const ALL_WORK = [
  {
    slug: 'dan-1',
    order: 1,
    ref: 'DAR — Daniel ch. 1: Daniel in Captivity',
    title: 'Daniel in Captivity',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-1.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-1.json',
  },
  {
    slug: 'dan-2',
    order: 2,
    ref: 'DAR — Daniel ch. 2: The Great Image',
    title: 'The Great Image',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-2.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-2.json',
  },
  {
    slug: 'dan-3',
    order: 3,
    ref: 'DAR — Daniel ch. 3: The Fiery Ordeal',
    title: 'The Fiery Ordeal',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-3.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-3.json',
  },
  {
    slug: 'dan-4',
    order: 4,
    ref: 'DAR — Daniel ch. 4: Nebuchadnezzar’s Decree',
    title: 'Nebuchadnezzar’s Decree',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-4.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-4.json',
  },
  {
    slug: 'dan-5',
    order: 5,
    ref: 'DAR — Daniel ch. 5: Belshazzar’s Feast',
    title: 'Belshazzar’s Feast',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-5.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-5.json',
  },
  {
    slug: 'dan-6',
    order: 6,
    ref: 'DAR — Daniel ch. 6: Daniel in the Lions’ Den',
    title: 'Daniel in the Lions’ Den',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-6.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-6.json',
  },
  {
    slug: 'dan-7',
    order: 7,
    ref: 'DAR — Daniel ch. 7: The Four Beasts',
    title: 'The Four Beasts',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-7.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-7.json',
  },
  {
    slug: 'dan-8',
    order: 8,
    ref: 'DAR — Daniel ch. 8: Vision of the Ram, He-Goat and Little Horn',
    title: 'Vision of the Ram, He-Goat and Little Horn',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-8.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-8.json',
  },
  {
    slug: 'dan-9',
    order: 9,
    ref: 'DAR — Daniel ch. 9: The Seventy Weeks',
    title: 'The Seventy Weeks',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-9.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-9.json',
  },
  {
    slug: 'dan-10',
    order: 10,
    ref: 'DAR — Daniel ch. 10: Daniel’s Last Vision',
    title: 'Daniel’s Last Vision',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-10.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-10.json',
  },
  {
    slug: 'dan-11',
    order: 11,
    ref: 'DAR — Daniel ch. 11: A Literal Prophecy',
    title: 'A Literal Prophecy',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-11.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-11.json',
  },
  {
    slug: 'dan-12',
    order: 12,
    ref: 'DAR — Daniel ch. 12: Closing Scenes',
    title: 'Closing Scenes',
    section: 'daniel',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/dan-12.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/dan-12.json',
  },
  {
    slug: 'rev-1',
    order: 13,
    ref: 'DAR — Revelation ch. 1: The Opening Vision',
    title: 'The Opening Vision',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-1.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-1.json',
  },
  {
    slug: 'rev-2',
    order: 14,
    ref: 'DAR — Revelation ch. 2: The Seven Churches',
    title: 'The Seven Churches',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-2.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-2.json',
  },
  {
    slug: 'rev-3',
    order: 15,
    ref: 'DAR — Revelation ch. 3: The Seven Churches (continued)',
    title: 'The Seven Churches (continued)',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-3.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-3.json',
  },
  {
    slug: 'rev-4',
    order: 16,
    ref: 'DAR — Revelation ch. 4: A New Vision: The Heavenly Sanctuary',
    title: 'A New Vision: The Heavenly Sanctuary',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-4.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-4.json',
  },
  {
    slug: 'rev-5',
    order: 17,
    ref: 'DAR — Revelation ch. 5: The Heavenly Sanctuary (continued)',
    title: 'The Heavenly Sanctuary (continued)',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-5.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-5.json',
  },
  {
    slug: 'rev-6',
    order: 18,
    ref: 'DAR — Revelation ch. 6: The Seven Seals',
    title: 'The Seven Seals',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-6.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-6.json',
  },
  {
    slug: 'rev-7',
    order: 19,
    ref: 'DAR — Revelation ch. 7: The Sealing',
    title: 'The Sealing',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-7.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-7.json',
  },
  {
    slug: 'rev-8',
    order: 20,
    ref: 'DAR — Revelation ch. 8: The Seven Trumpets',
    title: 'The Seven Trumpets',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-8.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-8.json',
  },
  {
    slug: 'rev-9',
    order: 21,
    ref: 'DAR — Revelation ch. 9: The Seven Trumpets (continued)',
    title: 'The Seven Trumpets (continued)',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-9.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-9.json',
  },
  {
    slug: 'rev-10',
    order: 22,
    ref: 'DAR — Revelation ch. 10: The Proclamation of the Advent',
    title: 'The Proclamation of the Advent',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-10.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-10.json',
  },
  {
    slug: 'rev-11',
    order: 23,
    ref: 'DAR — Revelation ch. 11: The Two Witnesses',
    title: 'The Two Witnesses',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-11.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-11.json',
  },
  {
    slug: 'rev-12',
    order: 24,
    ref: 'DAR — Revelation ch. 12: The Gospel Church',
    title: 'The Gospel Church',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-12.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-12.json',
  },
  {
    slug: 'rev-13',
    order: 25,
    ref: 'DAR — Revelation ch. 13: Persecuting Powers Professedly Christian',
    title: 'Persecuting Powers Professedly Christian',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-13.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-13.json',
  },
  {
    slug: 'rev-14',
    order: 26,
    ref: 'DAR — Revelation ch. 14: The Three Messages',
    title: 'The Three Messages',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-14.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-14.json',
  },
  {
    slug: 'rev-15',
    order: 27,
    ref: 'DAR — Revelation ch. 15: The Seven Last Plagues',
    title: 'The Seven Last Plagues',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-15.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-15.json',
  },
  {
    slug: 'rev-16',
    order: 28,
    ref: 'DAR — Revelation ch. 16: The Plagues Poured Out',
    title: 'The Plagues Poured Out',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-16.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-16.json',
  },
  {
    slug: 'rev-17',
    order: 29,
    ref: 'DAR — Revelation ch. 17: Babylon, the Mother',
    title: 'Babylon, the Mother',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-17.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-17.json',
  },
  {
    slug: 'rev-18',
    order: 30,
    ref: 'DAR — Revelation ch. 18: Babylon, the Daughters',
    title: 'Babylon, the Daughters',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-18.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-18.json',
  },
  {
    slug: 'rev-19',
    order: 31,
    ref: 'DAR — Revelation ch. 19: The Triumph of the Saints',
    title: 'The Triumph of the Saints',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-19.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-19.json',
  },
  {
    slug: 'rev-20',
    order: 32,
    ref: 'DAR — Revelation ch. 20: The First and Second Resurrections',
    title: 'The First and Second Resurrections',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-20.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-20.json',
  },
  {
    slug: 'rev-21',
    order: 33,
    ref: 'DAR — Revelation ch. 21: The New Jerusalem',
    title: 'The New Jerusalem',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-21.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-21.json',
  },
  {
    slug: 'rev-22',
    order: 34,
    ref: 'DAR — Revelation ch. 22: The Tree and the River of Life',
    title: 'The Tree and the River of Life',
    section: 'revelation',
    sourcePath: '/Users/cvr/Developer/personal/bible-tools/apps/studies/private/dar/rev-22.json',
    publicPath:
      '/Users/cvr/Developer/personal/bible-tools/apps/studies/content/study-guides/dar/chapters/rev-22.json',
  },
];

function parseSlugFilter(a) {
  if (a == null || a === '') return null;
  if (Array.isArray(a)) return new Set(a);
  if (typeof a === 'string') {
    const trimmed = a.trim();
    // Accept a JSON array string or a comma-separated list.
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed))
          return new Set(parsed.map((x) => (typeof x === 'string' ? x : x.slug)));
      } catch {
        // fall through to comma-split
      }
    }
    return new Set(
      trimmed
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  return null;
}

const filter = parseSlugFilter(args);
const work = filter ? ALL_WORK.filter((w) => filter.has(w.slug)) : ALL_WORK;

if (work.length === 0) {
  throw new Error('No chapters selected. args filter matched nothing.');
}

log(
  `Authoring study guides for ${work.length} DAR chapter(s): ${work.map((w) => w.slug).join(', ')}.`,
);

// --- schemas for structured agent output -----------------------------------

const AUTHOR_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'questionCount', 'keyPointCount', 'wrotePublic', 'patchedPrivate'],
  properties: {
    slug: { type: 'string' },
    questionCount: { type: 'integer' },
    keyPointCount: { type: 'integer' },
    wrotePublic: { type: 'boolean' },
    patchedPrivate: { type: 'boolean' },
    notes: { type: 'string' },
  },
};

const VERDICT = {
  type: 'object',
  additionalProperties: false,
  required: ['slug', 'ok', 'issues'],
  properties: {
    slug: { type: 'string' },
    ok: { type: 'boolean' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'where', 'problem'],
        properties: {
          severity: { type: 'string', enum: ['blocker', 'minor'] },
          where: { type: 'string' },
          problem: { type: 'string' },
        },
      },
    },
  },
};

// --- prompt builders --------------------------------------------------------

const authorPrompt = (
  item,
) => `You are authoring an interactive Study Guide for ONE chapter of Uriah Smith's
"Daniel and the Revelation" (DAR), a 19th-century Adventist commentary.

Chapter: ${item.ref}  (slug: ${item.slug}, order: ${item.order})

STEP 1 — Read the verbatim chapter Source Text (the ground truth) from:
  ${item.sourcePath}
That JSON file has shape { slug, sourceText, keyPoints: [] }. Read sourceText.

STEP 2 — Write the PUBLIC guide to:
  ${item.publicPath}
It MUST be JSON matching this exact shape (zod StudyGuideChapter):
{
  "slug": "${item.slug}",
  "ref": ${JSON.stringify(item.ref)},
  "title": ${JSON.stringify(item.title)},
  "order": ${item.order},
  "voicePrompt": "<one or two sentences telling the learner what to talk about in a spoken reflection on this chapter>",
  "questions": [
    {
      "id": "q1",
      "stem": "<a multiple-choice question answerable from the Source Text>",
      "options": ["<opt0>", "<opt1>", "<opt2>", "<opt3>"],
      "correctIndex": <0-based index of the correct option>,
      "explanation": "<why the correct option is correct, grounded in the Source Text>"
    }
  ]
}
Authoring rules for questions:
- Write 5 to 8 questions. Use ids q1, q2, ... in order.
- EVERY question and its correct answer MUST be answerable strictly from the Source
  Text — never outside knowledge or other chapters. Quote/paraphrase the source.
- Exactly one correct option per question; correctIndex must point to it.
- Distractors must be plausible but clearly wrong per the Source Text (not joke
  options, not "all of the above").
- Test comprehension of the chapter's actual argument, not trivia.
- The voicePrompt should invite the learner to explain the chapter's main argument
  in their own words.

STEP 3 — Patch the PRIVATE source file ${item.sourcePath} to add Key Points: read
the file, set its "keyPoints" to an array of 4 to 7 items, each:
  { "id": "kp1", "label": "<short name of a must-cover idea>", "detail": "<fuller
    source-grounded statement the grader uses to judge coverage>" }
Preserve slug and sourceText EXACTLY (do not alter sourceText). Key Points are the
recall rubric: the most important ideas a learner should articulate. Use ids
kp1, kp2, ... Ground every Key Point in the Source Text.

Write both files with the Write tool (valid JSON, 2-space indent). Then return your
structured result. Do not write any other files.`;

const verifyPrompt = (
  item,
) => `Adversarially verify the Study Guide authored for DAR chapter ${item.ref}
(slug: ${item.slug}). Be skeptical; your job is to catch errors before publish.

Read all three:
- Source Text (ground truth): ${item.sourcePath}  (field "sourceText")
- Key Points (rubric):        same file, field "keyPoints"
- Public guide (quiz):        ${item.publicPath}

Check, against the SOURCE TEXT only:
1. Each question is answerable from the Source Text; the option at correctIndex is
   genuinely correct; correctIndex is within range (0..options.length-1).
2. No question has multiple correct options or zero correct options.
3. Distractors are plausible but actually wrong per the source (flag joke/duplicate
   options).
4. Explanations are accurate and grounded in the source (flag fabrications).
5. Key Points are faithful to the source, non-redundant, and cover the chapter's
   main ideas; ids are unique (kp1..). 4-7 of them.
6. The public file matches the required shape (slug/ref/title/order present;
   5-8 questions with ids q1..; voicePrompt present); sourceText was NOT altered.

Mark severity "blocker" for anything that would mislead a learner or break the
schema; "minor" for style/clarity. Set ok=true ONLY if there are no blockers.
Return the structured verdict. Do not modify any files.`;

const repairPrompt = (
  item,
  issues,
) => `The Study Guide for DAR chapter ${item.ref} (slug: ${item.slug}) failed
verification. Fix ONLY these issues, then leave the files correct.

Issues:
${issues.map((i) => `- [${i.severity}] ${i.where}: ${i.problem}`).join('\n')}

Files:
- Source Text (DO NOT alter sourceText): ${item.sourcePath}
- Public guide:                          ${item.publicPath}

Re-read the Source Text, fix the public guide ${item.publicPath} and/or the
keyPoints in ${item.sourcePath} so every issue is resolved and both files match
their required shapes (see the authored shape: StudyGuideChapter with 5-8 questions
q1.., correctIndex valid; keyPoints kp1.. 4-7 items). Preserve slug and sourceText
exactly. Use the Write tool. Then return your structured result.`;

// --- pipeline: author -> verify -> repair-if-needed, per chapter ------------

const results = await pipeline(
  work,
  (item) =>
    agent(authorPrompt(item), {
      label: `author:${item.slug}`,
      phase: 'Author',
      schema: AUTHOR_RESULT,
    }),
  (authored, item) =>
    agent(verifyPrompt(item), {
      label: `verify:${item.slug}`,
      phase: 'Verify',
      schema: VERDICT,
    }).then((verdict) => ({
      item,
      authored,
      verdict,
    })),
  async ({ item, authored, verdict }) => {
    const blockers = (verdict?.issues ?? []).filter((i) => i.severity === 'blocker');
    if (verdict?.ok && blockers.length === 0) {
      return { slug: item.slug, status: 'passed', questionCount: authored?.questionCount ?? 0 };
    }
    // One repair attempt on the blockers, then re-verify.
    log(`Repairing ${item.slug} (${blockers.length} blocker(s)).`);
    await agent(repairPrompt(item, blockers.length ? blockers : verdict.issues), {
      label: `repair:${item.slug}`,
      phase: 'Repair',
      schema: AUTHOR_RESULT,
    });
    const recheck = await agent(verifyPrompt(item), {
      label: `recheck:${item.slug}`,
      phase: 'Repair',
      schema: VERDICT,
    });
    const stillBlocked = (recheck?.issues ?? []).filter((i) => i.severity === 'blocker');
    return {
      slug: item.slug,
      status: recheck?.ok && stillBlocked.length === 0 ? 'repaired' : 'needs-attention',
      questionCount: authored?.questionCount ?? 0,
      remainingBlockers: stillBlocked,
    };
  },
);

const clean = results.filter(Boolean);
const passed = clean.filter((r) => r.status === 'passed').length;
const repaired = clean.filter((r) => r.status === 'repaired').length;
const attention = clean.filter((r) => r.status === 'needs-attention');

log(`Done: ${passed} passed, ${repaired} repaired, ${attention.length} need attention.`);

return {
  total: work.length,
  passed,
  repaired,
  needsAttention: attention.map((r) => ({ slug: r.slug, remainingBlockers: r.remainingBlockers })),
  chapters: clean,
};
