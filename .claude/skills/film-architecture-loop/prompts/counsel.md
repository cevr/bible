# Counsel prompt

One round per batch, then one fixup round by the apply agent. Use the `counsel-review` skill (never from inside a Workflow: the Codex leg is denied there), or a fresh read-only agent when the other model is not reachable. Write the prompt to `<scratchpad>/film-pass<N>/counsel-<batch>.md`.

```
Read-only review of `<base>..HEAD` in <worktree path> (the @bible/film framework: pure frames drawn on a canvas with Rive rigs posed in them, narration-timed, Effect tooling; apps/animations is its first user). Use `git log --oneline <base>..HEAD` and `git show <hash>`. Read .claude/skills/film-architecture-loop/north-stars.md and <ledger path>. Edit no tracked file; put any scratch test under apps/animations/src/zz-scratch-* and remove it with `trash`, so `git status` is clean when you finish. Call no paid API.

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

Answer OK or the defect per question, with severity and reproduced yes/no. No style nits. Head each defect `### F<n> <severity>: <what>`, and under it give two lines: `Guard class: lint | judged | skill | code | none` (what could catch this class of defect next time: a deterministic oxlint rule, a judged rule, a skill line, a check or test in code, or nothing, with why) and `Cheapest guard: <the guard, by file and rule or name>`. End with the list of files you read.
```

Fix each defect with a test that is red first, in one fix commit. A defect not fixed gets a written rejection in the ledger. A folded finding with a cheap guard (an oxlint rule or a unit test, else a skill line) is an entry of the lessons ledger, [`docs/lessons.md`](../../../../docs/lessons.md) (Kind `review`, Source `<unit>/<review file> F<n>`), whose Guard is that guard; a judged rule guards only when its corpus measures it at error, so a rule whose false findings run high is a skill line instead. A finding with no cheap guard is classed `none` and needs no entry. `bun run merge-audit --review <review file>` is an optional check: it fails on a finding no entry cites that is not classed `none`, or one that gives no guard class or no cheapest guard.
