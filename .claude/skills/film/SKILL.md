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

0. **Tools.** `bun run doctor` (with `dangerouslyDisableSandbox: true`) says whether ffmpeg, headless Chromium and the logged-in `elevenlabs` CLI are there, and how to fix each that is not. `narrate` and `score` run the same checks before spending a credit.

1. **Sources.** Build the corpus with `bible egw study <subject> --pioneers --export <file> --full`. Copy each quote you will use into `apps/animations/script/sources.md` verbatim, with its refcode, after checking it against the local database. Done when every quote the script will speak or show has a checked row.

2. **Script.** Write `script.ts`: ordered beats `{ id, say, cite, picture }`. Put a `{mark}` before each word a picture must hit. Marks are stripped before speech, so adding one never re-records. `bun run dev` plays undrawn beats as storyboard cards at estimated timing. Done when the storyboard reads as the argument, start to finish.

3. **Voice.** `bun run narrate <film>` records stale beats and transcribes each take back. A take over 8% word error fails the run with `TakeMismatch` and is not kept: re-record it with `--only <id>`, or keep it with `--accept-mismatch` when the transcript is wrong and the take is right. `--dry-run` lists the stale beats without recording. Done when every beat is recorded with no mismatch.

4. **Scenes.** One `Drawing` per beat in `scenes/`. Pin every motion to a mark (`f.mark`, `f.spoken`), never to a hand-timed second. A moment anything else reads (a sound, another cue) is declared once as a named cue: `drawing({ timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35 } }, draw })`, read with `f.at('slam')` (eased by the span's `ease`, data like the rest of the span; `f.at` takes no ease) or `f.cue('slam')`. Never repeat its time elsewhere. A position or angle a review may tweak is a knob: `knobs: { palm: [960, 800] }`, read with `f.knob('palm')`. For many scenes, fork agents in parallel: each gets its own `scenes/group-N.ts` registry and `props-N.ts`, may not edit `packages/film/` (the engine), `kit.ts` or `scenes/index.ts`, and reports engine bugs rather than working around them. Done when no beat plays as a storyboard card.

5. **Review.** `bun run check <film>` first: it samples every mark, cue edge and 60% point and fails on text over text (captions and cite tags included), text cut off by the frame, a stroke through a line of text (`InkOverText`), a text plate the frame crops (`PlateOffFrame`), cues past their scene, unknown sound cues, stale takes or sound, and an audio master that is missing or not the film's length. `--scene id,id` probes just those scenes; a misspelt id fails with `UnknownScene`. Fix each finding in the scene, or, when the scene is right and the finding is wrong, tighten the detector in `packages/film/src/tools/check.ts` (never add an exception for one film). A text on a plate declares the plate with `probePlate`. Then, for the look: `bun run render <film> --scene <id> --contact 1.5 --tag <tag>` and full-size `--stills <t>` at the marks; read the images. A stroke that marks a line on purpose (underline, swash, ring, strike) declares `marks: '<text>'` in its style. The check samples moments, not every frame: a ring sweeping through a quote between two marks is still found by eye. Done when `check` is green and every contact sheet reads well.

6. **Sound.** Declare music acts and effects in `sound.ts`, then `bun run score <film>`. An effect that hits a picture event references the scene's cue, `{ scene, cue, edge: 'start' | 'end' }`, never a `mark + offset` copy of the scene's arithmetic; only scene-start sounds (page, slide) take `{ scene, offset }`. `bun run cues <film> --sound` prints every placement's film time. Balance with `bun run mix <film> --stems` and `volumedetect`: the voice sits near -23 dB mean, the bed about 16 dB under it during speech and about 7 dB under it between lines. Done when the stems measure in range and the score transcribes as instrumental (`elevenlabs speech-to-text convert --model-id scribe_v1`).

7. **Render.** `bun run render <film> --workers 6` takes about 10 minutes and writes about 1 GB, plus `out/<film>.vtt` captions. It takes its audio from `narration/full.wav`; if a render stops with `AudioMissing` or `AudioStale` (a mix cut short, or made before a re-timing), run `bun run mix <film>` (free). Ctrl-C is safe: the render's scope closes every page, the browser, the server and kills every ffmpeg. Re-encode a share copy (`-crf 22 -preset slow -tune animation`), pull a frame sheet from the MP4 (`fps=1/6,tile=8x8`), read it, then `open` the MP4 for the user. Done when the sheet shows every scene and the file plays.

## Lab loop

The user reviews in the lab and the agent answers each note with the frame after the change.

1. **Open it.** `bun run lab <film>` (background, `dangerouslyDisableSandbox: true`) prints `http://localhost:4401/?film=<film>&lab`; hand the URL to the user. It runs until Ctrl-C and hot-reloads scenes as they change.
2. **Watch.** Start a Monitor on `bun run notes <film> --watch` (in `apps/animations`). Each new note and each user reply arrives once as a line: `note id=n3 status=open scene=hand T=230.38 frame=6911 cue=topple:end mark=hand box=760,560,400x400 … still=/…/stills/n3.png text="…"`. Notes made before the watch started are not replayed: list them first with `bun run notes <film>` (the log line gives the `cursor`; `--since 0` replays everything).
3. **Read the note.** Read the `still` as an image; the box (canvas pixels, a pin is `w`×`h` 0) and the nearest cue and mark say where and when. A timing note is a cue's `offset`/`dur`/`ease`; a position is a knob. If the value is still a constant, promote it to a knob or a cue first (a one-line change that draws the same frame).
4. **Change it and prove it.** For timing and position the user can do it themselves: drag cues in the lab; each release writes to the scene file; review with git diff (`git diff -- src/films/<film>/scenes/`). The lab refuses a value that is not a literal and says which; `film check --static` runs after each write and its findings show in the panel. Otherwise edit the scene, then `bun run render <film> --stills <T> --tag lab-<id>` and read the after-still.
5. **Answer.** `bun run notes reply <film> <id> "what changed" --still out/<film>/lab-<id>/stills/t<T>.png`. The lab shows the reply and the still at once; the note becomes `replied`. The user resolves it in the lab (or replies, which reopens it); `bun run notes resolve <film> <id>` when the user said so.

## Gotchas

- **Playwright browser missing**: `render` fails with `BrowserMissing`, whose message is the exact install command for the installed playwright-core (the cache in `~/Library/Caches/ms-playwright` was wiped). Run it with `dangerouslyDisableSandbox: true`.
- **Sound effects return 401** under the CLI's OAuth login, which covers speech, speech-to-text and music only. Effects need `ELEVENLABS_API_KEY` in the environment or in the Keychain under that service name; `score` skips them without one. The OAuth token also cannot create keys.
- **Music plans:** `music_v2` and `music_v2_5` take `{ chunks: [...] }`; a v1 `sections` plan fails with "Invalid type of composition_plan".
- **Timing changes:** changing a scene's `lead`, `tail` or `min` moves every later scene. Remix with `bun run mix <film>` (no API cost); the score goes stale and `score` regenerates it.
- **Shell loops:** zsh does not word-split `$var`; run loops over time windows with `bash -c`.
- **Commits:** the pre-commit hook runs the whole repo gate (about 20 s). Check a staged subset on its own with `git checkout-index -a --prefix=<dir>/`, then symlink the root and app `node_modules` into it.
