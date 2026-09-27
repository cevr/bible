# Animations

Narrated explainer films, BibleProject-style. A film's words, voice and sound
are TypeScript data here; its pictures are a [Rive](https://rive.app) project
beside them, one artboard per beat, drawn in RML or in the Rive editor. The
`film` CLI (`@bible/film/tools`, see [its README](../../packages/film/README.md))
times every scene to the recorded voice and renders the whole film to an MP4.

## Commands

```sh
bun run doctor                                 # headless Chromium, elevenlabs + login, rive + login
bun run narrate <film>                         # record stale beats, verify, remix full.wav
bun run score <film>                           # generate stale music + effects, remix full.wav
bun run mix <film> [--stems]                   # remix full.wav (no API): levels per bus; stems to out/<film>/stems
bun run sync <film> [--pull] [--push]          # seed storyboards, write the Film + soundtrack, build; move to/from the editor
bun run cues <film> [scene]                    # scene times, {mark} times, where each Event plays
bun run cues <film> [scene] --sound            # every effect placement's film time
bun run check <film> [--allow-stale] [--scene id,id]
bun run render <film>                          # out/<film>.mp4 + .share.mp4 + .vtt
bun run render <film> --contact 1 --from 0 --to 40   # contact sheet, a frame per second
bun run render <film> --stills 3,10.5          # PNG stills in out/<film>/stills/t0003.00.png ...
bun run render <film> --scene id[,id] ...      # any render, over those scenes
rive src/films/<film>/rive                     # live preview window of the Film, rebuilding as you edit
```

`bun cli.ts <command> --help` lists every flag. Narrate flags: `--only id,id`,
`--force`, `--dry-run`, `--accept-mismatch`. Score flags: `--only
music,<effect>` and `--dry-run`. `FILMS_OUT` overrides `out`. The app's
`gate` is typecheck and tests; `check` is a review step, not part of it.

## A film

```
src/films/<film>/
  script.ts        ordered beats: narration with {mark}s, cite, picture brief, lead/tail/min, enter
  voice.ts         one reader, or a cast in conversation (changing it re-records everything)
  sound.ts         music acts and effects, placed on scenes, marks and Events (optional)
  art.md           the film's colour script and type, what the scenes are drawn from
  quotes.jsonl     every quote the script uses, verified against the frame
  sources.md       the quotes verbatim with refcodes
  narration/       one take per beat + timings.json; full.wav (the mixed track) is derived
  sound/           generated score + effects, and manifest.json (their request hashes)
  rive/
    rive.yaml      the project (main: Film)
    assets.rml     font assets; fonts/ holds their files
    scenes/*.rml   one artboard per beat, named after it: drawn by hand or pulled from the editor
    film.rml       the Film: written by sync, never edited
    soundtrack.wav the preview track the Film plays (written by sync, git-ignored)
    build/         the built .riv (git-ignored)
```

**Narration drives the clock.** A scene lasts `lead + speech + tail`. Put a
`{mark}` before each word a picture must hit; marks are stripped before
speech, so adding one never re-records. Each mark is an Event of the same name
on the scene's `main` timeline, and the film warps the timeline so the Event
lands on the word. Draw a scene at the pace that looks right; the voice
decides when each moment plays. A storyboard, seeded by `sync` for every
undrawn beat, already carries those Events at their spoken times.

**A cast reads a film as a conversation.** `voice.ts` exports either one
reader (`{ voiceId, model, settings }`, recorded through text-to-speech) or a
cast (`{ model: 'eleven_v3', settings: { stability }, voices: [{ name, voiceId }, …] }`),
which records each beat as one text-to-dialogue take, so a question and its
answer share a take. The first voice reads until a line hands over with
`{@name}`: `"That's the law. {@ask}So where does that leave us? {@lead}Stuck."`.
A turn to a voice the cast lacks fails with `UnknownVoice`.

**Takes are content-addressed.** `narrate` hashes each beat's spoken text and
turns, re-records only beats that changed, transcribes every new take back,
and fails with `TakeMismatch` when a take is over 8% word error. A failed take
never replaces the current one; `--accept-mismatch` keeps it.

**Sound follows the same clock.** `sound.ts` declares the score as acts, each
starting at a scene, and effects placed at `{ scene, event }` (an Event the
scene's timeline fires, where the film plays it), `{ scene, mark }` or
`{ scene, offset }`, so a sound lands where the picture does and a re-recorded
line carries both. `score` sends the acts as one timed ElevenLabs composition
plan and generates each effect. Re-timing a scene makes the score stale; a
gain change only needs `mix`. Music works with the CLI's OAuth login; effects
need `ELEVENLABS_API_KEY` in the environment or the Keychain, and are skipped
without one. Balance against rule 10 of the film skill's
[CRAFT.md](../../.claude/skills/film/CRAFT.md).

**The editor is a round trip.** `sync --push` uploads the project to its Rive
file (`--project` names where a first push creates it); draw there; `sync
--pull` brings it back over `rive/`, refused while git has uncommitted changes
in it. Commit before a pull, and review the pulled RML with `git diff`.

## Tests

`test/fixtures/films/righteousness-by-faith-v1/` keeps the first cut's
recorded takes, sound and script as fixtures for the mix and film-data tests;
`test/cli.test.ts` runs the CLI against the real `righteousness-by-faith`.
