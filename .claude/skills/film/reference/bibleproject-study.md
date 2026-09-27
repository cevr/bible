# BibleProject study: direction and clarity for the film skill

Sixteen BibleProject films were measured and read frame by frame against their transcripts. They are all 10 videos in the Sermon on the Mount playlist (`PLH0Szn1yYNefD9pHcnyRivKRGpYGc2yfB`) and 6 films from other series, each chosen for a contrasting style. The comparison is with our film `righteousness-by-faith`, using its script, `pass1-sheet.jpg` and the render `out/righteousness-by-faith.mp4` (25 Sep, 20:56). That render was measured with the same tools.

**Evidence.** The working files (contact sheets, transcripts, measurement tables) were scratch and were not kept; the videos were deleted after measuring. Every timestamp points into the public video by its YouTube id (`PqEi 1:38` is `https://youtu.be/PqEiqCuIsvw?t=98`).

**Sheet references.** A reference such as `PqEi s01 r5c1-c3` names a tile on a contact sheet: sheet 1, row 5, columns 1 to 3. The sheets were 6×6 tiles, one every 4 s, so tile k = (s−1)·36 + (r−1)·6 + (c−1) shows the frame at about 4k+2 s. For our film, `pass1-sheet.jpg` had 8 columns, one tile every 6 s: tile i = (r−1)·8 + (c−1) shows about 6i+3 s.

---

## 1. The short version

1. **The Sermon on the Mount films show almost no words on screen.**
   - Across all 10, the only text is the title, the verse ranges on the series map, and small subtitles for the one sung prayer.
   - None of the 10 speaks a chapter-and-verse reference. In all 16 films, only two name a book with a chapter: Genesis 15 in the Romans overview, and Isaiah 61 in the commentary.
   - Ours puts 30 citations on screen. 31 of our 58 sheet tiles show a quotation, typeset or handwritten, and 56 carry a caption strip.
2. **They quote little and paraphrase a lot.**
   - Quoted Scripture is 5 to 21% of the words in the Sermon on the Mount films, with a median of 13.5%. That leaves out two long set-piece readings.
   - That works out to about one quotation per argument cycle.
   - Our script is 41% quotation: 337 of 822 words, in 30 quotations.
3. **Each film runs in two picture registers.**
   - STORY is literal: miniature sets with faceted people, cut like live film, with close-ups and reactions.
   - IDEA is symbolic: flat, glowing figures on a dark ground.
   - The register switches at turns, and the two merge at the landing.
   - Ours is one cream register with small figures. It mixes literal and symbolic scenes with nothing to say which is which.
4. **Every abstraction becomes one concrete picture, usually the text's own metaphor drawn literally.**
   - Examples: a judge's magnifying glass turns into a mirror; a mask stands for deception; a crack in the ground stands for broken trust.
   - A few motifs are introduced early and paid off at the landing.
5. **A second voice asks the viewer's question at every turn.**
   - Nine of the Sermon on the Mount films label their speakers, and each has 28 to 64 turns. The tenth also has two voices.
   - Ours is a single narrator.
6. **The shape is fixed.**
   - The title comes at about 7% of runtime.
   - The spoken landing starts at about 78% and lasts about 24 s.
   - About 30 s of music alone follows, then a 10 to 22 s coda.
   - In ours, "within" starts at 77%, where their landing starts. The 1888 history beat then fills 86 to 93%, where their music plays alone. Our answer arrives at 93%, and only 8.9 s follow the last line.
7. **Sound.**
   - In the two films measured, the music bed sits 17 to 20 dB under the voice through the narration, pauses included.
   - The music rises to about 6 dB under the voice only where no one speaks.
   - Its low end swells 15 to 20 dB on the problem and the climax, and thins under the answers.
   - In our render the bed sits 26 dB under the voice, and the low end is flat for the whole film.
   - Our narration pauses 24.5 times a minute, with a median pause of 0.60 s and 26 pauses of a second or more. Nine of the ten longest fall at the seams between beats.
   - BibleProject pauses 15 to 20 times a minute, with a median of 0.25 s and only 1 or 2 pauses over a second.

---

## 2. The films

WPM is words per minute. "Span" divides the caption words by the time from the first caption to the last. "Artic." (articulation) uses the automatic word timings and leaves out pauses of 0.35 s or more. "Changes/min" counts hard cuts plus gradual picture changes (see §3). Luma runs from 0 to 255. The music-only spans come from the caption timings and are accurate to about ±1 s.

