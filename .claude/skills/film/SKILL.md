---
name: film
description: >
  Make or change a narrated explainer film in apps/animations (cut-paper
  Canvas films, BibleProject-style): source-checked script, ElevenLabs
  narration, drawn scenes, score and effects, review renders, MP4 export. Use
  when asked for an animation, explainer video, or film; when editing a film's
  script, scenes, timing, voice, music or sound; or when a render, narrate or
  score run fails.
---

# Film

A film lives in `apps/animations/src/films/<film>/`. The engine is the `@bible/film` package (`packages/film`). Its API, the film folder layout and every command are in `apps/animations/README.md`: read it before the first edit. This skill is the workflow and the gotchas the README cannot show.

Every ElevenLabs call and every render needs `dangerouslyDisableSandbox: true` (the CLI's login sits in the Keychain; Chromium sits in `~/Library/Caches/ms-playwright`).

## Steps

0. **Tools.** `bun run doctor` (with `dangerouslyDisableSandbox: true`) says whether headless Chromium and the logged-in `elevenlabs` CLI are there, and how to fix each that is not. `narrate` and `score` check the `elevenlabs` login before spending a credit.

1. **Sources.** Build the corpus with `bible egw study <subject> --pioneers --export <file> --full`. Copy each quote you will use into `apps/animations/script/sources.md` verbatim, with its refcode, after checking it against the local database. Done when every quote the script will speak or show has a checked row.

2. **Script.** Write `script.ts`: ordered beats `{ id, say, cite, picture }`. Put a `{mark}` before each word a picture must hit. Marks are stripped before speech, so adding one never re-records. `bun run dev` plays undrawn beats as storyboard cards at estimated timing. Done when the storyboard reads as the argument, start to finish.

3. **Voice.** `bun run narrate <film>` records stale beats and transcribes each take back. A take over 8% word error fails the run with `TakeMismatch` and is not kept: re-record it with `--only <id>`, or keep it with `--accept-mismatch` when the transcript is wrong and the take is right. `--dry-run` lists the stale beats without recording. Done when every beat is recorded with no mismatch.

4. **Scenes.** One `Drawing` per beat in `scenes/`. Pin every motion to a mark (`f.mark`, `f.spoken`), never to a hand-timed second. A moment anything else reads (a sound, another cue) is declared once as a named cue: `drawing({ timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35 } }, draw })`, read with `f.at('slam')` (eased by the span's `ease`, data like the rest of the span; `f.at` takes no ease) or `f.cue('slam')`. Never repeat its time elsewhere. A position or angle a review may tweak is a knob: `knobs: { palm: [960, 800] }`, read with `f.knob('palm')`. For many scenes, fork agents in parallel: each gets its own `scenes/group-N.ts` registry and `props-N.ts`, may not edit `packages/film/` (the engine), `kit.ts` or `scenes/index.ts`, and reports engine bugs rather than working around them. Settle the look across scenes with `bun run lookbook <film>` (Lab loop, step 0) before refining any one. Done when no beat plays as a storyboard card.

5. **Review.** `bun run check <film>` first: it samples every mark, cue edge and 60% point and fails on text over text (captions and cite tags included), text cut off by the frame, a stroke through a line of text (`InkOverText`), a text plate the frame crops (`PlateOffFrame`), cues past their scene, unknown sound cues, stale takes or sound, and an audio master that is missing or not the film's length. `--scene id,id` probes just those scenes; a misspelt id fails with `UnknownScene`. Fix each finding in the scene, or, when the scene is right and the finding is wrong, tighten the detector in `packages/film/src/tools/check.ts` (never add an exception for one film). A text on a plate declares the plate with `probePlate`. Then, for the look: `bun run render <film> --scene <id> --contact 1.5 --tag <tag>` and full-size `--stills <t>` at the marks; read the images. A stroke that marks a line on purpose (underline, swash, ring, strike) declares `marks: '<text>'` in its style. The check samples moments, not every frame: a ring sweeping through a quote between two marks is still found by eye. Done when `check` is green and every contact sheet reads well.

6. **Sound.** Declare music acts and effects in `sound.ts`, then `bun run score <film>`. An effect that hits a picture event references the scene's cue, `{ scene, cue, edge: 'start' | 'end' }`, never a `mark + offset` copy of the scene's arithmetic; only scene-start sounds (page, slide) take `{ scene, offset }`. `bun run cues <film> --sound` prints every placement's film time. Balance by the `mix.levels` lines `bun run mix <film>` logs (each bus's mean and peak dBFS over the film): the voice sits near -23 dB mean, the bed about 16 dB under it during speech and about 7 dB under it between lines; `--stems` writes each bus the film's length, to hear alone. Done when the stems measure in range and the score transcribes as instrumental (`elevenlabs speech-to-text convert --model-id scribe_v1`).

7. **Render.** `bun run render <film>` takes about two minutes for a six-minute film (each page encodes H.264 on the GPU) and writes the master (about 1.6 GB), a share copy `out/<film>.share.mp4` (about 160 MB) encoded in the same pass, and `out/<film>.vtt` captions. It takes its audio from `narration/full.wav`; if a render stops with `AudioMissing` or `AudioStale` (a mix cut short, or made before a re-timing), run `bun run mix <film>` (free). Ctrl-C is safe: the render's scope closes every page, the browser and the server. Write a contact sheet with `bun run render <film> --contact 6` (`out/<film>/contact.jpg`, drawn by the same pages), read it, then `open` the MP4 for the user. Done when the sheet shows every scene and the file plays.

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

## Gotchas

- **Playwright browser missing**: `render` fails with `BrowserMissing`, whose message is the exact install command for the installed playwright-core (the cache in `~/Library/Caches/ms-playwright` was wiped). Run it with `dangerouslyDisableSandbox: true`.
- **Sound effects return 401** under the CLI's OAuth login, which covers speech, speech-to-text and music only. Effects need `ELEVENLABS_API_KEY` in the environment or in the Keychain under that service name; `score` skips them without one. The OAuth token also cannot create keys.
- **Music plans:** `music_v2` and `music_v2_5` take `{ chunks: [...] }`; a v1 `sections` plan fails with "Invalid type of composition_plan".
- **Timing changes:** changing a scene's `lead`, `tail` or `min` moves every later scene. Remix with `bun run mix <film>` (no API cost); the score goes stale and `score` regenerates it.
- **Shell loops:** zsh does not word-split `$var`; run loops over time windows with `bash -c`.
- **Commits:** the pre-commit hook runs the whole repo gate (about 20 s). Check a staged subset on its own with `git checkout-index -a --prefix=<dir>/`, then symlink the root and app `node_modules` into it.
