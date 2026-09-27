# Craft

How a film carries its argument. These rules come from measuring sixteen BibleProject films against our first film, `righteousness-by-faith`; the numbers and the frame-by-frame evidence are in [reference/bibleproject-study.md](reference/bibleproject-study.md). They are ranked: the first ones changed the most.

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
  - **IDEA** is the argument: the night page, 1 to 4 flat, glowing paper figures, and one gold prop.
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
- `voice.ts` takes one voice, so the narrator asks the question, in the viewer's own words ("Declared? But he's guilty."), and answers it with the wrap line.
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