| #   | id          | Title                                              | Series                                 | Dur  | WPM span/artic. | Voices | Quoted                  | Cuts/min | Changes/min | Median shot | Luma    | Title at              | Landing at         | Music-only landing     |
| --- | ----------- | -------------------------------------------------- | -------------------------------------- | ---- | --------------- | ------ | ----------------------- | -------- | ----------- | ----------- | ------- | --------------------- | ------------------ | ---------------------- |
| 1   | NtKb7CJDUZc | Jesus Said 2,000 Words That Changed Human History  | Sermon on the Mount                    | 5:24 | 157/191         | 2      | 14%                     | 7.0      | 16.3        | 4.9 s       | 82      | 0:26 (8%)             | 4:15 (79%)         | 4:22–4:55, 33 s        |
| 2   | s9246LGlngs | "Blessed are the Poor in Spirit"                   | Sermon on the Mount                    | 6:45 | 156/179         | 2      | 19%                     | 3.3      | 11.4        | 9.6 s       | 71      | first                 | 5:18 (79%)         | 5:42–6:10, 28 s        |
| 3   | KUil1m3P2iI | How Can You Know What's Right?                     | Sermon on the Mount                    | 6:09 | 154/180         | 2      | 6%                      | 6.0      | 15.1        | 7.0 s       | 76      | first                 | 4:50 (79%)         | 5:14–5:37, 23 s        |
| 4   | okFibMvn3t0 | Why Jesus Connected Anger with Murder…             | Sermon on the Mount                    | 8:13 | 166/183         | 2      | 9%*                     | 6.1      | 13.7        | 6.4 s       | 66      | 0:42 (8.5%)           | 6:54 (84%)         | 7:07–7:39, 32 s        |
| 5   | 3EkD-alQhT8 | What Does Peace Cost?                              | Sermon on the Mount                    | 8:04 | 165/191         | 2      | 12%                     | 5.0      | 12.4        | 5.8 s       | 63      | 0:26 (5%)             | 6:02 (75%)         | 7:00–7:29, 29 s        |
| 6   | wCo2LN7E6bo | How to Spot Religious Hypocrisy in Yourself        | Sermon on the Mount                    | 6:42 | 159/188         | 2      | 21%                     | 6.3      | 15.5        | 6.3 s       | 92      | 0:42 (10%)            | 5:14 (78%)         | 5:35–6:05, 30 s        |
| 7   | 3-YlqQfKkKk | The Lord's Prayer Could Rewire Your Daily Life     | Sermon on the Mount                    | 9:25 | 131†/183        | 2      | 5%*                     | 4.4      | 10.3        | 7.2 s       | 83      | first                 | 6:46 (72%)         | sung prayer, 6:50–8:50 |
| 8   | GpqOdHV3dmU | Jesus' Perspective on Wealth in 6 Minutes          | Sermon on the Mount                    | 6:54 | 156/188         | 2      | 13%*                    | 6.5      | 17.5        | 5.0 s       | 73      | 0:18 (4%)             | 5:30 (80%)         | 5:48–6:22, 34 s        |
| 9   | PqEiqCuIsvw | Why Sharing Your Wisdom Isn't Always Wise          | Sermon on the Mount                    | 5:23 | 164/193         | 2      | 19%                     | 5.2      | 15.0        | 6.6 s       | 81      | 0:22 (7%)             | 3:46 (70%)         | 4:10–4:38, 28 s        |
| 10  | 0iJ1-_nH47c | Jesus Explains What the Path to True Life is Like  | Sermon on the Mount (finale)           | 7:01 | 180/193         | 2      | 15%                     | 6.5      | 17.2        | 6.9 s       | 71      | first, returns at end | 5:22 (76%)         | 6:10–6:46, 36 s        |
| 11  | aNOZ7ocLD74 | Sin Is Not Rule-Breaking                           | Word Study ("bad words"), 2016         | 5:42 | 182/–           | 1      | 10%                     | 1.6      | 10.7        | 24 s        | 148     | word card 0:46        | poster 5:10 (91%)  | live-action outro      |
| 12  | G_OlRWGLdnw | This Ancient Ritual Helps Explain Jesus' Death     | Biblical Themes: Sacrifice & Atonement | 6:50 | 180/193         | 2      | n/a‡                    | 3.5      | 8.6         | 11.5 s      | 128     | –                     | 5:46 (84%)         | live-action pitch      |
| 13  | ej_6dVdJSIU | Book of Romans Summary, Part 1                     | Read Scripture (New Testament)         | 7:46 | 176/185         | 1      | ~0 (paraphrase)         | 0        | 1.7         | one shot    | 184     | 0:06                  | summary 6:58 (90%) | –                      |
| 14  | GswSg2ohqmA | The Book of Job's Wisdom on How God Runs the World | Wisdom Series finale                   | 7:14 | 170/191         | 2      | 1%                      | 3.6      | 7.9         | 7.6 s       | 98      | frames 0:06           | 5:26 (75%)         | live-action pitch      |
| 15  | d_Q6WkD_Pas | Isaiah 61 Visual Commentary                        | Visual Commentary (vertical 9:16)      | 7:17 | 178/188         | 2      | 20% + passage on screen | 0        | 0.1         | one shot    | 208     | 0:14                  | 6:26 (88%)         | –                      |
| 16  | rkqsQpck8YU | Design Patterns in Biblical Narrative              | How to Read the Bible, ep. 8           | 6:06 | 189/193         | 2      | 4%                      | 0.3      | 2.0         | 41 s        | 161     | 0:22 (6%)             | 5:06 (84%)         | teaser, live action    |
| –   | **ours**    | Righteousness by Faith                             | –                                      | 5:50 | 145/~191        | 1      | **41%**                 | 0        | **1.5**§    | –           | **181** | 0:15 (4%)             | **~5:25 (93%)**    | **none (8.9 s tail)**  |

- \* Quoted share pairs quote marks and drops any span over 60 words, since a span that long means a mark was left unclosed. That undercounts long set pieces: Matthew 5:28–30 in okFib (about 98 words), the birds and lilies in GpqO (about 190 words), and the sung prayer.
- † The 131 span WPM of 3-Ylq includes its two-minute sung prayer.
- ‡ The G_Ol captions have no punctuation, so neither its quoted share nor its sentence length can be measured.
- § For ours, the detector finds no hard cuts and only 9 gradual changes. Consecutive scenes share the same cream page and small figures, so they change few pixels. That is itself the finding: our frame barely changes between scenes.

**Why each of the six other films was chosen:**

- **11, the Word Study on khata, "sin".** It covers the ground of our "rags" and "witness" beats. It is the older flat-vector "cards on a paper page" look, the BibleProject style nearest to our cream page with text.
- **12, the Sacrifice and Atonement theme.** It covers substitution and "cover", which are our "exchange" and "robe" beats. It uses the older painted collage and the Tim-and-Jon dialogue.
- **13, the Romans 1–4 overview.** Justification by faith is our subject. It is the ink-on-parchment whiteboard poster, the BibleProject style with the most on-screen text.
- **14, Job.** Our film opens on Job 9:2. This is the painted, cinematic Wisdom Series treatment of Job's question about whether God is just.
- **15, the Isaiah 61 Visual Commentary.** Isaiah 61:10 is "the robe of righteousness", our "robe" beat. This format puts the whole passage on screen and reads it with highlights, the opposite pole from the Sermon on the Mount films.
- **16, Design Patterns.** It is an episode about repetition and callback, the device we most need, in the flat comic-panel "How to Read" look.

---

## 3. Method and caveats

- **Transcripts** are the human captions, fetched with ytt. They mark speaker turns with "- ". Word-level timings come from the automatic subtitles (json3; vtt for aNOZ, which has no articulation figure).
- **Video** was downloaded at 480p, video only, and deleted after measuring.
  - **Contact sheets** use `fps=1/4,scale=320:-1,tile=6x6`. Every sheet was read against its pack.
  - **Scene scores** come from `select='gte(scene,0)'`. A **cut** is a frame scoring over 0.3; cuts within 0.25 s of each other are merged.
  - A **gradual change** is a 1-s window summing to 0.3 or more with no cut within 1 s.
  - **"Held"** frames score under 0.0005; **"moving"** frames score 0.003 or more.
  - **Colour** comes from `signalstats` at 1 fps. Warmth is V minus U.
  - **Strips** show six frames around each of 8 events per film. They are partial for 4 films, where the extraction hit an mjpeg range error.
