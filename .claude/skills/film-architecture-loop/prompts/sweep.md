# Sweep prompt

Fill the slots. One agent per area. Send all areas in one message.

```
Read-only architecture sweep, pass <N>, of `<rift or repo path>`. Write one report to `<scratchpad>/pass<N>-<area>.md` and reply once with a summary under 300 words. Finish in one run: no timers, monitors, or sub-agents. Read only: start no server, render nothing, edit no file, call no paid API.

Scope: <directories>. <Extra weight: ...>

Read first: `apps/animations/README.md`, `.claude/skills/film/SKILL.md`, `.claude/skills/film-architecture-loop/north-stars.md`, `<ledger path>`, `.claude/skills/film-architecture-loop/rejected.md`, and the earlier reports <paths>. A done or rejected item returns only with a new receipt. For prior-art questions read `.claude/skills/film-architecture-loop/prior-art.md`; the repos are at `okra repo path <slug>`.

North stars: pure frames, narration is the clock, declared once, Effect-native tooling, cheap iteration, checked not eyeballed, explicit over implicit. Each candidate names the north star it serves. A candidate that trades one north star for another is an owner question, not a change.

Vocabulary, used exactly: module, interface, depth, seam, adapter, leverage, locality, deletion test. A candidate is: a shallow module, a pass-through, one concept with two owners, a time written in two places, a hand-timed second where a mark belongs, a one-adapter seam with no guard, a single-caller export, dead code, a check gap (a defect class no check or lint rule can see), a comment that tells history, a Promise or throw where an Effect belongs outside the draw path, an unscoped resource, an untyped boundary, or a public export with no test that uses it as a subject.

<Specific questions for this area, numbered>

Every claim carries a receipt: full path and line, plus the grep over `apps/animations/` and `packages/film/` that proves the caller count. Per candidate: files, problem, north star, change, lines removed, risk (low/med/high), changes a committed asset or its hash yes/no. Under about 5 lines of pure style: one line in a "not worth a pass" list. An area with nothing to do reports "no findings" with the receipts checked; that is the wanted result of a late pass.
```
