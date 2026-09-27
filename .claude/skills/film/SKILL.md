---
name: film
description: >
  Make or change a narrated explainer film in apps/animations (BibleProject-style
  films drawn in Rive): source-checked script, ElevenLabs narration, Rive
  scenes, score and effects, review renders, MP4 export. Use when asked for an
  animation, explainer video, or film; when editing a film's script, scenes,
  timing, voice, music or sound; or when a sync, render, narrate or score run
  fails; or when checking a film's doctrine against the pioneer (1889) frame.
---

# Film

A film lives in `apps/animations/src/films/<film>/`: its words, voice and sound as TypeScript data, and its pictures as a Rive project in `rive/`, one artboard per beat. The tools are the `@bible/film` package (`packages/film`). The film folder, every command and how the clock works are in `apps/animations/README.md`; how the Rive project is timed, synced and rendered is in `packages/film/README.md`. Read both before the first edit. This skill is the workflow and the gotchas they cannot show. Two references sit beside it:

- **[frame/README.md](frame/README.md)** is the doctrine: the 1889 Fundamental Principles verbatim, and a source-checked topic file for each doctrine, with what a film must show and must not say or show. A film's doctrine comes from these texts, never from memory.
- **[CRAFT.md](CRAFT.md)** is how a film carries its argument: text on screen, quoting, the STORY and IDEA registers, human scale, the shape in time, pauses, sound and tone. It was measured from BibleProject films.

Every ElevenLabs call, every `rive` call and every render needs `dangerouslyDisableSandbox: true` (the logins sit in the Keychain; Chromium sits in `~/Library/Caches/ms-playwright`).

## Steps

0. **Tools.** `bun run doctor` says whether headless Chromium, the logged-in `elevenlabs` CLI and the `rive` CLI are there, and how to fix each that is not. Only `sync --push`/`--pull` need `rive login`. `narrate` and `score` check the `elevenlabs` login before spending a credit.

1. **Frame and sources.**
   - Find the film's topic in [frame/README.md](frame/README.md). Read its 1889 principle and the topic file whole.
   - For anything the topic file lacks, build a corpus with `bible egw study <subject> --pioneers --export <file> --full`.
   - Copy each quote you will use into the film's `sources.md`, verbatim and with its refcode. Add each one as a record to `quotes.jsonl`, and run the frame's verifier over that file (see **Verify** in the frame).
   - Done when every quote the script will speak or show verifies, and you can name, for the topic, what the film must show and what it must not say or show.

2. **Script.** Write `script.ts`: ordered beats `{ id, say, cite, picture }`. Put a `{mark}` before each word a picture must hit. Marks are stripped before speech, so adding one never re-records.
   - Write to [CRAFT.md](CRAFT.md) rules 2–4, 6, 7 and 11: one quotation per beat at most, each `picture` opening with its register, the motifs listed with their payoffs, the viewer's question at each turn, the landing at 70–84%, the tone informative and hopeful.
   - Hold every line against the topic's Film direction.
   - `bun run sync <film>` seeds a storyboard artboard per beat (its brief, and each mark named as it is spoken, on estimated timing); `rive src/films/<film>/rive` plays the whole Film in a window, and a `--contact 6` render reads it as one sheet.
   - Done when the storyboard reads as the argument, start to finish, and quoted words make up 20% of the script or less.

3. **Voice.** `bun run narrate <film>` records stale beats and transcribes each take back. A take over 8% word error fails the run with `TakeMismatch` and is not kept: re-record it with `--only <id>`, or keep it with `--accept-mismatch` when the transcript is wrong and the take is right. `--dry-run` lists the stale beats without recording. Then read the seams from `bun run cues <film>` ([CRAFT.md](CRAFT.md) rule 9) and tighten each scene's `lead` and `tail`; that re-times the film without re-recording. `sync` again after any take or timing change: the Film follows. Done when every beat is recorded with no mismatch and every seam is 0.6 s or less, except the pauses the script means.

4. **Scenes.** Draw each beat's artboard in `rive/scenes/<beat>.rml` to the film's `art.md` and [CRAFT.md](CRAFT.md) rules 1, 3, 5 and 8: one text element at a time and never the narration, the beat's register, a face at human scale, and a callback built from its earlier scene's components.
   - **Keep the contract** the storyboard set up: the artboard keeps the beat's name and stays a component; its `main` timeline keeps one Event per `{mark}`, named after it and in the marks' order. Replace the node named `storyboard` and its keys; keep the Events. Key every motion relative to its Event on `main`, at whatever pace looks right: the warp lands each Event on its word.
   - **A moment a sound plays on** is an Event on `main` too, with its own name; `sound.ts` names it with `{ scene, event }`.
   - **Look things up, don't guess:** `rive schema <Type>` gives an element's properties, `rive docs` the concepts; `rive <dir>` previews as you write. A drawing may also be done in the editor: `sync --push`, draw, commit, `sync --pull`, then read the RML diff.
   - For many scenes, fork agents in parallel, each owning its own `scenes/<beat>.rml` files; none edits `film.rml`, `assets.rml` or `packages/film/`. Each reports tool bugs rather than working around them. Settle the look on two or three scenes, with a contact sheet over them, before the rest.
   - Done when `check` reports no `SceneUndrawn`.

