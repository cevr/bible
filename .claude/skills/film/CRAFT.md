# Craft

How a film carries its argument. Rules 1 to 10 come from measuring sixteen BibleProject films against the first cut of our first film, now `righteousness-by-faith-v1`; the numbers and the frame-by-frame evidence are in [reference/bibleproject-study.md](reference/bibleproject-study.md). They are ranked: the first ones changed the most. Rule 11, the tone, comes from ten more films measured for voice and colour, in [reference/bibleproject-tone-art.md](reference/bibleproject-tone-art.md).

Craft never outranks the frame ([frame/README.md](frame/README.md)). A paraphrase stays inside its quote's words, and a picture shows nothing the topic's MUST NOT SAY-OR-SHOW forbids.

`bun run cues <film>` prints each scene's `start`, `dur` and `speech` span. Rules 7 and 9 are checked from it.

## 1. Words off the picture

- **Allowed on screen:**
  - the title;
  - at most one word card per act: the word, its Hebrew or Greek, and a gloss of 2 to 4 words;
  - the opening question, and its answer;
  - a quotation of 10 words or fewer, and only when the words are an object in the world: written in dust, carved, stamped;
  - the sources, on the end card.
- **One text element at a time.** The title and the end card are the only exceptions.
- **Narration is never typeset.** The captions ship as the `.vtt` beside the MP4, so render the master with `--no-captions`.
- **`cite` feeds the end card and `sources.md`.** It is never an on-screen tag.
- **Check:** in a `--contact 6` sheet, text shows in about 8 tiles out of 58 or fewer, outside the title and end card.

## 2. Quote less, paraphrase more

- **At most one quotation per beat.** Quoted words make up 20% of the script or less; BibleProject's median is 13.5%, ours was 41%.
- **A quotation over 25 words is a set piece.** It gets one picture per clause, in the order spoken, or one shot held throughout.
- **Name the writer in speech.** Say "Waggoner saw that…", and paraphrase inside the quote's own words. Keep a line verbatim only where no paraphrase can carry it.
- **Never speak chapter and verse.** The end card lists the sources.
- **Check:** divide the words inside quotation marks in `script.ts` by all its words.

## 3. Two registers

- **Every beat is STORY or IDEA.** Start its `picture` with `STORY:` or `IDEA:`.
  - **STORY** is the Bible's own scene, taken literally: warm, with depth and faces, and cut like film.
  - **IDEA** is the argument: 1 to 4 flat paper figures and one gold prop on a plain page. The page follows the colour script (rule 11): parchment in a bright film, the night page for one IDEA stretch at most.
- **Switch only at a turn in the argument.** Use one of three moves: a white flash; a push-through, zooming through a panel into a scene; or a dip to black.
- **The landing merges the two.** The IDEA figure stands inside the STORY frame.
- **Check:** the look-book's register sequence lines up with the turns in the script.

## 4. One picture per abstraction, and motifs paid off

- **`picture` names one concrete image.** Take it first from the words spoken: rags, robe, loom, serpent, hand.
- **Motifs:** list the film's two to four motifs in a comment at the top of `script.ts`, each with the beat that introduces it and the beat that pays it off.
  - The opening image returns at the landing, changed: the crack in the ground comes back filled with water.
  - Fewer motifs, drawn bigger, doing the text's job.
- **Check:** every motif has its payoff beat.

## 5. Human scale

- **Faces:** every beat has a shot where a face fills a third of the frame's height or more.
- **Close-ups and reactions:** a quotation lands on its speaker's close-up, and a reaction follows an idea.
- **Hold and move:** hold a shot 5 to 10 s and move the picture inside it. Cut only to change place.
- **Check:** the look-book stills show a face at that scale in every scene row.

## 6. The viewer's question