- **Audio** was measured on 2 films, NtKb7CJDUZc and G_OlRWGLdnw, and on our render.
  - Levels are RMS in 50-ms windows. A band under 70 Hz stands in for the music's low end, and a band over 7 kHz for effects. Integrated loudness comes from `ebur128`.
  - A pause is a run of at least 0.15 s below the voice level minus 14 dB. The voice level is the 70th percentile of the window levels.
  - The sound findings rest on those 2 films, 4 spectrogram windows and one set of effect-annotated captions. Treat them as indicative.
- **Picture changes** are measured by pixels, so they undercount changes between similar frames. That is why ours reads 1.5 a minute.
- **Speaker turns** are undercounted where the dialogue is unlabelled: NtKb, G_Ol, Job and Design Patterns. The Voices column was set by reading.
- **Our film** was measured as it stands: `script.ts`, the takes in `narration/`, and the MP4 and `.vtt` in `out/`. No repository file was changed.

---

## 4. Beat template

### 4.1 Where each beat falls in a Sermon on the Mount film (n = 10, median length 6:50, 786 to 1362 words)

| Beat                                          | Share of runtime (median, range)            | In a 6-min film | Words            | What happens                                                                                  | Evidence                                                           |
| --------------------------------------------- | ------------------------------------------- | --------------- | ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Open**                                      | 0–7%                                        | 0:00–0:25       | 0–60             | See below.                                                                                    | NtKb 0:00–0:25; 3EkD s01 r1c1                                      |
| **Title**                                     | 7% (4–10%) in 6 films; first in the other 4 | ~0:25           | –                | The title lands on the words that name it.                                                    | PqEi 0:22, "…called the Sermon on the Mount", s01 r1c6             |
| **Framing**                                   | ends ~11% (5–32%)                           | to ~0:40        | 60–150           | The question is asked and the shape of the answer is said aloud (below).                      | see below                                                          |
| **Backstory or biblical pattern** (when used) | 10–48%, 55–80 s                             | –               | 150–220          | Creation, rebellion, Torah and covenant, told in the IDEA register.                           | NtKb 1:40–2:36; KUil 1:14–2:18; 0iJ1 0:42–2:02                     |
| **Body**                                      | ~11% to ~75%                                | –               | 65–120 per cycle | 3 to 11 cycles (§4.2): 25–45 s each for list items, 75–160 s each for case studies.           | s9246, 8 Beatitudes and 3 images; okFib, cases of 84, 74 and 160 s |
| **Deepest turn or callback**                  | 55–65%                                      | –               | –                | See below.                                                                                    | 3-Ylq s03 r3c4; KUil s02 r4c5; 0iJ1 s02 r5c3                       |
| **Landing**                                   | starts at 78% (70–84%), ~24 s (7–60)        | ~4:40           | 40–90            | See below.                                                                                    | okFib 6:54–7:06; 3EkD 6:02–6:58; PqEi 3:46–4:06                    |
| **Music-only landing**                        | starts at 84% (73–88%), 30 s (23–36)        | ~5:00           | 0                | Music under the credits; in NtKb a low pulse enters partway.                                  | NtKb 4:22–4:55, pulse at ~4:33                                     |
| **Coda**                                      | 88–97%, 10–22 s                             | ~5:35           | 30–60            | "We just looked at… Next…" over the series map. The final film brings the title back instead. | KUil 5:38–6:00; PqEi 4:42–5:02; 0iJ1 s03 r4c3                      |

More detail on four of these beats:

- **Open.** Three of the ten films run 5 to 7 s of music alone before the first word. The cold open then takes one of three forms:
  - one image, such as the crack in the grass (3EkD 0:02);
  - a montage of quotations, one per shot at about 4 s each (NtKb 0:06–0:25);
  - a recap in the IDEA register (PqEi 0:00–0:22).
- **Framing.** Examples:
  - "The prayer has two short halves, each with three requests" (3-Ylq 0:18).
  - "Jesus will first quote a command from the Torah, and then second, he'll reveal God's wisdom underneath" (okFib 0:22–0:50). The film tells its own beat template.
  - A structure diagram of 3 panels, then 3×3, then a zoom through its centre panel (NtKb 1:06–1:24, s01 r3c5–r4c4).
- **Deepest turn or callback.**
  - "Oh, that is this prayer." (3-Ylq 5:50–6:06, Gethsemane).
  - The brightest frame of a film falls on its key quotation (KUil 3:54, luma 164).
  - The golden city appears behind Jesus on "the choice is about how we respond to him" (0iJ1 4:06–4:18).
- **Landing.**
  - A montage of earlier problem shots, now resolved, with the two registers merging (okFib, 3EkD, 0iJ1).
  - The thesis line comes last, with a held pause before its final word: "standing right … here", after 3.05 s (NtKb 4:27).

**Ours, by the same measure** (beat starts from the `.vtt`; runtime 349.97 s):

| Beat           | Starts at |
| -------------- | --------- |
| question       | 0%        |
| title          | ~4%       |
| measure        | 5%        |
| rags           | 12%       |
| witness        | 19%       |
| void           | 24%       |
| centurion      | 31%       |
| justified      | 39%       |
| exchange       | 48%       |
| robe           | 54%       |
| hand           | 63%       |
| serpent        | 68%       |
| within         | 77%       |
| 1888           | 86%       |
| name           | 93%       |
| last line ends | 97%       |

"within" starts exactly where BibleProject's landings start. The 1888 history beat then takes the slot where their music plays alone. BibleProject puts history and backstory at 10 to 48%.

**The other formats land in the same place.** The spoken landing falls between 75% and 91% in all six:

- Word Study, 5:42:
  - hook 0–6%, framing 7–12%, the word card at 13%, the definition at 23%;
  - turns at 39% and 51%, the gospel at 80%;
  - a summary poster at 91%.
- Themes, 6:50:
  - hook 0–4%, the bind at 11–17%, the pattern at 16–27%;
  - fulfilment at 53–62%, the callback landing at 84%.
