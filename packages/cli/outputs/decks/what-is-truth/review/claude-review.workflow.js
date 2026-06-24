export const meta = {
  name: 'what-is-truth-claude-review',
  description:
    'Claude-side per-slide review of all 3 What-is-Truth decks (argument soundness, coherence, evangelistic merit)',
  phases: [
    {
      title: 'Review',
      detail: 'one Claude agent per ~14-slide batch; agents read batch files by path',
    },
  ],
};

const DIR =
  '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/what-is-truth/review';

const RUBRIC = `You are an evangelism-content reviewer. Audience: SKEPTICAL, intelligent NON-CHRISTIANS at a 3-night series whose goal is to show the divine hand behind Scripture. Night 1 establishes 5 criteria for absolute truth + a "wager"; Night 2 tests prophecy (above-human origins); Night 3 answers "why suffering?" via the great-controversy arc.

YOUR LENS (judge ONLY these — do NOT debate theology or argue the skeptic's side):
- ARGUMENT SOUNDNESS: do the premises actually support the conclusion? Any logical gaps, non-sequiturs, equivocations, circular moves, or claims that overreach the evidence?
- COHERENCE: does each slide follow from the prior flow? Any contradictions across slides? Does the night's thread hold?
- EVANGELISTIC MERIT: for THIS audience, does it land? Honest, non-manipulative, likely to earn trust rather than trip a skeptic's defenses?
- FACTUAL/CITATION RISK: any on-slide claim a hostile fact-checker could break (dates, stats, manuscript counts, quotes)?

On-slide text is what the audience SEES. Presenter notes are speaker-only (not shown). Be specific and grounded — cite the slide's actual words. No vibes. Empty issues array = no problem found.`;

const SCHEMA = {
  type: 'object',
  properties: {
    reviews: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          slide: { type: 'number' },
          soundness: { type: 'string', enum: ['strong', 'adequate', 'weak', 'broken'] },
          merit: { type: 'string', enum: ['strong', 'adequate', 'weak'] },
          issues: { type: 'array', items: { type: 'string' } },
          suggestion: { type: 'string' },
        },
        required: ['slide', 'soundness', 'merit', 'issues', 'suggestion'],
        additionalProperties: false,
      },
    },
  },
  required: ['reviews'],
  additionalProperties: false,
};