- BibleProject gives the viewer a second voice that asks at every turn, in 2 to 15 words, and gets a wrap line of 12 words or fewer.
- **Give the question its own voice.** Cast the film in `voice.ts`, and hand the line over with `{@ask}` and back with `{@lead}`: "…and God calls him righteous. {@ask}Declared? But he's guilty. {@lead}Exactly. And that's the point." The question is the viewer's own words, not a setup line.
- Keep the second voice a companion who is curious, never a skeptic to be beaten. BibleProject's co-host thinks aloud beside the narrator.
- With one reader, the narrator asks the question in the viewer's words and answers it with the wrap line.
- **Check:** every register switch in the script comes with a question.

## 7. The shape in time

The shape as a share of the runtime:

| Part                     | Where it falls                             |
| ------------------------ | ------------------------------------------ |
| Title                    | 4–10%                                      |
| Backstory and history    | 10–48%, never inside the landing           |
| Deepest turn or callback | 55–65%                                     |
| Landing                  | starts at 70–84% and lasts 20–35 s         |
| Music alone              | 25–35 s after the landing                  |
| Coda                     | 10–20 s, with the end card and the sources |

- The landing ends on the thesis line, with a held pause of about 3 s before its last word.
- **Check:** each scene's `start` from `cues`, divided by the film's length.

## 8. Repetition as layout

- **A callback keeps the earlier scene's layout:** the same positions, scale and framing, with a new picture in them. Knobs stay literals, so the Lab can still write them.
- **Show the answer's shape once, early,** for example declared, clothed, changed. Pull back to it at each turn.
- **Check:** the callback's stills, beside the earlier scene's, show the same layout.

## 9. Pauses

- **Seams:** the gap between one scene's last word and the next scene's first word is 0.6 s or less. Scene `lead` and `tail` set it.
- **Long pauses:** a pause of 1 s or more goes only where the script means one: before the landing's last word, after a key quotation, or at a register switch.
- **Between sentences:** 0.2 to 0.5 s.
- **Check:** a seam is the next scene's `start` plus its speech start, minus this scene's `start` plus its speech end.

## 10. Sound

- **The bed:** 17 to 20 dB under the voice wherever narration runs, short gaps included.
- **Music alone:** the music rises only where no one speaks, to about 6 dB under the voice level. That means an optional open of 5 to 7 s, and the landing's 25 to 35 s.
- **The low end:** the register under 70 Hz swells about 15 dB on the problem lines and the climax, and thins under the answers.
- **Effects:** put them on the story's concrete nouns: serpents, the loom, coins, cloth, chains. Page and slide sounds go only at register switches.
- **Levels:** the voice sits near −17 dBFS at its 70th percentile, and the master near −18 LUFS.
- **Check:** `bun run mix <film>` logs `mix.levels`, each bus's mean and peak dBFS. `--stems` writes each bus the film's length, to measure a stretch or hear it alone.

## 11. Tone

BibleProject is informative, curious and hopeful. The weight sits on explanation, the problem comes in small doses, and the colours stay bright.

- **Explain most:** the word, the story and the pattern take 40–60% of the speech. That is where the curiosity lives.
- **Dose the problem:** 20% of the speech or less, in 2 to 4 doses of 5 to 40 s. Answer each within seconds, and give hope at least 1.5 times the problem's share.
- **Name sin in "we", as a mechanism:** "So we do what Adam and Eve did. We sew fig leaves." Then take the weight off with a light line: "How is that going?"
- **Say wonder out loud, once per act,** about the text: "Jones noticed something kind of amazing".
- **Turn to hope on a "But"** that names a surprise, then a gift: "But the story does not end there."
- **Keep the colour script bright:**
  - a mean luma of 140–150, with 5% of frames or fewer darker than 60;
  - one black moment, at the cross;
  - teal day for the open and the landing, peach to explain, sunset at the cross, dawn at the answer.
- **Check:** tag each sentence of the script P (problem), A (answer) or E (explanation), and sum the words of each. In the contact sheet, only the cross's tiles read dark.
