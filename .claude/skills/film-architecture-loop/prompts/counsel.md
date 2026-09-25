# Counsel prompt

One round per pass. Use the `counsel-review` skill, or a fresh read-only agent when the other model is not reachable. Give it this prompt.

```
Read-only review of pass <N> in the rift `<rift path>`: `git log --oneline <base>..HEAD` and `git diff <base>..HEAD`. Edit no tracked file; put any scratch test under `apps/animations/src/zz-scratch-*` and remove it with `trash`, so `git status` is clean when you finish. Call no paid API.

Judge each commit against `.claude/skills/film-architecture-loop/north-stars.md` and the ledger `<ledger path>`. Look for real defects only:
- a frame that now depends on an earlier frame, the wall clock, or unseeded randomness;
- a motion or sound that moved in time where the ledger row says "no behavior change" (compare mark times from `bun run cues <film>` before and after);
- a committed asset (take, score, effect) whose hash changed, so it reads as stale or re-records;
- a scope, page, or child process that no longer closes on failure or interrupt;
- a boundary that now accepts malformed JSON or script data without a decode error;
- a type that got wider, so a wrong film now compiles;
- a test that passes for the wrong reason;
- a north star a commit quietly broke.

Per finding: file:line, a concrete failure (input → wrong output), severity, reproduced yes/no. No style nits. If nothing is real, say so and list what you checked.
```

Fix each defect with a test that is red first, in one fix commit. A defect you do not fix gets a written rejection in the ledger.
