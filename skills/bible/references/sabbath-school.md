# Sabbath School — Weekly Lesson Outline

## When to use

User asks for a Sabbath School outline for a specific week, or "this week's
Sabbath School", or "process Q2 W5 2026". Output is a teacher's outline
derived from the official Adventist Beliefs Study Guide PDF + the EGW Notes
PDF for that week.

There is no `bible sabbath-school process` AI command anymore — the agent
fetches the PDFs and generates the outline directly.

## Quarter / week calculation

| Quarter | Months    | Weeks |
| ------- | --------- | ----- |
| Q1      | Jan – Mar | 1–13  |
| Q2      | Apr – Jun | 1–13  |
| Q3      | Jul – Sep | 1–13  |
| Q4      | Oct – Dec | 1–13  |

Each quarter starts on the first Saturday of its first month. To find the
current week: count Sabbaths from the quarter start.

If the user just says "this week" or "today", calculate from the current
date.

## Source material commands

```bash
# Fetch the Teachers PDF + EGW Notes PDF (cached locally)
bible sabbath-school fetch -y 2026 -q 2 -w 5 --json
```

JSON shape:

```json
{
  "weeks": [
    {
      "year": 2026,
      "quarter": 2,
      "week": 5,
      "lessonPdf": "/abs/path/2026-Q2-W5-lesson.pdf",
      "egwPdf": "/abs/path/2026-Q2-W5-egw.pdf",
      "lessonUrl": "https://absg.adventist.org/...",
      "egwUrl": "https://www.sabbath.school/..."
    }
  ]
}
```

Then **read both PDFs** with the `Read` tool to extract the week's lesson
content + EGW supporting passages.

```bash
# Pull related verses + EGW commentary as you build the outline
bible verse "<key verse from the lesson>" --json
bible egw lookup "<refcode cited by the lesson>" --json
```

## Output shape

The voice and marker family are the universal teaching format —
`references/teachings.md` — scoped to the week's lesson: scannable
telegraphic bullets, no prose, a bold thesis, `[SOP]`/`[PIONEER]` witness
lines, and the interpretive method of `SKILL.md` ("Hermeneutic & Sources"):
**Miller's 14 Rules** and the **EGW + SDA-pioneer corpus — historic pioneer
Adventism, not modern Adventism**. The lesson PDFs set the week's frame; the
pioneer reading governs how its proof-texts are interpreted. Where the
quarterly's reading and the pioneer reading diverge, teach the pioneer
position from Scripture (charitably, with the verses on the table).

Gather before writing (Phase 1 of `references/teachings.md`): pull the
week's verses via `bible verse`, and hunt EGW + pioneer witnesses for each
day's subtopic via `bible egw search`/`lookup` — beyond what the EGW Notes
PDF hands you.

```markdown
# Sabbath School — Q[QUARTER] W[WEEK] ([YEAR])

## [Lesson Title]

**Memory Verse:** — _Book X:Y._ "[verse text]"

**[Burden — ONE bold sentence: the week compressed.]**

## MAP

1. Sabbath — [phrase] — [anchor ref]
2. Sunday — [phrase] — [anchor ref]
   ... (one line per day)
8. Appeal

[Q] index: [objection]? →[day] · [objection]? →[day]

---

## 1. Sabbath Afternoon — [Anchor Ref]

> [Day burden — ≤2 lines.]

- _Ref._ "anchor verse quoted in full" — gloss
- chain: Ref (gloss) → Ref (gloss) → Ref (gloss)

[SOP REFCODE] "punchline ≤30 words" — why this quote

---

## 2. Sunday — [Subtopic] — [Anchor Ref]

(... same shape; [WB] board moves where a day has a shape;
[PIONEER Name, REFCODE] wherever a pioneer carries the day's point ...)

---

## 7. Friday — Further Thought — [Anchor Ref]

- EGW Notes PDF citations as [SOP REFCODE] lines
- [TANGENT] hop-chain: Ref (gloss) → Ref (gloss) → Ref (gloss)

---

## 8. Appeal

- the week's central truth pressed home — decision language
- _Ref._ "closing scripture"
```

Line grammar and marker set are `references/teachings.md`'s — ref-first
verse bullets with em-dash glosses, `[WB]`, `[SOP REFCODE]`,
`[PIONEER Name, REFCODE]`, `[Q]`/`[RQ]`, `[Aside]`, `[TANGENT]` hop-chains,
one-line `[→]`, contrasts as tables, one-screen sections, self-contained
days.

## Frontmatter

```yaml
---
created_at: '2026-05-08T14:00:00Z'
year: 2026
quarter: 2
week: 5
title: '[Lesson title]'
---
```

After export, `apple_note_id: "..."` is appended.

## Output location

```
outputs/sabbath-school/YYYY-QX-WY.md
```

Example: `2026-Q2-W5.md`.

## Export

```bash
bible export -f outputs/sabbath-school/2026-Q2-W5.md --folder sabbath-school
```

## Updates

```bash
# edit file in place
bible sync -f outputs/sabbath-school/2026-Q2-W5.md
```

## Anti-patterns

- **Don't generate without fetching the PDFs first** — the lesson + EGW
  Notes PDFs are the source of truth for the week's content.
- **Don't write prose paragraphs** — the thesis block is the only
  multi-sentence run; everything else is scannable bullets and markers.
- **Don't paraphrase EGW from the EGW Notes PDF** — quote with the refcode.
- **Don't drift from the lesson's daily structure** — Sabbath afternoon /
  Sun–Fri / Discussion Questions is the format SS teachers expect.
- **Don't skip the memory verse** — it anchors the week.
- **Don't treat the EGW Notes section as optional** — it's where the
  pioneer voice carries the week.
- **Don't fabricate quarter/week numbers** — calculate from today's date or
  ask the user.
