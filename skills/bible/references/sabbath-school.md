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

There is no formal system prompt for Sabbath School (the original
`PROMPT_REGISTRY` had no entry). Build the outline using the same
**teacher-mode whiteboard** principles as `references/studies.md`, scoped
to the week's lesson — including its interpretive method: **Miller's 14 Rules
of Interpretation** and the **EGW + SDA-pioneer (William Miller foremost)
corpus** (the "Hermeneutic & Sources" section of `SKILL.md`). The lesson PDFs
set the week's frame; the pioneer reading and Miller's rules govern how its
proof-texts are interpreted:

```markdown
# Sabbath School — Q[QUARTER] W[WEEK] ([YEAR])

## [Lesson Title]

**Memory Verse:** "[verse text]" (Book X:Y)

---

## Sabbath Afternoon — Introduction

- **Theme**: [1-2 line statement of the week's burden]
- "key verse text" (Book X:Y)
- [DYK🔎] historical / linguistic context

---

## Sunday — [Subtopic]

- **point** — brief
  - "inline verse" (Book X:Y)
  - supporting detail
- [→] transition

[Q] **anticipated objection / question**
→ concise answer with scripture

---

## Monday — [Subtopic]

(... same shape ...)

---

## Friday — Further Thought

- EGW citation from EGW Notes PDF
  - "EGW quote..." (BookCode page.para)
- [TANGENT] optional deep-dive

---

## Discussion Questions

1. ...
2. ...
3. ...

---

## Appeal

- call to action grounded in the week's central truth
- _closing scripture_
```

Markers (same as `references/studies.md`):

| Marker      | Use                            |
| ----------- | ------------------------------ |
| `[→]`       | Transition                     |
| `[TANGENT]` | Optional deep-dive             |
| `[DYK🔎]`   | Word study, historical context |
| `[Q]`       | Anticipated question + answer  |
| `[ILL]`     | Christ's parable method        |

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
- **Don't paraphrase EGW from the EGW Notes PDF** — quote with the refcode.
- **Don't drift from the lesson's daily structure** — Sabbath afternoon /
  Sun–Fri / Discussion Questions is the format SS teachers expect.
- **Don't skip the memory verse** — it anchors the week.
- **Don't treat the EGW Notes section as optional** — it's where the
  pioneer voice carries the week.
- **Don't fabricate quarter/week numbers** — calculate from today's date or
  ask the user.
