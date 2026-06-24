# What is Truth? — Dual-Agent Slide Review

A two-reviewer, per-slide audit of all three v2 decks for **argument soundness, coherence, and
evangelistic merit** (not theological debate). 275 slides total, each scored independently by two
models, then synthesized.

## Pipeline

1. **Extract** — each Keynote → per-slide markdown via AppleScript (`extracted/extract-deck.applescript`).
   On-slide text (what the audience sees) is kept separate from presenter notes (speaker-only).
2. **Review ×2** — every slide scored by two independent reviewers on the same rubric:
   - **Claude** — `claude-review.workflow.js` (21 section-batched agents, parallel).
   - **Codex** — `okra counsel --deep`, one pass per deck (`codex-prompts/`).
     Each returns per-slide `{soundness, merit, issues[], suggestion}`.
3. **Synthesize** — `synthesis.workflow.js` merges both reviewers per deck: both-flagged =
   high-confidence finding, single-flagged = noted, disagreements = editorial call.

## Read these

| File                                                        | What                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------- |
| `synthesis/EXECUTIVE-SUMMARY.md`                            | **Start here.** Cross-night verdict + top must-fix items. |
| `synthesis/deck1-synthesis.md`                              | Night 1 — Beyond Opinion (78 slides)                      |
| `synthesis/deck2-synthesis.md`                              | Night 2 — Just Another Book (109 slides)                  |
| `synthesis/deck3-synthesis.md`                              | Night 3 — Why Suffering (88 slides)                       |
| `deck{1,2,3}-slides.md`                                     | Raw per-slide extracts (the reviewed source)              |
| `claude-out/deck{n}.json` · `codex-out/deck{n}.parsed.json` | Each reviewer's raw per-slide verdicts                    |

## Lens (what reviewers judged)

Argument soundness · coherence across slides · evangelistic merit for a skeptical non-Christian
audience · factual/citation fact-check risk. Explicitly **not** "is the theology true."