5. **Review.** `bun run sync <film>` then `bun run check <film>`: it reports every missing, non-component or undrawn scene, a mark with no Event or Events out of order, a Film out of date, what the Rive compiler reports at `file:line`, and the film's own findings (stale takes and sound, unknown sound cues, an audio master not the film's length). `--scene id,id` checks just those beats; a misspelt id fails with `UnknownScene`. Fix each finding in the scene, or, when the scene is right and the finding is wrong, tighten the check in `packages/film/src/tools/check.ts` (never add an exception for one film). Then, for the look: `bun run render <film> --scene <id> --contact 1.5 --tag <tag>` and full-size `--stills <t>` at the marks (`cues` prints each Event's time); read the images. Text over text and text cut by the frame are found by eye here. Last, hold each contact sheet against the topic's MUST NOT SAY-OR-SHOW, because a picture teaches as loudly as a line does: for example, Christ's work closing at the cross, or a soul rising at death. Done when `check` is green, every contact sheet reads well, and no frame shows what the frame forbids.

6. **Sound.** Declare music acts and effects in `sound.ts`, then `bun run score <film>`. An effect that hits a picture moment names the scene's Event, `{ scene, event }`, never an offset copying the drawing's timing; only scene-start sounds (page, slide) take `{ scene, offset }`. `bun run cues <film> --sound` prints every placement's film time. Place effects on the story's concrete nouns, not the medium's page turns ([CRAFT.md](CRAFT.md) rule 10). Balance by the `mix.levels` lines `bun run mix <film>` logs (each bus's mean and peak dBFS over the film). `--stems` writes each bus the film's length, to hear alone.
   - The bed sits 17 to 20 dB under the voice wherever anyone speaks, short gaps included.
   - Music comes up to about 6 dB under the voice only where no one speaks: the landing's 25 to 35 s, and an optional open.
   - The low end swells on the problem and the climax.
   - `sync` afterwards puts the mix in the Film, so the editor and `rive <dir>` play it.
   - Done when the stems measure in range and the score transcribes as instrumental (`elevenlabs speech-to-text convert --model-id scribe_v1`).

7. **Render.** `bun run render <film>` builds the project and draws it in parallel headless pages (each encoding H.264 on the GPU), writing the master, a share copy `out/<film>.share.mp4` in the same pass, and `out/<film>.vtt` captions ([CRAFT.md](CRAFT.md) rule 1: captions are never drawn). It refuses a Film out of date (`FilmStale`: run `sync`) and takes its audio from `narration/full.wav` once every take is recorded; `AudioMissing` or `AudioStale` means run `bun run mix <film>` (free). Ctrl-C is safe: the render's scope closes every page, the browser and the server. Write a contact sheet with `bun run render <film> --contact 6`, read it, then `open` the MP4 for the user. Done when the sheet shows every scene drawn and the file plays.

## Review with the user

The user reviews in the Rive editor or in the preview window, and the agent answers each note with the frame after the change.

1. **Share it.** `bun run sync <film> --push` (first time: `--project <id>`) puts the project in the user's Rive file; `rive src/films/<film>/rive` opens the preview window locally. Commit the project first, so a later pull has a clean base.
2. **Take the note.** A note names a scene and a moment (a mark or a film time from `cues`). A timing note is a key's time relative to its Event on `main`; a position is a property in the scene's RML.
3. **Change it** in the RML, or have the user change it in the editor and `sync --pull` (refused while git has uncommitted changes under `rive/`). Review every change with `git diff -- src/films/<film>/rive/scenes/`; the diff is the record of what changed.
4. **Prove it.** `sync`, `check --scene <id>`, then `bun run render <film> --stills <T> --tag note-<n>`, and read the after-still as an image. It must show the note's problem gone, at the note's time. Hand the user the still's path.

## Gotchas

- **Rive's markup:** every `.rml` file is wrapped in `<Rive version="1" kind="fragment">`; never write a `<Backboard>` (a project with no artboards reports `missing-backboard` for that reason alone). A `FontAsset` is a root element of `assets.rml`, and a font file sits in `rive/fonts/`.
- **`film.rml` is generated.** `sync` rewrites it from the layout; an edit to it is lost. Change the script's `lead`, `tail`, `min` or `enter`, or the scene, instead.
- **A storyboard's file is its beat's.** `sync` never writes over a scene file; renaming the artboard inside `open.rml` fails the next sync with `SceneFileTaken`. Keep one artboard per file, named after the beat.
- **Playwright browser missing:** `render` fails with `BrowserMissing`, whose message is the exact install command. Run it with `dangerouslyDisableSandbox: true`.
- **Sound effects return 401** under the CLI's OAuth login, which covers speech, speech-to-text and music only. Effects need `ELEVENLABS_API_KEY` in the environment or in the Keychain under that service name; `score` skips them without one.
- **Music plans:** `music_v2` and `music_v2_5` take `{ chunks: [...] }`; a v1 `sections` plan fails with "Invalid type of composition_plan".
- **Timing changes:** changing a scene's `lead`, `tail` or `min` moves every later scene. `sync` and remix with `bun run mix <film>` (no API cost); the score goes stale and `score` regenerates it.
- **Shell loops:** zsh does not word-split `$var`; run loops over time windows with `bash -c`.
- **Commits:** the pre-commit hook runs the whole repo gate (about 20 s).
