export const meta = {
  name: 'what-is-truth-synthesis',
  description:
    'Synthesize Claude + Codex per-slide reviews into a per-deck report (agreements, disagreements, ranked findings)',
  phases: [
    { title: 'Synthesize', detail: "one agent per deck merges both reviewers' per-slide verdicts" },
    { title: 'Roll-up', detail: 'cross-deck executive summary' },
  ],
};

const DIR =
  '/Users/cvr/Developer/personal/bible-tools/packages/cli/outputs/decks/what-is-truth/review';

const DECKS = [
  { n: 1, name: 'Night 1 — Beyond Opinion', count: 78 },
  { n: 2, name: 'Night 2 — Just Another Book', count: 109 },
  { n: 3, name: 'Night 3 — Why Suffering', count: 88 },
];

phase('Synthesize');

const reports = await pipeline(
  DECKS,
  // stage 1: load both reviewers' JSON for this deck
  (d) =>
    agent(
      `Read these two files and return a JSON object {"claude": <contents of first>, "codex": <contents of second>}:\n` +
        `1. ${DIR}/claude-out/deck${d.n}.json\n` +
        `2. ${DIR}/codex-out/deck${d.n}.parsed.json\n` +
        `Return ONLY the merged JSON object, nothing else.`,
      {
        label: `load:d${d.n}`,
        phase: 'Synthesize',
        schema: { type: 'object', additionalProperties: true },
      },
    ).then((data) => ({ d, data })),
  // stage 2: synthesize into a markdown report
  ({ d, data }) => {
    const prompt = `You are the synthesis editor for an evangelistic-deck review. Two independent reviewers (Claude and Codex) each scored every slide of "${d.name}" (${d.count} slides) for ARGUMENT SOUNDNESS, COHERENCE, and EVANGELISTIC MERIT — NOT for theological debate.

Your job: merge their per-slide verdicts into ONE actionable markdown report. Rules:
- A problem flagged by BOTH reviewers = HIGH-CONFIDENCE finding (lead with these).
- A problem flagged by ONE reviewer = worth noting, label it (Claude-only / Codex-only).
- Where they DISAGREE on severity, say so and give your editorial call.
- Ignore vague/duplicate complaints; keep concrete, slide-cited issues.
- Stay in lens: "does the argument make sense / is it sound / does it land for skeptics" — never "is the theology true."

Output this exact markdown structure:

# ${d.name} — Review Synthesis

## Verdict
<2-3 sentences: overall how the deck fares — soundness, coherence, evangelistic merit. Name the deck's biggest strength and biggest risk.>

## High-confidence findings (both reviewers)
<numbered list. Each: **Slide N — <short title>**: the problem, why it matters for a skeptic, and the concrete fix. If none, say "None — the reviewers found no overlapping problems," which is itself a strong signal.>

## Single-reviewer flags worth a look
<bulleted, each tagged (Claude) or (Codex), slide-cited, one line each. Cap at the ~12 most substantive.>

## Disagreements
<where the two reviewers split on a slide's severity — your editorial call each.>

## Slide scorecard
<a compact markdown table: Slide | Claude soundness | Codex soundness | Claude merit | Codex merit | flagged? — ONLY include slides where at least one reviewer said weak/broken OR flagged an issue. Skip the all-clear slides.>

## Bottom line for the speaker
<3-5 bullets: the must-fix items before presenting, in priority order.>

Here is the data (two arrays of per-slide verdicts):
${JSON.stringify(data)}`;
    return agent(prompt, { label: `synth:d${d.n}`, phase: 'Synthesize' }).then((md) => ({ d, md }));
  },
  // stage 3: write the per-deck report
  ({ d, md }) =>
    agent(
      `Write this markdown verbatim to ${DIR}/synthesis/deck${d.n}-synthesis.md (overwrite), then reply "ok ${d.n}":\n\n${md}`,
      { label: `write:d${d.n}`, phase: 'Synthesize' },
    ).then(() => ({ d, md })),
);

phase('Roll-up');

const valid = reports.filter(Boolean);
const summary = await agent(
  `You are writing the executive summary across a 3-night evangelistic series review. Below are the three per-deck synthesis reports. Produce a tight cross-deck markdown:

# What is Truth? — Series Review: Executive Summary

## The series, in one read
<3-4 sentences: does the 3-night arc hold together as a sound, coherent, skeptic-credible case? Where is it strongest, where weakest?>

## Top must-fix items across all three nights
<single ranked list, max 8, each tagged [N1]/[N2]/[N3] + slide#, one line each, hardest-hitting first>

## Cross-night coherence
<does the criteria→wager→verdict thread actually pay off? any thread that's set up but not landed, or claimed but not delivered?>

## What's working (keep)
<3-5 bullets of genuine strengths the reviewers converged on>

Here are the three reports:\n\n` +
    valid.map((r) => `===== DECK ${r.d.n}: ${r.d.name} =====\n${r.md}`).join('\n\n'),
  { label: 'rollup', phase: 'Roll-up' },
);

await agent(
  `Write this markdown verbatim to ${DIR}/synthesis/EXECUTIVE-SUMMARY.md (overwrite), then reply "done":\n\n${summary}`,
  { label: 'write:summary', phase: 'Roll-up' },
);

return { decksSynthesized: valid.map((r) => r.d.n), summaryWritten: true };
