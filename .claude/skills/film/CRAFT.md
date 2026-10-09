# Craft

How a film carries its argument. Rules 1 to 10 come from measuring sixteen BibleProject films against the first cut of our first film; the numbers and the frame-by-frame evidence are in [reference/bibleproject-study.md](reference/bibleproject-study.md). They are ranked: the first ones changed the most. Rule 11, the tone, comes from ten more films measured for voice and colour, in [reference/bibleproject-tone-art.md](reference/bibleproject-tone-art.md). Rule 12, the look, and the numbers added to rules 5, 7, 9, 10 and 11 come from the director's vision, **[reference/director-vision.md](reference/director-vision.md)**: how a film looks, moves and sounds, with the reasons and the research behind each number. Read it before drawing a film's first scene or changing its look.

Craft never outranks the frame ([frame/README.md](frame/README.md)). A paraphrase stays inside its quote's words, and a picture shows nothing the topic's MUST NOT SAY-OR-SHOW forbids.

`bun run cues <film>` prints each scene's `start`, `dur` and `speech` span. Rules 7 and 9 are checked from it.

## 1. Words off the picture

- **Allowed on screen:**
  - the title;
  - at most one word card per act: the word, its Hebrew or Greek, and a gloss of 2 to 4 words;
  - the opening question, and its answer;
  - a quotation of 10 words or fewer, and only when the words are an object in the world: written in dust, carved, stamped;
  - the sources, in the credits that roll over the coda (rule 7).
- **One text element at a time.** The title and the credits are the only exceptions.
- **Narration is never typeset.** The captions ship as the `.vtt` beside the MP4, so render the master with `--no-captions`.
- **`cite` feeds the credits and `sources.md`.** It is never an on-screen tag. The film's `credits.ts` builds the roll from the beats' `cite`s: grouped by author, each work once with its places merged ("Steps to Christ, 17, 18, 47, 70"), no locator left alone on a line.
- **Check:** in a `--contact 6` sheet, text shows in about 8 tiles out of 58 or fewer, outside the title and the credits.

## 2. Quote less, paraphrase more

- **At most one quotation per beat.** Quoted words make up 20% of the script or less; BibleProject's median is 13.5%, ours was 41%.
- **A quotation over 25 words is a set piece.** It gets one picture per clause, in the order spoken, or one shot held throughout.
- **Quote only Scripture.** A film speaks to every Christian: its doctrine and its message are the frame's, but its authority is the Bible's. A quotation spoken or shown is KJV, verbatim (supplied-word brackets dropped). Ellen White and the pioneers are never quoted and never named in speech: say their thought in the narrator's own words, inside their words, as a plain claim ("Faith is not our Saviour. It earns nothing."), never "Ellen White said…". Their works are credited in the roll (`cite`), so the sources stay one look away. Name Bible writers freely ("Paul goes further", "The psalm says").
- **History without its names.** A scene from church history tells what happened, not who said it ("two young preachers took that question head on"), and no denomination's name stands in for the audience's.
- **Never speak chapter and verse.** The credits list the sources.
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
- **Hold and move:**
  - A take runs 5–15 s.
  - Nothing is still for more than 4 s while the voice speaks: a plane slides, the camera pushes, a motion pinned to a mark runs, or the film cuts. The film's drift is texture: it never clears this rule.
  - Each scene holds 40 % of its seconds or fewer.
  - STORY cuts 4–8 times a minute (angle, reverse, close-up). IDEA is one continuous travel over the page.
- **Check:** `bun run check` warns `HeldShare` (a scene held over 40 %, with its longest held run) and `FaceSmall` (no face at a third of the frame); the look-book stills show the face.

## 6. The viewer's question

- BibleProject asks the viewer's question at every turn, in 2 to 15 words, and answers it with a wrap line of 12 words or fewer.
- **One narrator asks it.** A film has one reader: the narrator asks the question in the viewer's own words, not a setup line, and answers it with the wrap line: "…and God calls him righteous. Declared? But he's guilty. Exactly. And that's the point."
- **Chapters:** the question that opens each act titles its YouTube chapter, in the viewer's words, 4–6 per film: the act's `chapter` in the film's `look` (`acts.ts`, re-exported by `film.ts`). `bun run chapters <film>` prints them.
- **Check:** every register switch in the script comes with a question.

## 7. The shape in time

The shape as a share of the runtime:

| Part                     | Where it falls                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Title                    | 4–10%                                                                                                     |
| Backstory and history    | 10–48%, never inside the landing                                                                          |
| Deepest turn or callback | 55–65%                                                                                                    |
| Landing                  | starts at 70–84% and lasts 20–35 s                                                                        |
| Music alone              | 25–35 s after the landing                                                                                 |
| Coda                     | credits and sources roll for 20–30 s over the final pull-back; the last 5–20 s stay clear for end screens |

