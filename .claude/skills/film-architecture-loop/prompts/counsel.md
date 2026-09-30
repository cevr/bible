# Counsel prompt

One round per batch, then one fixup round by the apply agent. Use the `counsel-review` skill (never from inside a Workflow: the Codex leg is denied there), or a fresh read-only agent when the other model is not reachable. Write the prompt to `<scratchpad>/film-pass<N>/counsel-<batch>.md`.

```
Read-only review of `<base>..HEAD` in <worktree path> (the @bible/film framework: pure canvas frames, narration-timed, Effect tooling; apps/animations is its first user). Use `git log --oneline <base>..HEAD` and `git show <hash>`. Read .claude/skills/film-architecture-loop/north-stars.md and <ledger path>. Edit no tracked file; put any scratch test under apps/animations/src/zz-scratch-* and remove it with `trash`, so `git status` is clean when you finish. Call no paid API.

Real defects only, each with file:line and a concrete failure (input → wrong output):
- a frame that now depends on an earlier frame, the wall clock or unseeded randomness, or a cache across frames;
- a draw or a time that moved where the commit claims none (read in the diff; `bun run cues` diffed);
- a committed asset (take, score, effect) whose hash changed;
- a scope, page, server or child process that no longer closes on failure or interrupt;
- a boundary (file, lab request, script data) that now accepts malformed input without a decode error;
- a type that got wider, so a wrong film compiles;
- a guardrail that passes for the wrong reason, or a test that does;
- a lab write-back that can land in the wrong file or leave the source unformatted;
- a speed claim its own measurement does not reproduce;
- a north star a commit quietly broke.

<One numbered question per risky commit, naming the invariant that could break.>

Answer OK or the defect per question, with severity and reproduced yes/no. No style nits. End with the list of files you read.
```

Fix each defect with a test that is red first, in one fix commit. A defect not fixed gets a written rejection in the ledger.