- Romans, 7:46:
  - author 1–11%, situation 12–21%, structure at 26–31%;
  - content 31–90%, a numbered summary at 90–97%.
- Job, 7:14:
  - a framing device at 1–11%, God's speech at 50–63%, the answer at 65–73%;
  - the landing at 75–83%, the bookend at 83–85%.
- Visual Commentary, 7:17:
  - it reads the ending first (4–8%);
  - it states the structure at 13–14%;
  - it lands on the same lines at 88–94%.
- Design Patterns, 6:06:
  - pattern 1 is defined at 20–27%, repeated at 29–44%, and flipped at 48–54%;
  - pattern 2 at 54–67%;
  - a bookend landing at 84–86%.

### 4.2 The body cycle (Sermon on the Mount)

| Step                                    | Seconds | Words | What happens                                                                      | Evidence                                                                                     |
| --------------------------------------- | ------- | ----- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1. A quotation over STORY               | 6–15    | 15–40 | Jesus' line lands on his close-up, or on a literal dramatization held about 12 s. | "Do not judge." on a close-up, PqEi 0:54 s01 r3c2; a red-lit street quarrel, okFib 0:58–1:14 |
| 2. The viewer's question (second voice) | 1–4     | 2–15  | "Traps? - Yeah."                                                                  | PqEi 0:26; "Wait. So Jesus is equating anger and name-calling with murder?", okFib 1:16      |
| 3. The IDEA metaphor                    | 8–20    | 25–60 | The text's own image is drawn and acted out.                                      | the beam and the speck, then the lens that becomes a mirror, PqEi 1:22–1:46 s01 r4c3–r5c3    |
| 4. The wrap line                        | 2–4     | 6–15  | "So it takes wisdom to know when to offer wisdom. - Exactly."                     | PqEi 2:54                                                                                    |
| 5. A STORY reaction                     | 2–5     | 0–10  | A listener's face.                                                                | PqEi 1:50; 0iJ1 4:02                                                                         |

The whole cycle runs 25–45 s, or about 65–120 words at 160 WPM.

**Ours:**

- 14 spoken beats of 12 to 30 s each (median 22 s) and 39 to 80 words.
- Each beat carries 1 to 4 quotations (mean 2.1) and 1 to 4 on-screen citations.
- There is no second voice and no reaction shot.

### 4.3 Beat devices, with lines

- **Hooks.**
  - "Most people assume the Bible has a lot to say about how messed up humans are, and that is true." (Word Study 0:02)
  - "We all long for the world to be good…", then "there's a problem" (Themes 0:00–0:10). On screen, the letters of PEACE JUSTICE LOVE fall apart and re-form as E-V-I-L (s01 r1c2–c5).
  - "Is God WISE and JUST?", lettered in a picture frame (Job 0:38–0:46, s01 r2c4–c6).
  - The Visual Commentary reads the poem's last lines first (0:22–0:34).
- **Turns.** They come as a spoken hinge, often with a change of register:
  - "But in Jesus' day, God's Kingdom was nowhere to be seen", with a white flash (NtKb 2:38, s02 r1c4)
  - "But there is more." (Word Study 2:10)
  - "…he'll have to get rid of us." (Themes 1:02)
  - "It's kind of weird. I mean what was this all about?" (Job 4:38)
  - "Perhaps someone will come and break the pattern." (Design Patterns 2:54)
- **Word studies.**
  - In the Sermon on the Mount films the word is spoken and drawn, never written:
    - "hupokrites, which refers to a stage actor putting on a show" becomes masked performers on a stage (wCo2 0:58–1:18, s01 r3c3–r4c2).
    - "A righteous person is someone who consistently does right by God and right by others" is spoken over the IDEA cast acting it out (KUil 0:30–0:40).
    - "the stored-up things" becomes a still life of piled goods (GpqO 0:42).
  - The text-first formats use one card per word:
    - חטא / SIN / ἁμαρτία, then TO FAIL / KHATA / TO MISS, then TO MISS THE GOAL painted on a clay jar (Word Study 0:46–0:58, s01 r2c6–r3c3).
    - JUSTIFICATION BY FAITH, "TO DECLARE RIGHTEOUS" (Romans 5:18–5:26).
    - "anointed" gets a magenta tag reading מָשִׁיחַ (Visual Commentary 1:10, s01 r3c6).
- **Biblical patterns.**
  - Manna for "daily bread" (3-Ylq 3:06–3:30).
  - "'the house of God' is the most common phrase to describe God's temple up on the [rocky hill]" (0iJ1 4:26–4:42).
  - See, desire, take (Design Patterns 1:14–2:42).
  - The servant king of Isaiah on the way to the cross (Themes 3:14–3:34).
  - Abraham in Genesis 15 (Romans 6:02–6:58).
- **Repetition and callback.**
  - "Oh, that is this prayer." (3-Ylq 6:02)
  - "And Jesus ends this part how he began it." The series map lights the cards for 5:17–20 and 7:12 together (PqEi 4:46–4:50, s02 r6c6).
  - "just like Jesus said at the very beginning of the sermon, 'A city on a hill cannot be hidden.'" A campfire on the dark hill is both the real scene and the city (0iJ1 5:30–5:38, s03 r2c6).
  - "the garden image at the end that we read back at the beginning. - Oh right" (Visual Commentary 6:26).
  - "Do you get it? - Yeah, the story is matched." (Design Patterns 1:58)
- **Landings.**
  - "creative love is the only pathway to real peace", as the opening crack returns filled with water and new grass (3EkD 6:54, s03 r6c2).
  - "God's wisdom invites us to honor the image of God in every person that we meet." (okFib 7:02)
  - "And now, that choice is ours." (0iJ1 6:06)
  - "no matter what comes good or bad he can trust God's wisdom" (Job 5:54)
- **Closes.**
  - A music-only landing, then "We just looked at… Next up…" (KUil 5:38–5:50).
  - The other formats close on a live-action pitch or a teaser. The finale closes on the returning title.

---

## 5. Visual grammar

**Registers and transitions**

- **V1. Two registers.**
  - **STORY:** the Bible's own scenes, taken literally. Miniature physical sets (the credits name Bent Image Lab for set fabrication), warm light, depth of field, faceted people, film editing from wide shot to two-shot to close-up.
  - **IDEA:** the argument. Flat, glowing, single-colour figures, 1 to 4 per frame, on a dark ground, with one gold prop (the Torah scroll).
  - All 10 Sermon on the Mount films work this way. The older films do the same with other means:
    - picture frames on a gallery wall versus the scenes inside them (Job);
    - a modern reader on a bench versus comic panels (Design Patterns);
    - the Bible as a book on a gold texture versus the Everyman's world (Themes).
