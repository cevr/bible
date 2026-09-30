# Apply prompt

One agent per batch, in the batch's own worktree. Fill the slots. The **work rules** block goes in verbatim; its **SAFETY** lines are also in [`sweep.md`](sweep.md), so edit both together.

```
Film pass-<N> apply batch `p<N>-<batch>`. Worktree <worktree path> (branch p<N>-<batch>, base main <hash>). Work only there; the repo root stays untouched. Read CLAUDE.md, apps/animations/README.md, .claude/skills/film/SKILL.md and .claude/skills/film-architecture-loop/north-stars.md first. Apply <item ids> from <report paths> and the ledger <ledger path>; re-verify each receipt in the source first, line numbers move. Reject an item that does not hold, and say why.

<Decisions the orchestrator already made, with their principle.>
<Files other batches own: report a fix there as a decision; leave the file unedited.>

Commit plan: <one numbered item per commit with its subject. Order: guardrail first (the check that goes red on the defect), then cleanup the compiler adjudicates, then each behavior change alone with its test.>

Work rules:
- Bugs are red first: the test fails on the unfixed code, quoted. A new guardrail is red first too: it fires on the defect before the fix.
- Reductions use the deletion test: delete, and let typecheck and tests name the consumers. Caller greps cover apps/animations/ and packages/film/.
- Pixels: a change is reviewed by its diff; the code says what a frame draws. No before/after `cmp` of stills and no test that pins a past render's pixels or levels. A new scene, look or score, or a change that moves pixels on purpose, renders stills or short clips at its marks (`bun run render <film> --stills <t,…> --tag p<N>`, times from `bun run cues <film>`) for the owner to review; name them in the report.
- Timing: a change that claims no timing change diffs `bun run cues <film>` before and after.
- Performance: a speed claim has a measured before/after (median of several runs, same machine) with `uptime`; at a load average over 4 a time claims nothing, so count work per frame instead. No cache that carries state between frames.
- Draw path (packages/film/src/canvas, the kit and scenes): plain synchronous code in the pmndrs math style (out-params, no per-point allocation); use `math` where it has the helper. Tooling: Effect, Scope, Schema, typed errors.
- A lint guardrail is a rule in the repo's `film` oxlint plugin (`packages/film/lint/`), written with the builder from `oxlint-plugin-effect/rule-bindings` (examples: `node_modules/oxlint-plugin-effect/dist/rules/`), scoped with an `overrides` entry in `.oxlintrc.json`, with a test that is red on a fixture. A rule true of any Effect code is reported for the orchestrator as an upstream effect-oxlint candidate instead.
- No paid API calls (narrate, score, effects). Committed takes and score keep their hashes.
- Complexity caps stay: split into named operations, never raise a cap or add a disable comment.
- Comments describe today's behavior. One concern per file; new code goes into the concern's existing module.
- Update apps/animations/README.md and .claude/skills/film/SKILL.md in the same commit when the API or workflow changes.
- Decide by the principles in ~/Developer/personal/dotfiles/principles/ and write "decided by <principle>" in your report; the batch runs without check-ins.
- Gate: `bun run typecheck`, `bunx oxlint <paths>` and the focused `bun test` while working; before each commit `bun run gate > <scratchpad>/film-pass<N>/<batch>-gate.log 2>&1; echo "GATE EXIT $?" >> <log>`, then read `GATE EXIT` and turbo's totals. The pre-commit hook only lints and formats the staged files and runs the repo guards: a commit that passed it passed no gate. A test that fails only under load is re-run once; if it passes, say so; if it fails twice, it is yours. Renders, the lab and commits need dangerouslyDisableSandbox: true.
- Commits: Conventional Commits, one logical unit each, staged by exact path. Deletes use `trash`. No push, no worktree creation or removal, no edits under apps/animations/plans/.
- Before the report: merge main into the branch, resolve there, run `bun run gate` into a log and read `GATE EXIT`.
- Finish in one run: no servers, timers or monitors left behind. An item that does not fit its description: stop and report.

SAFETY (mandatory; in a sibling repo a heredoc of probe text once ran `rm -rf ~`):
- Create every file with the Write tool, never through a shell heredoc.
- A destructive command string (rm, git reset, git clean, git push -f, find -delete, kill and similar) never appears in a shell command line, heredoc, echo, python3 -c or bun -e. Deletes use `trash`.
- Probe strings target only harmless paths such as /nonexistent/film-probe-x.
- Never read or print credentials (the ElevenLabs key, tokens). Never log private reading or note content.

Report (final message): commits (hash + subject), `git diff --stat <base>..HEAD | tail -1`, per-item result with file:line receipts, the timing and performance comparisons, the owner's stills or clips if any, the last `GATE EXIT`, decisions for the orchestrator, upstream effect-oxlint candidates, and what the live check should drive (stills at which times, which lab controls).
```
