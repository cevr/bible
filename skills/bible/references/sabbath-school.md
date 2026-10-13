# Sabbath School — Guided Weekly Session

## When to use

User asks for a Sabbath School outline for a specific week, or "this week's
Sabbath School", or "process Q2 W5 2026". Output is a guided teaching session: one
present-truth theme for the week, reached by a fixed sequence of movements.
The official lesson PDF + EGW Notes PDF supply the subject and readings.

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

## Output shape — a guided session, not a day-by-day survey

The teacher walks the class down one road. The week has **one overarching
theme**, phrased as present truth — righteousness by faith, the third
angel's message "in verity" — and the session is a fixed sequence of
**movements** that leads the class to it, then to a decision. The
quarterly's days are raw material, not the structure: each movement says
which days it draws on, and a day that doesn't serve the theme is left out.

**Finding the theme.** Read the lesson and EGW Notes PDFs, then ask: where
does this week's subject meet Christ our righteousness? The theme is the
answer, in one sentence a class member can repeat. Everything in the
session serves it; a good point that doesn't is cut.

**Guided, not open-ended.** Every question the teacher asks has a
prepared answer, read from the text just on the table. The teacher never
asks "what do you think?" without knowing where the answer goes. The class
reads the verses aloud; the teacher says the point, asks, confirms, and
moves on.

The voice and line grammar are the universal teaching format —
`references/teachings.md` — and the interpretive method is `SKILL.md`'s
("Hermeneutic & Sources"): **Miller's 14 Rules** and the **EGW +
SDA-pioneer corpus — historic pioneer Adventism, not modern Adventism**.
Where the quarterly's reading and the pioneer reading diverge, teach the
pioneer position from Scripture, charitably, with the verses on the table.

Gather before writing (Phase 1 of `references/teachings.md`): pull every
verse via `bible verse`, and hunt EGW + pioneer witnesses for each movement
via `bible egw search`/`lookup` — the 1888 periodicals (1893 Bulletin,
Present Truth, Signs, Review) as well as the books.

```markdown
# Sabbath School — Q[QUARTER] W[WEEK] ([YEAR])

## [The week's theme, as a title]

_Quarterly: [lesson title] · [dates] · Read: [the lesson's readings]_

**Memory Verse:** — _Book X:Y._ "[verse text]"

**Theme: [ONE bold sentence — the present truth the class leaves with.]**

## The road

1. [Movement phrase] — [anchor ref] _(quarterly: Sun, Mon)_
2. [Movement phrase] — [anchor ref] _(quarterly: Tue)_
3. [Movement phrase] — [anchor ref] _(quarterly: Wed, Thu)_
4. [Movement phrase] — [anchor ref] _(quarterly: Fri)_
5. Decision

---

## Open

- **Say:** [the question the whole session answers — one or two lines]
- _Ref._ "the memory verse or the week's key text" — gloss
- [RQ] [an opening question with one right answer in that text]
  → [the answer, from the text]

---

## 1. [Movement phrase] — [Anchor Ref]

- **Say:** [the movement's point, in one or two lines, as the teacher says it]
- _Ref._ "verse, read aloud" — gloss
- _Ref._ "verse" — gloss
- [RQ] [question with a prepared answer]
  → [the answer, quoting or citing the verse just read]
- [RQ] [follow-up that moves the class one step toward the theme]
  → [answer]

[WB]: [the board move, when the point has a shape]

[SOP REFCODE] "punchline ≤30 words" — why it lands here

- **Bridge:** [one line that hands the class to the next movement]

---

## 2. ... (3–5 movements, same shape)

---

## Decision

- **Say:** [the theme pressed home — what God offers, what He asks]
- _Ref._ "closing scripture" — gloss
- [RQ] [the decision question, answered by faith, not by effort]
  → [the answer]

[SOP or PIONEER REFCODE] "the closing witness"

---

## If asked

- [Q] [a predictable objection]?
  → [refs + one-line answer]
```

Rules of the shape:

- **3–5 movements**, each one screen. Each has a **Say**, the verses the
  class reads, one or two `[RQ]` questions with `→` answers, at most one
  witness, and a **Bridge** — except the last movement, which bridges to
  the Decision.
- **One witness per movement**, the strongest the corpus has: a pioneer of
  the 1888 message where one carries the point, otherwise SOP. Witness lines
  follow `references/teachings.md` (refcode first, ≤30 words, one
  contiguous clause).
- **Every `[RQ]` has its `→` answer**, and the answer is in a verse already
  read. No open discussion prompts.
- **The road is the MAP**: one line per movement, with the quarterly days
  it covers in italics, so the teacher can see what the class studied at
  home.
- **If asked** holds the two or three objections the week's subject
  predictably raises, each a `[Q]` with a one-line `→` answer. It replaces
  the `[Q]` index.
- No time guides, no day-by-day sections, no prose paragraphs.

## Frontmatter

```yaml
---
created_at: '2026-05-08T14:00:00Z'
year: 2026
quarter: 2
week: 5
title: '[Lesson title]'
theme: '[The week's theme, as a title]'
topic: righteousness-by-faith
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
bible check outputs/sabbath-school/2026-Q2-W5.md     # must report 0 problems
bible export -f outputs/sabbath-school/2026-Q2-W5.md --folder "sabbath school"   # the existing Notes folder; never create another
```

## Updates

```bash
# edit file in place, then re-export: it re-checks and updates the linked note
bible export -f outputs/sabbath-school/2026-Q2-W5.md
```

## Anti-patterns

- **Don't generate without fetching the PDFs first** — the lesson + EGW
  Notes PDFs are where the week's subject and readings come from.
- **Don't follow the quarterly day by day** — find the theme, then build
  the road to it. A day that doesn't serve the theme is left out.
- **Don't ask a question you haven't answered** — every `[RQ]` carries its
  `→` answer from a verse on the table.
- **Don't stack witnesses** — one per movement, the strongest.
- **Don't write prose paragraphs** — Say lines and bullets only.
- **Don't paraphrase EGW from the EGW Notes PDF** — quote with the refcode.
- **Don't skip the memory verse** — it anchors the Open.
- **Don't fabricate quarter/week numbers** — calculate from today's date or
  ask the user.
