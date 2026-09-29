# Sweep brief

Fill the slots into `<scratchpad>/film-pass<N>/sweep-brief.md`. Each area agent gets a short prompt: read the brief, sweep `<area>` (`<directories>`, `<extra reading>`), write the report to `<scratchpad>/film-pass<N>/<area>.md`, reply once with a summary under 300 words, finish in one run with no timers, monitors or sub-agents. The **SAFETY** block goes in verbatim; the same block is in [`apply.md`](apply.md), so edit both together.

```
# Film pass-<N> sweep brief (read-only)

Repo: /Users/cvr/Developer/personal/bible-tools, branch main, HEAD <hash>. Edit, commit and create nothing in the repo; write only your report. Start no server except where your area says so; render nothing except stills your area names; call no paid API (TTS, music, effects).

Goal: a film framework with good guardrails and deep, small abstractions: fewer concepts, less code, faster frames, a better lab, Effect-native tooling, every valuable feature kept. Read first: apps/animations/README.md, .claude/skills/film/SKILL.md, .claude/skills/film-architecture-loop/north-stars.md, <ledger path> (whole: decisions, rejected rows, every pass), .claude/skills/film-architecture-loop/rejected.md. A done or rejected item returns only with a new receipt. Prior art: .claude/skills/film-architecture-loop/prior-art.md; repos at `okra repo path <slug>`; pmndrs math is installed at node_modules/.bun/math@0.1.0/node_modules/math (README, API.md, skills/math/SKILL.md).

North stars: pure frames, narration is the clock, declared once, Effect-native tooling, cheap iteration, checked not eyeballed, explicit over implicit, performant, lab-first. Each candidate names the north star it serves; one that trades one north star for another is an owner question, not a change.

Pass <N-1> changed <`git diff --stat <prev base>..HEAD | tail -1`>. Review these changes hardest for regressions: <per area, the mechanisms each batch added>.

In flight, do not report: <batch: items>. Open review items (the review batch owns them): <ids>.

Performance baseline (from the ledger): <table>. A performance claim needs a measurement from a scratch script under <scratchpad> or a render's log; without one it is a question.

Vocabulary, used exactly: module, interface, depth, seam, adapter, leverage, locality, deletion test. A candidate is: a shallow module, a pass-through, one concept with two owners, a time written in two places, a hand-timed second where a mark belongs, a constant a lab note cannot reach, a one-adapter seam with no guard, a single-caller export, dead code, a guard gap (a defect class no film check, lint rule or type can see), a comment that tells history, a Promise or throw where an Effect belongs outside the draw path, an unscoped resource, an untyped boundary, per-point or per-frame allocation in the draw path, a helper pmndrs math already has, or a public export no test uses as its subject.

Find, with receipts:
- Bugs: an input or state that gives a wrong frame, time, sound or file, with file:line and the scenario, verified end to end.
- Reductions: code the deletion test shows is a pass-through or has no consumer. Caller greps cover apps/animations/ and packages/film/.
- Structural: a concept that belongs in the kit, core or tools and not where it is; an idiom bypassed.
- Guardrails: a defect class that happened (git log, the ledger, review items) and no check would catch again, with where the check belongs (a `film/` lint rule, a type, a film check detector).

Classes: P1 wrong output a viewer or the owner hits; P2 wrong at an edge, a real reduction (more than 100 lines or one concept), a measured saving over 10%; P3 polish. Under about 5 lines of value: one line in a "not worth a pass" list. An area with only polish says "only polish" with the receipts checked; that is the wanted result of a late pass.

Report: a table (id, class, title, file:line, evidence, north star, proposed change, lines removed, risk, changes a committed asset or its hash yes/no, how the live check shows it), then the items checked and found sound.

SAFETY (mandatory; in a sibling repo a heredoc of probe text once ran `rm -rf ~`):
- Create every file with the Write tool, never through a shell heredoc.
- A destructive command string (rm, git reset, git clean, git push -f, find -delete, kill and similar) never appears in a shell command line, heredoc, echo, python3 -c or bun -e. Deletes use `trash`.
- Probe strings target only harmless paths such as /nonexistent/film-probe-x.
- Never read or print credentials (the ElevenLabs key, tokens). Never log private reading or note content.
```