- **V2. The register switches at a turn, by one of a few devices.**
  - a white flash (NtKb 2:38, s02 r1c4; s9246 1:10)
  - a zoom through a diagram panel into a scene (NtKb 1:24)
  - a dip to black (NtKb 4:20; 0iJ1 2:06; Job 5:22 on "the fear of the Lord")
- **V3. The registers merge at the landing.**
  - the IDEA city dissolves over the real hill, and the crowd is lit gold (s9246 5:18–5:38, s03 r2c2–c5)
  - the pink IDEA figure appears inside the warm STORY frame (PqEi 3:46–3:58, s02 r4c4–c6)
  - the golden city behind the real mountain on the last line (0iJ1 6:06, s03 r4c2)

**Pictures for ideas**

- **V4. One concrete picture per abstraction, from the text's own words, drawn literally.**
  - "more highly than you should": a figure raised on a pedestal among bear traps (PqEi 0:30–0:34, s01 r2c2)
  - "measured by": scales (PqEi 1:18, s01 r4c2)
  - self-reflection: the judge's magnifying glass turns into a mirror (PqEi 1:38–1:46, s01 r5c1–c3)
  - contempt: relative size; the other person shrinks to a bug and is flicked away (okFib 1:18–1:42)
  - lust: an eye-beam turns a woman into a vase (okFib 2:46–2:58, s02 r1c6)
  - "fill in the gaps": holes in the floor filled with gold light (KUil 2:50–2:58)
  - "how great is that darkness?": the frame goes almost black, luma 19 (GpqO 3:02, s02 r2c4)
  - sin as "missing the goal": a slinger (Word Study 1:02, s01 r3c4)
  - "crouching at the door": a black beast (Word Study 3:30, s02 r3c5)
  - vandalism: black scribbled thorns overrunning a painted world (Themes 0:34, s01 r2c3)
- **V5. A few motifs, introduced early and paid off at the landing.**
  - The crack in the ground (3EkD):
    - it opens the film between two pairs of feet (0:02, s01 r1c1);
    - it runs through every IDEA scene as broken trust (1:34, 2:26, 3:34, 5:30);
    - it becomes a chasm that a figure crosses and closes (5:42–5:50);
    - it returns filled with water and new grass on the last line (6:54, s03 r6c2).
  - The mask stands for deception throughout 0iJ1: the deceiver (1:10, s01 r3c6), the false leaders, the sheep's clothing (2:54, s02 r2c2), fake fruit.
  - The house (0iJ1): Eden's home, the temple on the rock, the two builders, and a village rebuilding the house wrecked at 0:18 (5:54, s03 r3c5).
  - The thorns (Themes): they overrun the world (0:34), wrap the Everyman's arms (0:54, s01 r3c2), then wrap Christ on the cross (3:54, s02 r4c5).
- **V6. A recurring cast and a shared shot library.**
  - The scribe's hat silhouette is the same in both registers (KUil 2:26–2:34).
  - The rooftop prayer shot from episode 1 is reused (wCo2 3:14–3:18, s02 r3c1).
  - One Everyman carries the whole Themes film, and he finally walks to the beggar he ignored (5:58, s03 r3c6).
- **V7. The argument moves by animation inside a held frame. Cuts change place.**
  - In the 0iJ1 transition strips, the gradual changes are motion within one IDEA frame:
    - masks slide off to show wolves' heads (1:52);
    - a mask flies onto a wolf (2:53);
    - a masked wolf tumbles (3:16).
  - Each of the four hard cuts moves to a new place:
    - the golden city to the masked leaders (1:39);
    - a dark alley to a sunlit doorway (2:37);
    - a white flash in the storm between two builder shots (4:50);
    - the rebuilt house to Jesus at dusk (5:56).
  - NtKb's strips show the same split: morphs inside IDEA (a pink figure splits into a man and a woman; the scroll-road twists from fire into Torah), and hard cuts inside STORY.

**People and camera**

- **V8. People at human scale.**
  - Jesus' lines land on his close-up: PqEi 0:54 (s01 r3c2), 1:54 and 3:38; okFib 4:54, one close-up for each "And I say to you".
  - A reaction close-up follows each idea (PqEi 1:50; 0iJ1 4:02).
  - Even the flat Word Study sets God's warning beside Cain's profile (3:22–3:26, s02 r3c3–c4).
- **V9. A long quotation becomes one shot per image, in the order spoken, or one held shot.**
  - GpqO 4:18–5:46, about 190 words, one shot per image:
    - a basket of food (4:26);
    - birds on a pole (4:34);
    - a man with lilies (4:50);
    - a pigeon eating from a hand (4:58);
    - a nest held about 12 s (5:06–5:14).
  - s9246 3:42–3:56: one wide shot of Jesus held about 16 s.
  - 0iJ1 4:42–5:18: the builders played as one continuous IDEA parable.

**Colour, clutter and text**

- **V10. A colour script for each idea.**
  - Colour follows the idea:
    - storm grey-green for conflict (3EkD);
    - red and orange for anger, magenta for lust, night blue and candlelight for the divorce debate, gold for the resolution (okFib);
    - the brightest frame on the key quotation (KUil 3:54, s02 r4c5), the darkest frame for darkness (GpqO 3:02).
  - The Sermon on the Mount films average luma 63 to 92 and saturation 15 to 26. They spend 29 to 55% of their seconds darker than luma 60.
  - The light-page formats are all text-first: luma 148 to 208, saturation 7 to 13.
  - Ours averages luma 181 and saturation 13, with 5% of seconds dark. It is lit like a text-first format.
- **V11. Keep the frame clear.**
  - STORY frames have one subject, with the background out of focus.
  - IDEA frames have 1 to 4 figures in dark empty space.
  - There are no labels on the pictures in the Sermon on the Mount films; even the structure diagram has none (NtKb 1:06–1:22).