- The landing ends on the thesis line, with a held pause of about 3 s before its last word.
- The coda is a scene that speaks nothing and does not breathe (`drawing({ drift: 0, … })`): the credits strip arrives with its first line and leaves with its last, never showing empty, and the camera settles before the clear end.
- **Check:** each scene's `start` from `cues`, divided by the film's length. `bun run check` warns `EndShort` under 20 s after the last word or a 5 s end card.

## 8. Repetition as layout

- **A callback keeps the earlier scene's layout:** the same positions, scale and framing, with a new picture in them. Knobs stay literals, so the Lab can still write them.
- **Show the answer's shape once, early,** for example declared, clothed, changed. Pull back to it at each turn.
- **Check:** the callback's stills, beside the earlier scene's, show the same layout.

## 9. Pauses

- **Seams:** the gap between one scene's last word and the next scene's first word is 0.6 s or less. Scene `lead` and `tail` set it.
- **Long pauses:** a pause of 1 s or more goes only where the script means one: before the landing's last word, after a key quotation, or at a register switch.
- **Between sentences:** 0.2 to 0.5 s.
- **Pace:** 150–165 words a minute over the spoken span. The owner records the voice, so the script leaves room: about 5–8 % fewer words than the timeline allows.
- **Check:** a seam is the next scene's `start` plus its speech start, minus this scene's `start` plus its speech end.

## 10. Sound

- **A score is not optional,** and no air is dead: no stretch over 1.5 s below −60 dBFS unless the script declares it.
- **Designed silences** go in three places only: after the key quotation, at the black moment, and the held beat before the landing's last word.
- **The bed:** 17 to 20 dB under the voice wherever narration runs, short gaps included.
- **Music alone:** the music rises only where no one speaks, to about 6 dB under the voice level. That means an optional open of 5 to 7 s, and the landing's 25 to 35 s.
- **The low end:** the register under 70 Hz swells about 15 dB on the problem lines and the climax, and thins under the answers.
- **Effects:** put them on the story's concrete nouns: serpents, the loom, coins, cloth, chains. Page and slide sounds go only at register switches.
- **Levels:** the voice sits near −17 dBFS at its 70th percentile, and the master near −18 LUFS.
- **Check:** `bun run check` fails `DeadAir` on undeclared silence; a designed one is a cue with `silence: true`. `bun run mix <film>` logs `mix.levels`, each bus's mean and peak dBFS. `--stems` writes each bus the film's length, to measure a stretch or hear it alone.

## 11. Tone

BibleProject is informative, curious and hopeful. The weight sits on explanation, the problem comes in small doses, and the colours stay bright.

- **Explain most:** the word, the story and the pattern take 40–60% of the speech. That is where the curiosity lives.
- **Dose the problem:** 20% of the speech or less, in 2 to 4 doses of 5 to 40 s. Answer each within seconds, and give hope at least 1.5 times the problem's share.
- **Name sin in "we", as a mechanism:** "So we do what Adam and Eve did. We sew fig leaves." Then take the weight off with a light line: "How is that going?"
- **Say wonder out loud, once per act,** about the text: "Jones noticed something kind of amazing".
- **Turn to hope on a "But"** that names a surprise, then a gift: "But the story does not end there."
- **Keep the colour script bright, with one valley:**
  - a mean luma of 140–150, with 5% of frames or fewer darker than 60;
  - one act, the answer's valley, may fall to 90–110;
  - one black moment, at the cross, held 4–6 s;
  - teal day for the open and the landing, peach to explain, sunset at the cross, dawn at the answer;
  - the landing is the most saturated act;
  - the `script.ts` header names the film's 3–5 tent-pole frames and their act lighting, next to its motifs.
- **Check:** tag each sentence of the script P (problem), A (answer) or E (explanation), and sum the words of each. Declare the acts and their targets once, as `look.acts` in `acts.ts` (re-exported by `film.ts`; the lights read the same acts): `bun run lookbook` prints each act's luma, dark share and saturation, and `check` warns `ColourScript` outside a target. In the contact sheet, only the cross's tiles read dark.

## 12. The look

A paper theatre lit from behind.

