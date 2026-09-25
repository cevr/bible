# Apply prompt

Fill the slots. One agent per batch. Agents that share a rift run one after the other.

```
Apply pass <N>, batch <B>, in the rift `<rift path>`. Do all work there; never touch the warm source `<repo root>`.

Candidates (from `<scratchpad>/pass<N>-<area>.md`, ledger `<ledger path>`): <IDs with one line each>.

Rules:
- Read `.claude/skills/film-architecture-loop/north-stars.md` and `.claude/skills/film/SKILL.md` first. A change that breaks a north star stops: report it, do not work around it.
- Bun. Gate: `bun run gate > <scratchpad>/pass<N>-<B>-gate.log 2>&1; echo "GATE EXIT $?" >> <same log>` from the rift root.
- Format with `bunx oxfmt <files>` from the rift root.
- Call no paid API (TTS, music, effects). Prove sound changes with `bun run mix <film> --stems` and picture changes with `bun run render <film> --scene <id> --contact 1.5 --tag pass<N>` plus stills at the marks, read as images. Renders need `dangerouslyDisableSandbox: true`.
- A behavior change gets a test that is red first. A deletion proves itself: the gate stays green and no caller remains (show the grep).
- Update `apps/animations/README.md` and `.claude/skills/film/SKILL.md` in the same commit when the API or workflow changes.
- Commit each candidate on its own, Conventional Commits. The lefthook pre-commit runs the gate. Do not push.
- Stop and report when a candidate does not fit its description.

Reply with: per candidate, `done <hash>` or `skipped: <reason>`; lines removed; the last `GATE EXIT` line; the stills or sheets you checked.
```