- **V12. Text, when there is any, has one job and is the only text on screen.**
  - The job varies by format:
    - one word card (Word Study);
    - a growing outline in 2- to 10-word caps that is never erased, with references only as section headers (Romans; four columns at 2:06–2:22, s01 r6c2–c6);
    - the passage itself, with the current line dark, the rest grey, and 2 to 4 words highlighted per section (Visual Commentary);
    - the text's own key words as comic captions (Design Patterns: GOD SAW THAT IT WAS GOOD, seven times around the creation circle, 1:06, s01 r3c5; TAKE!);
    - hand-lettered key words set into the scene (Themes: ATONEMENT 1:46, s01 r5c3; LIFE on the bowl, 2:14; Mark 10:45 around the cross, 3:42, s02 r4c2);
    - a quotation written into the world itself (Job: the poem in the dirt, 2:22, s01 r6c6).
  - Where text is used it follows a few habits:
    - it is revealed as the words are spoken;
    - the key word is in the accent colour;
    - a reference, when shown, is small (Word Study "Judges 20:16" in the card's corner, 1:02, s01 r3c4).
  - None of the 16 films shows a caption strip, a cite tag and a quotation at the same time.

**Structure and repetition**

- **V13. The structure is shown on screen and revisited.**
  - The Sermon on the Mount diagram (NtKb 1:06–1:22) and the series map (PqEi 4:42–5:02).
  - The Romans table is filled in, then summarised between two pillars (7:06–7:30, s03 r6c6).
  - The Visual Commentary pulls back to the whole poem before its sections (0:58, 5:38).
  - Job's three picture frames spell The / GOOD / LIFE at the end (6:10, s03 r4c3).
  - The Word Study gathers all its cards into one poster (5:10, s03 r1c6).
- **V14. Repetition becomes layout.** The same shapes stay in the same places, with new pictures in them:
  - a rectangle, a circle joined to it by a dashed sightline, a TAKE! burst and shards, repeated six times (Design Patterns 1:14–2:42);
  - the six gathered into one grid (2:46, s02 r1c6);
  - the flip keeps the layout and changes only the last panel: three crosses in place of shards (3:10–3:14, s02 r2c6–r3c1).
- **V15. Bookends.**
  - the crack (3EkD)
  - the title carved into a path, returning as the end card (0iJ1 0:02 → 6:10)
  - the picture frames (Job 0:06 → 6:10)
  - the garden drawing (Visual Commentary 0:14 → 6:42)
  - the reader on the bench (Design Patterns 0:02 → 5:06)

**What ours does, from `pass1-sheet.jpg` (58 tiles, one every 6 s):**

- **Text.**
  - 31 tiles show a quotation. 27 are typeset in italics, some still being written, and 4 show the handwritten opening question.
  - 56 tiles carry the caption strip, about 33 a cite tag, and about 20 a handwritten label.
  - Four layers at once is common:
    - row 1 tile 6: cite tag, quotation, the label "God's character, written out", and caption;
    - row 3 tile 7: cite tag, quotation, two gold labels, and caption;
    - row 5 tile 3: cite tag, quotation, the label "human effort", and caption.
- **Figures.**
  - In most tiles they are about a tenth of the frame's height.
  - The priest in his gold circle (row 5) is a medium shot.
  - Only the glowing chest (row 4 tile 4) and the hand (row 5 tiles 6–8) are close.
- **Night page.** It appears in row 1 tile 7 (the decalogue circle), row 2 tile 8 ("light") and row 7 tiles 5–6 (the 1888 angel). It sets a mood rather than marking a register.
- **Keep:**
  - the question-to-answer bookend with the gold line (row 1 tile 2 to row 8 tile 1);
  - the two word cards (RIGHTEOUSNESS, and JUSTIFIED with its Greek);
  - the mirror that shows the stain but cannot wash it (row 2 tiles 4–6);
  - the loom, the open hand, the serpent camp and the scraps sum;
  - the warm palette.

---

## 6. Narration and pacing

| Measure                          | Sermon on the Mount (10)                                                                                                                                       | Other formats (6)                                                                                                    | Ours                                                                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| WPM from caption span            | 154–180, median 158 (3-Ylq 131 with its song)                                                                                                                  | 170–189                                                                                                              | 145                                                                                                                                            |
| Articulation WPM                 | 179–193, median 188                                                                                                                                            | 185–193                                                                                                              | ~191                                                                                                                                           |
| Words per film                   | 786–1362                                                                                                                                                       | 1006–1359                                                                                                            | 822                                                                                                                                            |
| Sentence length                  | median 11–14 words; 26–36% are 8 words or fewer                                                                                                                | median 10–19                                                                                                         | **median 8; 60% are 8 words or fewer** (mean 9.8)                                                                                              |
| Voices                           | 2 in all; in the 9 with labelled captions, 28–64 turns and a median of 19–31 words per turn                                                                    | 2 in 4, 1 in 2                                                                                                       | 1                                                                                                                                              |
| Pauses of 0.15 s or more (audio) | NtKb: 15.0/min, median 0.25 s, 90th percentile 0.65 s, 1 over a second                                                                                         | Themes: 20.0/min, median 0.25 s, 90th percentile 0.65 s, 2 over a second                                             | **24.5/min, median 0.60 s, 90th percentile 1.10 s, 26 over a second**                                                                          |
| Designed pauses                  | 0.55–0.95 s between separate quotations (NtKb 0:32, 0:35, 0:48); 3.05 s before the landing's last word (NtKb 4:27)                                             | 0.65–0.80 s at section hinges (Themes 3:16, 3:41, 4:17)                                                              | 1.2–3.2 s, 9 of the 10 longest at seams between beats (0:12, 0:17, 1:05, 1:45, 2:15, 3:07, 3:36, 3:56, 4:58); the other inside "within" (4:40) |
| Quoted share                     | 5–21%, median 13.5%                                                                                                                                            | 0–20%                                                                                                                | 41%                                                                                                                                            |
| References spoken                | none                                                                                                                                                           | a book with a chapter twice (Genesis 15 in Romans; Isaiah 61); chapter numbers alone in the Romans and Job overviews | none spoken, but 30 on screen                                                                                                                  |
| Sources named in speech          | by speaker or book: "The prophet Ezekiel called them wolves" (0iJ1 1:50), "That same proverb continues" (PqEi 2:42), "But Isaiah looked forward" (Themes 3:10) | same                                                                                                                 | same ("Waggoner saw why", "Ellen White wrote")                                                                                                 |
| Music alone                      | 5–7 s before the first word in 3 of 10; 23–36 s after the landing; 11–25 s after the coda                                                                      | live-action outros, or none                                                                                          | 0.3 s before the first line; 8.9 s after the last                                                                                              |

Our rate of speech matches theirs. The differences are the pauses and the sentences:

- Our pauses are more frequent and longer, and fall at the seams between takes rather than where the argument needs them.
- Our sentences are shorter and more clipped ("Darkness. Emptiness. Nothing at all."; "It moves in."). Theirs are conversational sentences broken up by the second voice.

---

## 7. Sound

**Levels.**

|                                      | Film 1 (NtKb) | Film 12 (Themes) | Ours        |
| ------------------------------------ | ------------- | ---------------- | ----------- |
| Integrated loudness                  | −18.0 LUFS    | −18.4 LUFS       | −19.7 LUFS  |
| Voice (70th percentile of 50-ms RMS) | −17.1 dBFS    | −17.9 dBFS       | −22.1 dBFS  |
| Bed in pauses (median)               | −34.3         | −38.0            | −48.2       |
| Bed under the voice                  | **17.2 dB**   | **20.1 dB**      | **26.1 dB** |

- In ours the gap is the same in pauses shorter than a second and in longer ones: 25.8 and 26.2 dB.
- BibleProject does not lift the bed in gaps either. NtKb's 3-s pause before "here" sits at −37, about 20 dB under the voice.
- The skill's current target, about 7 dB under the voice between lines, is contradicted by both films. Our render does not meet it either.

**Music alone.** The music comes up only where no one speaks.

- NtKb opens with 6.1 s of music alone, at a median of −36.2 dBFS (90th percentile −24.9).
- Its 33-s music-only landing (4:22–4:55) runs at a median of −23.4 dBFS (90th percentile −16.9). That is about 6 dB under the voice, with peaks at voice level.
- A low pulse enters at about 4:33, 11 s into the landing.
- The 18.9 s after its coda sit at a median of −28.7.
- Ours starts speaking 0.3 s in. The 8.9 s after its last line sit at a median of −52, about 30 dB under our voice.

**The low end follows the argument.** The band under 70 Hz normally sits at −44 to −48 dB.

- It swells 15 to 20 dB on the problems and the climax:
  - "humans foolishly rebel" (NtKb 1:55–2:10, at −27 to −29);
  - the Roman oppression and the failed responses to it (2:35–3:10, at −31 to −37);
  - "evil ruins things" (Themes 0:10–0:40, peaks of −19 to −23);
  - "wash away the vandalism" (3:55–4:10, −23 to −25);
  - "he rose from the dead" (4:25, −27).
- It thins under explanations and answers, to −44 to −51.
- In ours, 10-s medians of that band stay between −47 and −57 for the whole film.
  - There is no swell at the rags and witness beats (0:50–1:30, −50 to −54), or at the answer.
  - Our seven music acts follow the argument on paper, but the mix flattens them.

**Effects.**

- In the four spectrogram windows (NtKb 0–7 s, 0:30–1:00 and 4:18–4:58; Themes 0:05–0:40), no effect stands out from the voice and music. Effects in these films are sparse, at the level of ambience.
- The Visual Commentary's captions log 24 effects in 7:17 (3.3 a minute), each on a concrete noun in the text:
  - chains clatter on the captives (0:50)
  - oil pattering on the anointing oil (2:46)
  - birds and a river on "oaks of righteousness" (2:54)
  - a whip crack and a shout on slavery (3:46)
  - sheep bleating on the sacrifices (4:26)
  - people chattering at the wedding (6:14)
- Our `sound.ts` places 21 effects, and 12 of them are page or slide sounds at the start of a scene. They are sounds of the medium, not of the story.

---

## 8. What we do differently, in one table

|                | BibleProject                                                                    | Ours                                                                                  |
| -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Text on screen | none (Sermon on the Mount), or one text element with one job                    | quotation, caption strip, cite tag and labels together; a quotation in 31 of 58 tiles |
| Quotations     | ~1 per cycle; 13.5% of words                                                    | 30 quotations; 41% of words; 1–4 per beat                                             |
| References     | spoken as names, never on screen (Sermon on the Mount), or small and structural | 30 cite tags                                                                          |
| Registers      | literal STORY and symbolic IDEA, switched at turns, merged at the landing       | one cream page mixing both                                                            |
| Scale          | close-ups and reactions; median shot 5–10 s; a new picture about every 4 s      | figures about a tenth of the frame; no cuts; 9 detectable changes                     |
| Voices         | 2, with the viewer's question at each turn                                      | 1, with rhetorical questions                                                          |
| Landing        | at ~78%, then ~30 s of music, then a coda                                       | "within" at 77%, then 1888 at 86%, the answer at 93%, then 8.9 s                      |
| Bed            | 17–20 dB under the voice; swells on the problem; music alone ~6 dB under        | 26 dB under; flat; no music-alone stretch                                             |
| Pauses         | short (median 0.25 s); a few long ones placed on purpose                        | median 0.60 s; 26 over a second, mostly at seams                                      |

---

## 9. Ranked directions for the skill

Each direction gives the change for `SKILL.md` or the engine, the evidence, where ours stands, and a test that can check it.

### 1. Take the words off the picture

- **Change**, in step 4 (Scenes):
  - Narration is never typeset.
  - Allowed on screen:
    - the title;
    - at most one word card per act (the word, its Hebrew or Greek, and a gloss of 2 to 4 words);
    - the opening question and its answer;
    - a quotation of 10 words or fewer, only when the words are an object in the world (written in dust, stamped, carved);
    - the sources on the end card.
  - Captions ship as the `.vtt`, which `render` already writes, not in the frame. Remove cite tags from scenes.
- **Change**, in the check tool:
  - add `SpokenText`, which fails a text block whose words match narration spoken within ±3 s, unless the block is marked as a recitation;
  - add `TextBudget`, which fails a sampled moment that shows more than one text block, not counting the title and end card.
- **Evidence:**
  - The Sermon on the Mount films show no text in all 10, apart from the title, the map and the sung prayer (3-Ylq 6:50–8:50).
  - The text-first formats keep text to one element with one job (V12).
- **Ours:** a quotation in 31 of 58 tiles, caption strips in 56, and 30 cite tags.
- **Test:**
  - `check` passes with no `SpokenText` and no `TextBudget` findings.
  - The frame sheet shows text in no more than about 8 of 58 tiles outside the title and end card. That is the budget the allowed list implies.

### 2. Quote less and paraphrase more

- **Change**, in step 2 (Script):
  - At most one quotation per beat.
  - Quoted words make up no more than 20% of the script.
  - A quotation over 25 words is a set piece and gets its own picture sequence, one image per clause (V9).
  - Keep one pioneer line verbatim where it cannot be paraphrased. Paraphrase the rest and name the writer: "Waggoner saw that…".
  - `sources.md` still holds every checked quotation, and the end card lists the sources.
- **Evidence:** 5–21% quoted (median 13.5%); no reference spoken in any Sermon on the Mount film; sources named by speaker.
- **Ours:** 41% quoted in 30 quotations. The "within" beat carries 4 of them.
- **Test:** a count in the storyboard of quotations per beat and of quoted words as a share of all words.

### 3. Two registers with a meaning

- **Change**, in the Script and the look-book:
  - Each beat declares `register: 'story' | 'idea'`.
  - STORY is the Bible's own scene: literal and warm, with depth and faces.
  - IDEA is the night page: 1 to 4 flat, glowing paper figures and one gold prop.
  - A switch happens only at a turn, by one of three named transitions: flash, push-through or dip.
  - The last beat merges the two.
- **Evidence:** V1–V3.
- **Ours:** the night page is used for mood (the decalogue in row 1 tile 7, "light" in row 2 tile 8, the 1888 angel in row 7 tiles 5–6), not as a register.
- **Test:** the look-book shows the register sequence, and every change of register lines up with a turn in the script.

### 4. One picture per abstraction, with motifs paid off

- **Change**, in the Script:
  - `picture` names one concrete image, taken first from the words spoken (rags, robe, loom, serpent, hand, circle).
  - A `motifs` list gives each motif the beat that introduces it and the beat that pays it off.
  - The check fails a motif that is never paid off.
- **Evidence:** V4–V5.
- **Ours:** the seeds exist:
  - the mirror and the loom;
  - the circle of the law, which returns in "within";
  - the gold line.

  Make fewer of them, make them bigger, and let them carry the text's job.

- **Test:** each beat has one named image, and each motif has a payoff.

### 5. Human scale: faces, close-ups, reactions

- **Change**, in Scenes and the look-book:
  - Every beat has at least one shot where a face fills a third of the frame's height or more.
  - A quotation lands on its speaker's close-up.
  - A reaction shot follows each idea.
  - Hold each shot 5 to 10 s, and move the picture within it rather than cutting away.
  - Add a figure-scale row to the look-book.
- **Evidence:** V8; median shots of 4.9 to 9.6 s; a new picture about every 4 s.
- **Ours:** figures about a tenth of the frame's height; only 2 close shots in 58 tiles.
- **Test:** the look-book's scale row.

### 6. A second voice for the viewer

- **Change**, in `voice.ts` and the Script:
  - `voice.ts` takes two voices, and a beat can carry an `ask` line.
  - Put one question at each turn, 2 to 15 words long ("Declared? But he's guilty.").
  - Answer it with a wrap line of 12 words or fewer.
- **Evidence:**
  - 28 to 64 labelled turns in every Sermon on the Mount film that labels them.
  - The second voice asks the questions in the Themes, Job and Design Patterns films too (Themes 2:06; Job 1:18; Design Patterns 0:22).
- **Ours:** one voice, with rhetorical questions ("So where does righteousness come from?").
- **Test:** the storyboard shows a question at each register switch.

### 7. The shape in time

- **Change**, in the storyboard, which should print each beat's share of the runtime:
  - Aim for the title at 4 to 10%. Ours, at 4%, is fine.
  - Start the landing at 70 to 84% and let it last 20 to 35 s.
  - Hold a pause of about 3 s before the last word of the landing.
  - Follow the landing with 25 to 35 s of music alone, then a coda of 10 to 20 s with the end card and sources.
- **For this film:** "within" already starts at 77%. Move "1888" out of the landing zone, so that "within" and "name" form the landing and the music can play alone after "The Lord our righteousness." It can go either:
  - into the framing after the title, since BibleProject places history and backstory at 10 to 48%; or
  - into the coda after the music.
- **Evidence:** §4.1.
- **Ours:** "1888" at 86%, the answer at 93%, and 8.9 s after the last line.

### 8. Repetition as layout, and structure on screen

- **Change**, in Scenes:
  - A callback reuses the earlier scene's layout and knob values. Declare it as `rhymes: '<scene>'`.
  - Show the answer's shape once, early (for example: declared, clothed, changed), and pull back to it at each turn.
- **Evidence:** V13–V15.
- **Ours:** there are callbacks (the circle, the question and answer), but they are not framed identically.

### 9. Narration pauses

- **Change**, in `narrate` and `mix`:
  - Tighten the seams between takes to 0.6 s or less.
  - Allow pauses of a second or more only where the script marks them: before the landing line, after a key quotation, at a switch of register.
  - Keep pauses between sentences at 0.2 to 0.5 s.
- **Evidence:** §6.
- **Ours:** 24.5 pauses a minute, median 0.60 s, 26 pauses over a second, 9 of the 10 longest at seams.

### 10. Sound

- **Change**, in step 6 (Sound):
  - Set the bed 17 to 20 dB under the voice wherever narration runs, gaps included. This replaces "about 7 dB under between lines".
  - Let the music rise only where no one speaks, to about 6 dB under the voice level:
    - an optional open of 5 to 7 s;
    - the landing, 25 to 35 s.
  - Swell the low register about 15 dB on the problem lines and the climax, and thin it under the answers.
  - Put effects on the story's concrete nouns (serpents, loom, coins, cloth, chains). Use page and slide sounds only at switches of register.
  - Master at about −18 LUFS, with the voice's 70th-percentile level near −17 dBFS.
- **Evidence:** §7.
- **Ours:**
  - the bed 26 dB under, with a flat low end;
  - no music-alone stretch;
  - 12 of 21 effects on page or slide sounds;
  - −19.7 LUFS, with the voice at −22.1 dBFS.
- **Test:** a `mix --stems` report of:
  - the bed level under the voice;
  - the swells in the band under 70 Hz at the marked lines;
  - the length and level of the music-alone landing.
