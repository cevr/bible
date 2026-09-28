---
name: film
description: >
  Make or change a narrated explainer film in apps/animations (cut-paper
  Canvas films, BibleProject-style): source-checked script, ElevenLabs
  narration, drawn scenes, score and effects, review renders, MP4 export. Use
  when asked for an animation, explainer video, or film; when editing a film's
  script, scenes, timing, voice, music or sound; or when a render, narrate or
  score run fails; or when checking a film's doctrine against the pioneer
  (1889) frame.
---

# Film

A film lives in `apps/animations/src/films/<film>/`. The engine is the `@bible/film` package (`packages/film`). Its API, the film folder layout and every command are in `apps/animations/README.md`: read it before the first edit. This skill is the workflow and the gotchas the README cannot show. Two references sit beside it:

- **[frame/README.md](frame/README.md)** is the doctrine: the 1889 Fundamental Principles verbatim, and a source-checked topic file for each doctrine, with what a film must show and must not say or show. A film's doctrine comes from these texts, never from memory.
- **[CRAFT.md](CRAFT.md)** is how a film carries its argument: text on screen, quoting, the STORY and IDEA registers, human scale, the shape in time, pauses and sound. It was measured from BibleProject films, and it sets the tone too: informative, curious, hopeful.

Every ElevenLabs call and every render needs `dangerouslyDisableSandbox: true` (the CLI's login sits in the Keychain; Chromium sits in `~/Library/Caches/ms-playwright`).

## Corpus, not memory (paramount)

Generate against the corpus, never against training data. A film's doctrine, its argument's shape, every quote, reference, date and attribution, and every picture that teaches come from the frame ([frame/README.md](frame/README.md) and its topic files) and from what the `bible` CLI printed in this session (`bible egw study <subject> --pioneers --export <file> --full`, verse and EGW lookups). Training data carries mainstream framings (for example, justification as a verdict only, with change coming later) and misremembered wording; the corpus is the pioneer record.

- **Fetch, then write.** Each line a beat speaks or shows as a quote is in `sources.md` and `quotes.jsonl`, verbatim with its refcode, and passes the frame's verifier.
- **Frame from the corpus.** The spine of the script (what the doctrine is, what it includes, in what order) is read from the topic file and the pioneers in context, never from a familiar summary. Where they differ, follow the corpus and name the difference in the topic file.
- **A gap stays a gap.** A claim the corpus does not support is cut or marked unverified; memory never fills it.

## Steps

0. **Tools.** `bun run doctor` (with `dangerouslyDisableSandbox: true`) says whether headless Chromium and the logged-in `elevenlabs` CLI are there, and how to fix each that is not. `narrate` and `score` check the `elevenlabs` login before spending a credit.

1. **Frame and sources.**
   - Find the film's topic in [frame/README.md](frame/README.md). Read its 1889 principle and the topic file whole.
   - For anything the topic file lacks, build a corpus with `bible egw study <subject> --pioneers --export <file> --full`.
   - Copy each quote you will use into `src/films/<film>/sources.md`, verbatim and with its refcode. Add each one as a record to `src/films/<film>/quotes.jsonl`, and run the frame's verifier over that file (see **Verify** in the frame).
   - Done when every quote the script will speak or show verifies, and you can name, for the topic, what the film must show and what it must not say or show.

2. **Script.** Write `script.ts`: ordered beats `{ id, say, cite, picture }`. Put a `{mark}` before each word a picture must hit. Marks are stripped before speech, so adding one never re-records.
   - Write to [CRAFT.md](CRAFT.md) rules 2–4, 6, 7 and 11: one quotation per beat at most, each `picture` opening with its register, the motifs listed with their payoffs, the viewer's question at each turn, the landing at 70–84%, and the problem in small doses.
   - Hold every line against the topic's Film direction.
   - `bun run dev` plays undrawn beats as storyboard cards at estimated timing.
   - Done when the storyboard reads as the argument, start to finish, and quoted words make up 20% of the script or less.

3. **Voice.** `voice.ts` names one reader, or a cast whose first voice leads and whose second asks the viewer's question ([CRAFT.md](CRAFT.md) rule 6). A cast reads each beat as one text-to-dialogue take (`eleven_v3`, `stability` only), and it gets no neighbouring lines for context, so write each beat to stand on its own. `bun run narrate <film>` records stale beats and transcribes each take back. A take over 8% word error fails the run with `TakeMismatch` and is not kept: re-record it with `--only <id>`, or keep it with `--accept-mismatch` when the transcript is wrong and the take is right. `--dry-run` lists the stale beats without recording. Then read the seams from `bun run cues <film>` ([CRAFT.md](CRAFT.md) rule 9) and tighten each scene's `lead` and `tail`; that re-times the film without re-recording. Done when every beat is recorded with no mismatch and every seam is 0.6 s or less, except the pauses the script means.

4. **Scenes.** One `Drawing` per beat in `scenes/`, drawn to [CRAFT.md](CRAFT.md) rules 1, 3, 5 and 8: one text element at a time and never the narration, the beat's register, a face at human scale, and a callback in its earlier scene's layout. Pin every motion to a mark (`f.mark`, `f.spoken`), never to a hand-timed second. A moment anything else reads (a sound, another cue) is declared once as a named cue: `drawing({ timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35 } }, draw })`, read with `f.at('slam')` (eased by the span's `ease`, data like the rest of the span; `f.at` takes no ease) or `f.cue('slam')`. Never repeat its time elsewhere. A position or angle a review may tweak is a knob: `knobs: { palm: [960, 800] }`, read with `f.knob('palm')`. For many scenes, fork agents in parallel: each gets its own `scenes/group-N.ts` registry and `props-N.ts`, may not edit `packages/film/` (the engine), `kit.ts` or `scenes/index.ts`, and reports engine bugs rather than working around them. For depth, draw a shot as `multiplane` planes (the wall far, the people near) rather than one flat layer; a camera move then shows parallax. A hand that must land on something (holding, lifting, reaching out) takes a target point and the kit's `reach` solves the arm. Settle the look across scenes with `bun run lookbook <film>` (Lab loop, step 0) before refining any one. Done when no beat plays as a storyboard card.

5. **Review.** `bun run check <film>` first: it samples every mark, cue edge and 60% point and fails on text over text (captions and cite tags included), text cut off by the frame, a stroke through a line of text (`InkOverText`), a text plate the frame crops (`PlateOffFrame`), cues past their scene, unknown sound cues, stale takes or sound, and an audio master that is missing or not the film's length. `--scene id,id` probes just those scenes; a misspelt id fails with `UnknownScene`. Fix each finding in the scene, or, when the scene is right and the finding is wrong, tighten the detector in `packages/film/src/tools/check.ts` (never add an exception for one film). A text on a plate declares the plate with `probePlate`. Then, for the look: `bun run render <film> --scene <id> --contact 1.5 --tag <tag>` and full-size `--stills <t>` at the marks; read the images. A stroke that marks a line on purpose (underline, swash, ring, strike) declares `marks: '<text>'` in its style. The check samples moments, not every frame: a ring sweeping through a quote between two marks is still found by eye. Last, hold each contact sheet against the topic's MUST NOT SAY-OR-SHOW, because a picture teaches as loudly as a line does: for example, Christ's work closing at the cross, or a soul rising at death. Done when `check` is green, every contact sheet reads well, and no frame shows what the frame forbids.

6. **Sound.** Declare music acts and effects in `sound.ts`, then `bun run score <film>`. An effect that hits a picture event references the scene's cue, `{ scene, cue, edge: 'start' | 'end' }`, never a `mark + offset` copy of the scene's arithmetic; only scene-start sounds (page, slide) take `{ scene, offset }`. `bun run cues <film> --sound` prints every placement's film time. Place effects on the story's concrete nouns, not the medium's page turns ([CRAFT.md](CRAFT.md) rule 10). Balance by the `mix.levels` lines `bun run mix <film>` logs (each bus's mean and peak dBFS over the film). `--stems` writes each bus the film's length, to hear alone.
   - The bed sits 17 to 20 dB under the voice wherever anyone speaks, short gaps included.
   - Music comes up to about 6 dB under the voice only where no one speaks: the landing's 25 to 35 s, and an optional open.
   - The low end swells on the problem and the climax.
   - Done when the stems measure in range and the score transcribes as instrumental (`elevenlabs speech-to-text convert --model-id scribe_v1`).

7. **Render.** `bun run render <film> --no-captions` (the captions ship as the `.vtt`; [CRAFT.md](CRAFT.md) rule 1) takes about two minutes for a six-minute film (each page encodes H.264 on the GPU) and writes the master (about 1.6 GB), a share copy `out/<film>.share.mp4` (about 160 MB) encoded in the same pass, and `out/<film>.vtt` captions. It takes its audio from `narration/full.wav`; if a render stops with `AudioMissing` or `AudioStale` (a mix cut short, or made before a re-timing), run `bun run mix <film>` (free). Ctrl-C is safe: the render's scope closes every page, the browser and the server. Write a contact sheet with `bun run render <film> --contact 6` (`out/<film>/contact.jpg`, drawn by the same pages), read it, then `open` the MP4 for the user. Done when the sheet shows every scene and the file plays.

## Lab loop

The user reviews in the lab and the agent answers each note with the frame after the change.

0. **Look-book first, for a new film.** Before building a new film's scenes (and again once the first few exist), `bun run lookbook <film>` writes `out/<film>/lookbook.jpg`: the palette as swatches, then each scene's row of stills at every cue's start (▸) and end (◂) and its 60% point, labelled. Read it as an image and settle the look (palette, figure scale, type, where text sits) across scenes before refining any one of them. The lab's **Look-book** link (panel header, `?film=<film>&lab&lookbook`) composes the same sheet live from the code as it is now; a click on a still opens that frame in the lab. `--captions` burns captions in.
1. **Open it.** `bun run lab <film>` (background, `dangerouslyDisableSandbox: true`) prints `http://127.0.0.1:4401/?film=<film>&lab` (it listens on the loopback interface only, and its API answers only its own page: same-origin JSON writes); hand the URL to the user. It runs until Ctrl-C and hot-reloads scenes as they change.
2. **Watch.** List first, then watch from the cursor the list printed, so nothing made between the two is lost:
   - `bun run notes <film>` (in `apps/animations`) prints each open note, then `cursor seq=<N>` as its last line.
   - Start a Monitor on `bun run notes <film> --watch --since <N>`. Its first line is `watch since=<N>`; then each new note and each user reply arrives once as a line, and every line carries its change number: `note id=n3 seq=3 status=open scene=hand T=230.38 frame=6911 cue=topple:end mark=hand box=760,560,400x400 … still=/…/stills/n3.png text="…"`, `reply id=n3 seq=5 by=user …`.
   - **Resume** a Monitor that stopped (or the session that ran it) with `--since <the last seq= it printed>`: nothing is printed twice and nothing made while it was down is skipped. `--since 0` replays everything.
3. **Read the note.** Read the `still` as an image; the box (canvas pixels, a pin is `w`×`h` 0) and the nearest cue and mark say where and when. A timing note is a cue's `offset`/`dur`/`ease`; a position is a knob. If the value is still a constant, promote it to a knob or a cue first (a one-line change that draws the same frame).
4. **Change it.** Timing and position are data, and the lab writes data to source:
   - **Cues**: drag a cue on the strip under the timeline (body = offset, edges = start/end; snaps to words, marks and frames, shift for free) or set `offset`, `dur` and `ease` in the inspector (each ease's curve is drawn).
   - **Knobs**: number inputs, and a handle on the frame for a point knob. The handle follows the knob through the canvas transform it was read under (inside `at(...)`, scaled, tilted), and a drag maps back into the knob's own units, so drag it where it is drawn. A knob read inside a transition's layer, or under two transforms in one frame, gets numbers only; the inspector says why.
   - Each release rewrites the literal in the scene's `.ts` file (oxfmt'd, read back) and the page reloads at the same `T` and selection. The lab refuses a value that is not a literal and names it; **Undo write** puts the last write back once.
   - Review every write with `git diff -- src/films/<film>/scenes/`; the diff is the record of what changed.
   - Anything else (drawing, layout, a new element): edit the scene code yourself.
5. **See the motion, not just the frame.** In the panel's **Motion** section: **Onion** ghosts the frames around the one shown (± count, every N frames; warm before, cool after) to judge an arc or spacing on a paused frame; **0.25× / 0.5×** slow the clock (narration mutes off 1×); **loop cue** loops the cue selected on the strip (a very short cue gets padding either side), **A / B** loop any range. Use them for any timing or easing note before and after the change.
6. **Compare with HEAD.** The panel's **Compare** section draws the same frame as HEAD declared the scene's timeline and knobs: **wipe** puts HEAD left of a draggable divider and now to its right, **blink** flips between them. It compares data only; when the scene's code changed since HEAD the panel says so, and for a code change render stills instead.
7. **Check after every edit.** The lab runs `film check --static` after each write and lists its findings in the panel. After editing code, run `bun run check <film> --scene <id>` (the layout leg: `TextOverlap`, `TextOffFrame`, `InkOverText`, `PlateOffFrame`) and fix what it finds before answering.
8. **Prove it.** Render the note's frame: `bun run render <film> --stills <T> --tag lab-<id>`, and read the after-still as an image. It must show the note's problem gone, at the note's `T`.
9. **Answer.** `bun run notes reply <film> <id> "what changed" --still out/<film>/lab-<id>/stills/t0230.38.png` (a still is named by its time, zero-padded to seven characters with two decimals: 8.14 s is `t0008.14.png`, 230.38 s is `t0230.38.png`). The lab shows the reply and the still at once; the note becomes `replied`. The user resolves it in the lab (or replies, which reopens it, and the Monitor hands it back). `bun run notes resolve <film> <id>` only when the user said OK.

## Speed

A change to the draw path or the render claims its speed with `bun run bench <film>` (`dangerouslyDisableSandbox: true`), before and after: ms of draw per frame per scene, the median of `--runs`, written to `out/<film>/bench.json`. Before the change, `bun run bench <film> --hash --baseline` keeps a baseline; after it, `bun run bench <film> --hash --budget` fails when a scene or the film draws more than 10% slower, or a hashed frame's pixels moved (a change meant to be pixel-identical is proved there). The baseline and the run must agree on `--hash` and on `--no-captions` (captions are drawn by default, as a render burns them in); otherwise the run fails with `BaselineUnhashed` or `BaselineIncomparable` rather than passing unchecked. Numbers compare only on one machine and under the same load: other renders running at once move them. `--workers 4,6,7 --scene id,id` times whole renders of a range per page count instead. A render runs one hardware encoder a page, two with the share copy; past 14 the encoder hangs, so `render` and `bench --workers` fail with `TooManyEncoders` first.

## Gotchas

- **Parallel renders share the encoder.** `TooManyEncoders` counts one render's pages only (one encoder a page, two with the share copy, at most 14). Two renders at once can pass it and still hang together: keep their pages within 14 in sum, or run them one after the other.
- **Playwright browser missing**: `render` fails with `BrowserMissing`, whose message is the exact install command for the installed playwright-core (the cache in `~/Library/Caches/ms-playwright` was wiped). Run it with `dangerouslyDisableSandbox: true`.
- **Sound effects return 401** under the CLI's OAuth login, which covers speech, speech-to-text and music only. Effects need `ELEVENLABS_API_KEY` in the environment or in the Keychain under that service name; `score` skips them without one. The OAuth token also cannot create keys.
- **Music plans:** `music_v2` and `music_v2_5` take `{ chunks: [...] }`; a v1 `sections` plan fails with "Invalid type of composition_plan".
- **Timing changes:** changing a scene's `lead`, `tail` or `min` moves every later scene. Remix with `bun run mix <film>` (no API cost); the score goes stale and `score` regenerates it.
- **`math` (pmndrs) stays behind the kit.** It is pinned and reached only through engine and kit functions (`reach` over `math/ik`; the normals of `stroke` and `cutout` over `vec2.normalize`), never from a scene. Its `spring` is stepped by a delta, so it has no place in a draw, which must be a pure function of `f.t`; the kit keeps its own `random.ts`, which every committed frame depends on.
- **Faces read as cross by default.** Level brows on a small grey head look stern; a face meant curious, hopeful or tender raises the inner ends (`browTilt` > 0 in a film kit's `person`). Check faces at full size (`--stills`), not only on the contact sheet.
- **Shell loops:** zsh does not word-split `$var`; run loops over time windows with `bash -c`.
- **Commits:** the pre-commit hook runs the whole repo gate (about 20 s). Check a staged subset on its own with `git checkout-index -a --prefix=<dir>/`, then symlink the root and app `node_modules` into it.
