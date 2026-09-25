---
name: film-architecture-loop
description: Run the film-framework reduction loop — sweep apps/animations and its framework against prior art and the north stars, apply, counsel, live-render, until a pass finds polish only.
disable-model-invocation: true
---

# Film architecture loop

A **pass** is: coverage audit → read-only sweeps → triage → apply in a rift → one counsel round → live render → ledger rows. Repeat passes until the close rule holds. The vocabulary comes from the `codebase-design` skill; invoke it once at the start. Read [`north-stars.md`](north-stars.md) before the first sweep: every candidate names the north star it serves. Invoke the `film` skill too: it holds the review loop the live render uses.

The ledger is `apps/animations/plans/architecture-loop-<date>.md`, the single source of truth for what is done and what is rejected. Every sweep and apply prompt names it. Decide by the principles in `~/Developer/personal/dotfiles/principles/` and write "decided by <principle>" in the ledger; the loop runs without owner check-ins, except for paid API runs (see [`rejected.md`](rejected.md)).

## Steps

1. **Open the ledger.** Copy the section layout of the newest `apps/animations/plans/architecture-loop-*.md`, or [`ledger-template.md`](ledger-template.md) when none exists. Record the HEAD hash and the baseline: `git ls-files ':(glob)apps/animations/**/*.ts' ':(glob)packages/film/**/*.ts' | xargs wc -l | tail -1`. Read [`rejected.md`](rejected.md). Done when the ledger file exists with a baseline.

2. **Coverage audit.** List every source directory with its file count:
   `git ls-files ':(glob)apps/animations/**/*.ts' ':(glob)packages/film/**/*.ts' | xargs -n1 dirname | sort | uniq -c`.
   Mark each directory that no earlier ledger names. Those go first. Done when every directory is marked swept-before or unswept.

3. **Prior art, first pass only.** Read [`prior-art.md`](prior-art.md). Survey only what it does not already answer; add each settled comparison to its list. Done when each new idea is a ledger row: adopt, or rejected with the north star it fails.

4. **Sweep.** Launch read-only agents from [`prompts/sweep.md`](prompts/sweep.md), one per area, in one message. Areas: engine (draw path), timeline and narration, sound, tooling scripts, player and preview, one film's scenes as the framework's first user. Done when every area has a report, including those with no findings.

5. **Triage.** Group findings into batches by the files they touch. Write the pass section of the ledger with a triage table. Done when every finding is in a batch or rejected with a receipt.

6. **Apply.** One rift per pass: `rift create --name film-pass<N> --copy-all .` from the repo root, then work inside it. Launch apply agents from [`prompts/apply.md`](prompts/apply.md). Agents sharing a rift run one after the other, because the pre-commit hook gates the whole tree. Done when the rift is clean and its last gate log ends `GATE EXIT 0`.

7. **Counsel.** One round per pass from [`prompts/counsel.md`](prompts/counsel.md), with the `counsel-review` skill or a fresh read-only agent. Fix each defect with a test that is red first, in one commit. Done when every defect has a commit or a written rejection.

8. **Live render.** Prove the film still looks and sounds the same, without paid calls: `bun run mix <film> --stems` and compare levels with the ledger baseline, then contact sheets of every scene the pass touched and stills at their marks. After a pass that changes the draw path or timeline, render the whole film and compare its frame sheet with the previous one. Done when the sheets match intent and every process you started is stopped.

9. **Ledger rows.** Every finding gets `done <hash>` or `rejected: <receipt>`. Add a rejection a later pass could re-propose to `rejected.md`. Update the `film` skill and `apps/animations/README.md` wherever the pass changed the workflow or the API. Done when both describe the code as it is.

10. **Merge.** From the repo root: `git fetch <rift path> HEAD:refs/heads/film-pass<N>`, `git merge --ff-only film-pass<N>` (bible-tools commits to main), `bun run gate`, delete the branch. Bundle the rift with `git bundle create <scratchpad>/film-pass<N>.bundle --all`, then `rift remove film-pass<N>`. Push only when asked.

## Close rule

Close when one pass holds all three: no unswept directory, the sweeps report polish only (under about 5 lines of value each), and the loop reader names no structural change. Then write the report and the final message. A pass that finds a check blind spot (a defect class `bun run check` or the lint rules cannot see) is never the last: close it, run the check, sweep what it reveals.