- **Three accents, each with one meaning:** gold is God's word and gift, and only gold glows; scarlet is sin, only on the person or the cloth that carries it; white is the robe. Everything else stays at saturation 0.2–0.35.
- **4–6 hues per scene,** from the film's palette.
- **Paper on every shape:** its edge (cut or torn, chosen by what it is), a shadow on the sheet under it, grain that travels with it.
- **Ink only for figures and features:** eyes, brows, mouths, hand creases, a prop's letters. Scenery has no outline.
- **One hand design, a mitten with a thumb, floating near its figure with no arm, ever.** At rest both hands float beside the body, bobbing with the breath; on a named cue a hand travels on a soft arc within the figure's reach, eased, and settles. A big hand is only a close-up of a figure we have seen, pushed into from its hand with no forearm, and matched back.
- **A crowd is never cloned:** vary height, silhouette and hat.
- **Screen direction is fixed per role** for the whole film; it crosses once, on purpose, at the turn.
- **Check:** the look-book, its per-scene numbers (luma, saturation, top hues), and the stills at full size.

## Shorts

A short is a vertical cut of a finished film (`shorts.ts`, [SKILL.md](SKILL.md) step 8), never a new drawing. These rules come from a 2025–26 study of educational shorts, BibleProject's and Kurzgesagt's above all, fitted to one narrator. They add to rules 1–12; where one differs, the short's rule wins inside the short. `bun run check <film> --short <id>` enforces the rules marked **Checked**; the rest are read off the contact sheet and the script.

1. **One idea, standalone.** A short answers one viewer question and makes sense without the film. Cut a whole question-and-answer turn, never half an argument: a span starts and ends on a mark, a cue or a scene landmark, so it keeps a whole turn when the film is re-timed.
2. **The hook is the narrator's own question, or a claim against expectation.** One voice: the narrator asks in the viewer's words ("Is God's verdict a cover-up?") or says the surprising thing ("A judge calls a guilty man righteous"). No second voice asks it. The first sound is that line or leads straight into it, and the picture already moves on frame 0: no title card, no logo, no page turn. For sound-off viewers the same line is typeset once above the picture for the first 2–3 s (the short's `hook`), the one exception to rule 1 in a short.
   - **Checked** (`ShortHook`, an error): the first word heard by 0.3 s (its voice's onset, measured from the take when it is timed, not the aligner's start, which carries the pause before it); something in the picture moving by 0.5 s (the hook and captions do not count); the film's title not in the first frame. A logo drawn as ink is not caught: look at the first tile.
3. **Length 45–75 s, never over 90 s.** Both benchmarks sit there (BibleProject 48–68 s, Kurzgesagt 67–78 s). Longer is allowed but gains no reach.
   - **Checked** (`ShortLength`): over 90 s is an error, outside 45–75 s a warning.
4. **Faster holds.** A new picture or a camera move every 2–4 s, and a take holds 3–5 s. Seams (rule 9) tighten to 0.3 s, and pauses between sentences to 0.15–0.3 s. The one long pause stays, before the payoff line. _These numbers are the study's inference (Kurzgesagt cuts every 1–3 s, BibleProject holds 4–6 s, our tone sits between), to be tuned against real shorts; nothing checks them yet._ A cut of an existing film keeps the film's own pace until the vertical camera exists; choose spans where the picture moves.
5. **Captions are burned in**, 2–4 words at a time as they are said, with no plate, below the picture. Gold marks only quoted words (Scripture, between the script’s “ and ”), word by word as they are read. Besides the captions, one text element at most: the hook line, or a word card in the band.
   - **Checked** by construction: the page sets the phrases and the gold marker (`shortPhrases`), and the `.vtt` carries the same phrases. `ShortUnsafeText` (an error for the short's own lines) keeps them inside the safe zone. The one-element rule is read off the contact sheet.
6. **Faces and action in the upper middle.** Nothing that matters goes in the right-hand 140 px (the like and share rail), the top 270 px or the bottom 520 px (`SAFE_ZONES.default`); a paid cut (`--zone ads`) also loses the bottom 35%.
   - **Checked** (`ShortUnsafeText`): the film's own text past the zone is a warning, fixed by choosing another span, never by redrawing the scene.
7. **Payoff, then loop.** The last image rhymes with frame 0, rule 4's motif payoff made tight: the hollow stamp, then the solid stamp, then back to the courtroom. The last line leads naturally into the first.
   - **Checked** (`ShortLoop`, a warning): the last frame's picture close to the first's (the mean absolute per-cell luma difference on a 64×36 grid of the band within 0.08), and at most 0.6 s of silence from the last word's voice round to the first's.
8. **The pointer.** The last 3–5 s carry one spoken line pointing to the film ("The whole story is in the film linked below"), in the narrator's voice, and the film's title shown small. Set the short's related video to the long film. Until shorts have their own recorded lines, a cut ends on the payoff instead.
9. **Our own voice and our own score. No trending audio.** Licensing limits it past a minute, neither benchmark uses it, and platforms reward original audio. The bed stays under the voice (rule 10), and no stretch is music alone.
10. **A named, recurring format.** Each short belongs to a series with a fixed opening layout: the film's story shorts, and word studies ("One Word: JUSTIFY") in one template.
