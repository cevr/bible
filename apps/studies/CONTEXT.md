# Studies

The Astro site at studies.cvr.im that publishes Bible-study reference material and
interactive study guides for Adventist pioneer books.

## Language

**Series**:
A published study built from a single source document. Bohr-vs-Miller's-Rules is a
Series; a pioneer book's study guide is a Series.

**Chapter**:
The unit one study session covers — one chapter of a pioneer book, with its own
source text, questions, and voice prompt. A book's guide is a sequence of Chapters.
_Avoid_: Section, lesson, unit.

**Study Guide**:
The interactive layer over a pioneer book's Chapters: a multiple-choice Quiz plus a
freeform Voice Reflection that the Grader scores against the Chapter's Source Text.
_Avoid_: Quiz (the quiz is only one half), questionnaire.

**Quiz**:
The multiple-choice half of a Study Guide. Questions, answers, and explanations are
all hand-authored and ship to the browser, so the Quiz is graded instantly
client-side — no server call. Independent of the Voice Reflection on the same page.
_Avoid_: Test, MC.

**Public / Private tier**:
A Chapter's content splits in two. The Public tier ships to the browser (Quiz
questions+answers+explanations, the voice prompt, metadata). The Private tier is
read only by the grading endpoint and never serialized into a page (Source Text,
Key Points). The split is what makes the Voice Reflection a real recall assessment.
Layout: Public lives under `content/study-guides/<series>/` and is registered as
Astro content collections; Private lives under `private/<series>/` (a sibling to
`content/`, NOT a collection) and is read server-side via `src/lib/study-source.ts`.
Schemas: `scripts/study-guide-schema.ts`.

**Attempt**:
One learner's pass at a Chapter's Study Guide — their Quiz answers and/or a Voice
Reflection Grade — persisted in the browser's localStorage (per-device, no account,
no server DB).
_Avoid_: Session (overloaded), submission, result.

**Source Text**:
The verbatim chapter prose from the pioneer book that questions are drawn from and
that a voice transcript is graded against. The ground truth. For the DAR pilot it is
exported per DAR book chapter from the EGW FTS index (book code `DAR`, 3555
paragraphs, refcode `DAR <page>.<para>`) via the existing `bible egw` tooling.
_Avoid_: Original, raw text, content.

**Pilot — DAR**:
The first Series is Uriah Smith's _Daniel and the Revelation_. A Chapter is one of
DAR's own book chapters (NOT the pre-existing 21-study structure, and NOT Bible
chapters). The topic-mined `reference/uriah-smith/study-NN.md` excerpts are an
authoring head-start only, not the Source Text and not the chapter spine.

**Voice Reflection**:
The learner's freeform spoken response about a Chapter, captured as a transcript and
graded by the LLM into right / partially-right / wrong claims with explanations.
_Avoid_: Recording, answer, essay.

**Grade**:
The LLM's assessment of a Voice Reflection. Two parts: (1) coverage of the Chapter's
authored Key Points — each covered / partial / missed; and (2) verdicts on the Free
Claims the learner volunteered — each correct / partial / wrong. Each verdict carries
an explanation, and the Grade rolls up to an overall score.
_Avoid_: Score (score is one rolled-up field of a Grade), evaluation, mark.

**Key Point**:
An authored, must-cover idea from a Chapter — the recall rubric. Grading checks
whether the Voice Reflection covered each Key Point. Hand-authored per Chapter
alongside the questions.
_Avoid_: Rubric item, fact, takeaway.

**Free Claim**:
An assertion the learner made in their Voice Reflection that is not one of the
authored Key Points. The Grader judges each against the Source Text as a correct
elaboration or an error.
_Avoid_: Extra claim, statement.

**Grader**:
The server-side Effect service that runs the LLM grading of a Voice Reflection.
_Avoid_: Evaluator, judge.

**Transcriber**:
The server-side Effect service (a port) that turns captured audio into a transcript.
Concrete implementation is a swappable layer — a hosted STT API now, possibly a
self-hosted model later — so the Grader never depends on a specific provider.
_Avoid_: STT, speech engine, recognizer.
