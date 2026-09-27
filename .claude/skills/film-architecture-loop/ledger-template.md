# Film architecture loop — <date>

## Baseline

- HEAD: `<hash>`
- Source lines (`packages/film/src`, `apps/animations/src`): `<n>`
- Film audio (`mix --stems`, mean dB): voice `<n>`, music under speech `<n>`, music between lines `<n>`
- Look-book: `<path>`

## Performance

Measured per `.claude/skills/film-architecture-loop/performance.md`; medians of several runs on one machine.

| Measure | Film / scene | Before | After | Budget |
| ------- | ------------ | ------ | ----- | ------ |

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

| Defect class | Check (effect-oxlint rule / type / film check / bench budget) | Red on | Hash |
| ------------ | ------------------------------------------------------------- | ------ | ---- |

Counsel defects:

| ID  | Defect | Red test | Status |
| --- | ------ | -------- | ------ |

Live check: `<stills cmp, cues diff, mix stems, lab drive, bench: what was compared and the result>`

## Close

- Unswept directories: `<none>`
- Open review items: `<none>`
- Largest sweep finding: `<lines of value>`
- Performance: `<every budget met, or the measure that misses>`
- Structural change named by the loop reader: `<none>`