// 21 batches — small metadata only; bulk slide text stays on disk, read by each agent.
const BATCHES = [
  { deck: 1, name: 'Night 1 — Beyond Opinion', first: 1, last: 14, file: 'batches/deck1-1-14.txt' },
  {
    deck: 1,
    name: 'Night 1 — Beyond Opinion',
    first: 15,
    last: 28,
    file: 'batches/deck1-15-28.txt',
  },
  {
    deck: 1,
    name: 'Night 1 — Beyond Opinion',
    first: 29,
    last: 42,
    file: 'batches/deck1-29-42.txt',
  },
  {
    deck: 1,
    name: 'Night 1 — Beyond Opinion',
    first: 43,
    last: 56,
    file: 'batches/deck1-43-56.txt',
  },
  {
    deck: 1,
    name: 'Night 1 — Beyond Opinion',
    first: 57,
    last: 70,
    file: 'batches/deck1-57-70.txt',
  },
  {
    deck: 1,
    name: 'Night 1 — Beyond Opinion',
    first: 71,
    last: 78,
    file: 'batches/deck1-71-78.txt',
  },
  {
    deck: 2,
    name: 'Night 2 — Just Another Book',
    first: 1,
    last: 14,
    file: 'batches/deck2-1-14.txt',
  },
  {
    deck: 2,
    name: 'Night 2 — Just Another Book',
    first: 15,
    last: 28,
    file: 'batches/deck2-15-28.txt',
  },
  {
    deck: 2,
    name: 'Night 2 — Just Another Book',
    first: 29,
    last: 42,
    file: 'batches/deck2-29-42.txt',
  },
  {
    deck: 2,
    name: 'Night 2 — Just Another Book',
    first: 43,
    last: 56,
    file: 'batches/deck2-43-56.txt',
  },
  {
    deck: 2,
    name: 'Night 2 — Just Another Book',
    first: 57,
    last: 70,
    file: 'batches/deck2-57-70.txt',
  },
  {
    deck: 2,
    name: 'Night 2 — Just Another Book',
    first: 71,
    last: 84,
    file: 'batches/deck2-71-84.txt',
  },
  {
    deck: 2,
    name: 'Night 2 — Just Another Book',
    first: 85,
    last: 98,
    file: 'batches/deck2-85-98.txt',
  },
  {
    deck: 2,
    name: 'Night 2 — Just Another Book',
    first: 99,
    last: 109,
    file: 'batches/deck2-99-109.txt',
  },
  { deck: 3, name: 'Night 3 — Why Suffering', first: 1, last: 14, file: 'batches/deck3-1-14.txt' },
  {
    deck: 3,
    name: 'Night 3 — Why Suffering',
    first: 15,
    last: 28,
    file: 'batches/deck3-15-28.txt',
  },
  {
    deck: 3,
    name: 'Night 3 — Why Suffering',
    first: 29,
    last: 42,
    file: 'batches/deck3-29-42.txt',
  },
  {
    deck: 3,
    name: 'Night 3 — Why Suffering',
    first: 43,
    last: 56,
    file: 'batches/deck3-43-56.txt',
  },
  {
    deck: 3,
    name: 'Night 3 — Why Suffering',
    first: 57,
    last: 70,
    file: 'batches/deck3-57-70.txt',
  },
  {
    deck: 3,
    name: 'Night 3 — Why Suffering',
    first: 71,
    last: 84,
    file: 'batches/deck3-71-84.txt',
  },
  {
    deck: 3,
    name: 'Night 3 — Why Suffering',
    first: 85,
    last: 88,
    file: 'batches/deck3-85-88.txt',
  },
];

phase('Review');
log(`Claude reviewing ${BATCHES.length} batches across 3 decks (agents read batch files by path)`);

const results = await parallel(
  BATCHES.map(
    (b) => () =>
      agent(
        `${RUBRIC}\n\nDECK: ${b.name}. Read the file ${DIR}/${b.file} — it contains the slides to review (and possibly a preceding context slide marked "context only"). Return one verdict object per slide in the "SLIDES TO REVIEW" range (${b.first}-${b.last}), in slide order.`,
        { label: `review:d${b.deck}:${b.first}-${b.last}`, phase: 'Review', schema: SCHEMA },
      ).then((r) => ({ deck: b.deck, reviews: r?.reviews ?? [] })),
  ),
);

// Merge per deck (small arrays of verdicts only).
const byDeck = { 1: [], 2: [], 3: [] };
for (const r of results.filter(Boolean)) byDeck[r.deck].push(...r.reviews);
for (const k of [1, 2, 3]) byDeck[k].sort((a, b) => a.slide - b.slide);

// Each writer agent gets ONE deck's verdicts as a JSON string (well under the boundary limit).
await parallel(
  [1, 2, 3].map(
    (k) => () =>
      agent(
        `Write this JSON verbatim to ${DIR}/claude-out/deck${k}.json (overwrite), then reply "written ${k}":\n${JSON.stringify({ deck: k, reviews: byDeck[k] })}`,
        { label: `write:deck${k}`, phase: 'Review' },
      ),
  ),
);

return {
  counts: { 1: byDeck[1].length, 2: byDeck[2].length, 3: byDeck[3].length },
  weakOrBroken: Object.fromEntries(
    [1, 2, 3].map((k) => [
      k,
      byDeck[k]
        .filter((r) => r.soundness === 'weak' || r.soundness === 'broken')
        .map((r) => r.slide),
    ]),
  ),
};
