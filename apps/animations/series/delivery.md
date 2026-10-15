# Delivery: audit

The owner's rule (2026-10-14): "id like to change my own manner of speakign to more closely resemble that", "no tracking, but as part of the scripts for all our planned series". It is the film skill's [voice-counsel.md](../../../.claude/skills/film/reference/voice-counsel.md), **In the scripts**, applied to the README's **Language**:

- one idea a sentence, joined by "and", "so" and "but", the stressed word last;
- the beauty in the picture, never the adjective; plain statements, no exclamations, no hedges;
- a few points, the refrain back in fresh words; a light line only where it makes the point;
- Scripture in the KJV, word for word; no Ellen White or pioneer named in speech; no chapter and verse spoken;
- the marks written in the line: `{*}` before the stressed word, `{/}` a breath, `{//}` a hold (0.6 s, or `{//1.5}` its seconds), as [elevenlabs-delivery.md](../../../.claude/skills/film/reference/elevenlabs-delivery.md) gives them;
- timed at 150–165 words a minute (CRAFT rule 9), the marks' breaths and holds counted.

Where the counsel and the owner's habit differ, the counsel wins: his habits are in [owner-voice.md](../../../.claude/skills/film/reference/owner-voice.md).

Audited 2026-10-15: the 15 draft scripts in `series/*/scripts/`. Every KJV line was printed again by `bible verse` that day. Every draft reads in the lab (`packages/film/src/core/draft.ts`), which refuses Markdown emphasis (`_if_`) and a pause written as a direction (`(0.6 s)`); seven drafts were refused before. Open one in the lab under **Series** to read it with its marks and hear the staging take.

Nothing formats a draft: oxfmt reads two `{*}` on one line as Markdown emphasis and rewrote them, so the scripts are in its ignore list and a mark stays as written.

## The draft scripts

| Script                                         | What changed                                                                                                                                                                                       | Why                                                                                             |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| theology 01 · Milk and Meat                    | "Funny, right?" and "Ouch" became "And that letter is in our Bible"; "lovely", "But here is the surprise" and "Watch what Hebrews does" went; the "which means" lines split.                       | Light lines that made no point, an adjective for beauty, and stacked clauses.                   |
| theology 02 · The Oracles of God               | "But wait" and "Here is the trouble with that" went; the guessing teacher became "we"; "lively" is glossed "living", and Timothy is named as Paul's young friend.                                  | Throat-clearing; the viewer on our side of the problem; terms a new viewer lacks.               |
| theology 03 · God Is Love                      | "Maybe you have met that God" became "Many of us have met that God. And part of us is still afraid"; God's words to Moses and Philip's ask are told, not quoted in modern words.                   | A hedge, the refrain brought back; a quotation is KJV or it is told.                            |
| theology 05 · The Word Made Flesh              | "But wait" and "exactly" went; "Isaiah fell down" became "cried out"; 1 Cor 8:6 runs unbroken to "Christ"; the storm's question is Mark's, which asks.                                             | Throat-clearing; the text has "Woe is me", no fall; no ellipsis in a quotation; no exclamation. |
| country 01 · Adam's Schoolroom                 | "You know what they chose" became "They took the one fruit God had held back"; "every family line" became "one family line"; the second "So where did learning begin?" went.                       | It assumed the viewer knew the story; Luke traces one line; one question a film.                |
| education 01 · What is school for?             | Cut from 198 to 158 words; the `_in knowledge_` emphasis became a mark; the two quoted questions are told.                                                                                         | One Question is 65 s at 155 wpm; Scripture stays under a fifth.                                 |
| education 17 · Did Jesus go to school?         | Cut from 178 to 153 words; the hook is "Look at this verse."; "the best-taught man who ever lived" and the list the B-roll shows went.                                                             | The time; a superlative; the picture says it.                                                   |
| education 19 · Daniel's education              | Seven near-whole verses became short runs, the rest told (34% quoted to 18%); the mother line is three sentences ending on "God"; "Notice something" went; "pulse" is explained.                   | A quotation a beat, a fifth of the words; one idea a sentence; a word a viewer lacks.           |
| education 44 · Compete for grades?             | Cut from 208 to 152 words; the disciples' ask is told; "Great means…" is two parallel lines ending on "rest" and "most"; "might be teaching" became "can teach".                                   | The time; the parallel run is the melody; a hedge.                                              |
| education 52 · Three ways to make a child obey | The story is framed openly as a picture; the first and third mothers' words are told; "lovely", "Here's the turn", "Maybe" and "The old book I'm drawing from" went.                               | Fiction only as a parable; no book's dialogue read aloud; an adjective, a signpost, a hedge.    |
| health 01 · The Lord That Healeth Thee         | The hook, counsel and list lines split, ending on "medicine", "law" and "live"; "Notice what He promises" went; each quotation runs unbroken; "three days out of Egypt" became "past the Red Sea". | One idea a sentence; throat-clearing; no ellipsis; Exodus 15:22 says so.                        |
| health 06 · The Breath He Gave                 | Each sentence ends on its sense word ("nose", "habit", "stale"); two lines cut; Genesis 2:7 quoted from "and breathed".                                                                            | The stressed word last; it ran 1:15, over the 65 s.                                             |
| health 20 · Rest a While                       | Only Jesus' words and "for so he giveth his beloved sleep" are quoted, the rest told (31% to 13%); "Here's what makes it hard" went.                                                               | A fifth of the words; throat-clearing.                                                          |
| health 33 · Ten Days in Babylon                | "Verse seventeen says" became "The same account says"; "the king's meat" became "the king's rich food"; the Daniel and Genesis quotations are shorter runs (29% to 18%).                           | No chapter and verse spoken; "meat" would be heard as flesh; a fifth of the words.              |
| health 50 · Figs for a King                    | One quotation a beat; Paul on Luke is told ("Paul's dear friend Luke was a doctor").                                                                                                               | A quotation a beat, a fifth of the words.                                                       |

