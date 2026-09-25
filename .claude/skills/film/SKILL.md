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

4. **Scenes.** One `Drawing` per beat in `scenes/`. Pin every motion to a mark (`f.mark`, `f.spoken`), never to a hand-timed second. A moment anything else reads (a sound, another cue) is declared once as a named cue: `drawing({ timeline: { slam: { mark: 'fiction', offset: 0.9, dur: 0.35 } }, draw })`, read with `f.at('slam', ease)` or `f.cue('slam')`. Never repeat its time elsewhere. For many scenes, fork agents in parallel: each gets its own `scenes/group-N.ts` registry and `props-N.ts`, may not edit `packages/film/` (the engine), `kit.ts` or `scenes/index.ts`, and reports engine bugs rather than working around them. Done when no beat plays as a storyboard card.

5. **Review.** `bun run check <film>` first: it samples every mark, cue edge and 60% point and fails on text over text (captions and cite tags included), text cut off by the frame, cues past their scene, unknown sound cues and stale takes or sound. Fix each finding in the scene, or, when the scene is right and the finding is wrong, tighten the detector in `packages/film/src/tools/check.ts` (never add an exception for one film). A text on a plate declares the plate with `probePlate`. Then, for the look: `bun run render <film> --scene <id> --contact 1.5 --tag <tag>` and full-size `--stills <t>` at the marks; read the images. The check does not see strokes: a thread or prop crossing a quote is still found by eye. Done when `check` is green and every contact sheet reads well.

6. **Sound.** Declare music acts and effects in `sound.ts`, then `bun run score <film>`. An effect that hits a picture event references the scene's cue, `{ scene, cue, edge: 'start' | 'end' }`, never a `mark + offset` copy of the scene's arithmetic; only scene-start sounds (page, slide) take `{ scene, offset }`. `bun run cues <film> --sound` prints every placement's film time. Balance with `bun run mix <film> --stems` and `volumedetect`: the voice sits near -23 dB mean, the bed about 16 dB under it during speech and about 7 dB under it between lines. Done when the stems measure in range and the score transcribes as instrumental (`elevenlabs speech-to-text convert --model-id scribe_v1`).

7. **Render.** `bun run render <film> --workers 6` takes about 10 minutes and writes about 1 GB, plus `out/<film>.vtt` captions. It takes its audio from `narration/full.wav`; if a render stops with `AudioMissing`, run `bun run mix <film>` (free). Ctrl-C is safe: the render's scope closes every page, the browser, the server and kills every ffmpeg. Re-encode a share copy (`-crf 22 -preset slow -tune animation`), pull a frame sheet from the MP4 (`fps=1/6,tile=8x8`), read it, then `open` the MP4 for the user. Done when the sheet shows every scene and the file plays.

## Gotchas

- **Playwright browser missing**: `render` fails with `BrowserMissing`, whose message is the exact install command for the installed playwright-core (the cache in `~/Library/Caches/ms-playwright` was wiped). Run it with `dangerouslyDisableSandbox: true`.
- **Sound effects return 401** under the CLI's OAuth login, which covers speech, speech-to-text and music only. Effects need `ELEVENLABS_API_KEY` in the environment or in the Keychain under that service name; `score` skips them without one. The OAuth token also cannot create keys.
- **Music plans:** `music_v2` and `music_v2_5` take `{ chunks: [...] }`; a v1 `sections` plan fails with "Invalid type of composition_plan".
- **Timing changes:** changing a scene's `lead`, `tail` or `min` moves every later scene. Remix with `bun run mix <film>` (no API cost); the score goes stale and `score` regenerates it.
- **Shell loops:** zsh does not word-split `$var`; run loops over time windows with `bash -c`.
- **Commits:** the pre-commit hook runs the whole repo gate (about 20 s). Check a staged subset on its own with `git checkout-index -a --prefix=<dir>/`, then symlink the root and app `node_modules` into it.
