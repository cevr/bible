# Film architecture loop — <date>

## Baseline

- HEAD: `<hash>`
- Source lines (the count in SKILL.md step 1): `<n>`
- Look-book: `<path>`

## Performance

Measured per `.claude/skills/film-architecture-loop/performance.md`; medians of several runs on one machine, with `uptime`.

| Measure | Film / scene | Before | After | Load |
| ------- | ------------ | ------ | ----- | ---- |

## Coverage

| Directory | Files | Mark (swept-before / unswept) | Pass |
| --------- | ----- | ----------------------------- | ---- |

## Review

Every item from `.claude/skills/film-architecture-loop/review.md`'s sources. The loop closes with none open.

| ID  | Item | Source | Status (`done <hash>` + after-still / `rejected: <receipt>` / owner question) |
| --- | ---- | ------ | ----------------------------------------------------------------------------- |

## Lab

| Check (reach, write-back, motion, notes, speed, instruments) | Finding | Status |
| ------------------------------------------------------------ | ------- | ------ |

## Prior art

| Idea | Source (slug, path) | North star | Verdict (adopt / rejected: reason) |
| ---- | ------------------- | ---------- | ---------------------------------- |

## Pass <N>

Reports: `<scratchpad>/film-pass<N>/<area>.md`

| ID  | Candidate | North star | Files | Lines removed | Risk | Status (`done <hash>` / `rejected: <receipt>`) |
| --- | --------- | ---------- | ----- | ------------- | ---- | ---------------------------------------------- |

Guardrails added:

| Defect class | Check (`film/` lint rule / effect lint rule / type / film check / test / CI step) | Red on | Hash |
| ------------ | --------------------------------------------------------------------------------- | ------ | ---- |

Counsel defects:

| ID  | Defect | Red test | Status |
| --- | ------ | -------- | ------ |

CI: one `bun run ci <sha>` line per commit pushed to main; a red run is a finding with its run id.

Live check: `<check, cues diff, mix, lab drive, stills for the owner's review: what was run and the result>`

## Close

- Unswept directories: `<none>`
- Open review items: `<none>`
- Largest sweep finding: `<lines of value>`
- Performance: `<no measured saving left over its threshold, or the measure that has one>`
- Structural change named by the loop reader: `<none>`