In every health draft, the payoff's lead pause, written "(0.6 s)" in its line, is now the On screen cell's first words ("A 0.6 s pause before the line."): it is the cut's silence before the beat, not a gap inside it.

## The marks and the time

| Script       | Words (was)     | Stresses, breaths, holds | Spoken at 155 wpm (was) |
| ------------ | --------------- | ------------------------ | ----------------------- |
| theology 01  | 750 (741)       | 63, 75, 5.4 s            | 5:18 (4:47)             |
| theology 02  | 659 (652)       | 54, 57, 4.4 s            | 4:37 (4:12)             |
| theology 03  | 603 (582)       | 62, 51, 6.8 s            | 4:16 (3:45)             |
| theology 05  | 677 (667)       | 67, 48, 6.0 s            | 4:42 (4:18)             |
| country 01   | 603 (615)       | 57, 57, 5.8 s            | 4:16 (3:58)             |
| education 01 | 158 (198)       | 18, 6, 1.5 s             | 1:04 (1:17)             |
| education 17 | 153 (178)       | 19, 11, 1.5 s            | 1:04 (1:09)             |
| education 19 | 400 (about 491) | 36, 23, 2.6 s            | 2:44 (about 3:10)       |
| education 44 | 152 (208)       | 16, 6, 1.5 s             | 1:02 (1:21)             |
| education 52 | 396 (about 437) | 38, 28, 2.0 s            | 2:44 (about 2:49)       |
| health 01    | 380 (428)       | 42, 29, 2.7 s            | 2:38 (2:46)             |
| health 06    | 152 (193)       | 15, 5, 1.5 s             | 1:02 (1:15)             |
| health 20    | 150 (194)       | 18, 9, 1.5 s             | 1:02 (1:15)             |
| health 33    | 374 (418)       | 40, 26, 2.1 s            | 2:35 (2:42)             |
| health 50    | 149 (188)       | 19, 10, 1.5 s            | 1:02 (1:13)             |

The marks follow the counsel: a breath at the end of most sentences, a hold after a quotation that needs room, and the held beat before a landing's last word (3 s in a film, CRAFT rule 7; 1.5 to 2 s in a talk, whose cut is shorter). Each draft's Length line and beat timings are retimed to these. The talk plans' word ranges assumed about 190 words a minute; `education/series.md` and `health/series.md` now give them at 155 (about 140–160 for One Question, 330–410 for an Episode).

## Open for the owner

- **A talk's landing hold:** 1.5 to 2 s here; the films' rule is 3 s. Say if a talk should hold as long.
- **Reported speech:** where a voice in a story is not the KJV's (Moses' request, Philip's ask, a mother's plea), it is told, not quoted. One line stays in quotation marks: education 52's second mother, "You love Mommy, don't you? So you'll be good.", as the case the talk answers.
