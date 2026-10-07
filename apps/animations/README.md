# Animations

Narrated explainer films drawn in JavaScript: cut paper, torn edges, pastel
grain, handwriting, and ink that boils at 12 fps. Every frame is a pure
function of time drawn into a Canvas 2D context, so the same code drives the
scrubbable preview and a frame-exact MP4 export.

## Commands

```sh
bun run lab                                    # the lab at http://127.0.0.1:8229/: the review at /, a film's lab at /films/<film>/lab, its Scenes (the whole film as stills) at /films/<film>/scenes (LAB_HOST, LAB_PORT, FILM_LAB_HOSTS)
bun run narrate <film>                         # stage stale beats with ElevenLabs, verify, remix full.wav
bun run script <film> [--sheet]                # the reading sheet; --sheet writes out/<film>/script-sheet.md + .html to print
bun run takes import <film> <folder|file>      # the owner's recordings as takes (trimmed, levelled, timed), remix full.wav
bun run score <film>                           # compose the stale score, remix full.wav
bun run sfx list [family] [--missing|--stale]  # the sound library (sounds/library.ts): kind, use, state, variants, level, loudness, source
bun run sfx plan [name…]                       # what make would generate and its credits (free)
bun run sfx make [name…] --yes [--cap n --tally f]  # generate candidates (paid; without --yes it prints the plan and stops)
bun run sfx try <name> [--prompt p --secs s --influence i --count n] --yes  # candidates with other settings (paid); keepable once library.ts says the same
bun run sfx audition <name> [--candidates]     # one WAV of the variants (or candidates), levelled, 0.5 s apart
bun run sfx keep|reject <name> <n…>            # curate candidates; a rejected one is never offered again
bun run sfx keep <name> <n…> --replace         # keep candidates in place of the kept variants (those wait again)
bun run sfx unkeep <name> <n…>                 # stop playing kept variants (by audition number); they wait again
bun run sfx import <file> <name>               # a CC0 recording into a declared recorded sound (public/)
bun run sfx render <name> [--seed n]           # a procedural sound's seeds as WAVs
bun run sfx check                              # unmade/stale sounds, missing or corrupt files, licences, loop seams, one-shots that start late or lack their hit
bun run sfx describe                           # record each take's onset and hit in the lock, measured from its file (free)
bun run sfx pull|push                          # sync sounds/files (generated, git-ignored) with the store in library.ts; push names each file it sends, read back by hash
bun run sfx push --from <folder>               # the same, sending files this machine lacks from an older folder store (a move; see The private store)
bun run media push <file…> [--under dir]       # review renders into renders/<path under FILMS_OUT> (or renders/<dir>/<name>), read back by hash; skips what it holds, refuses a key it holds with other bytes
bun run media push <file…> --replace           # send them even where the store holds other bytes under the key
bun run media pull <key…> [--to dir]           # renders back out (default out/renders), checked against their sha256
bun run media list [prefix]                    # what the private store holds under a prefix (default renders/)
bun run plan | deploy                          # the private store's Cloudflare stack (alchemy.run.ts), prod stage; deploy is the owner's call
bun run store:keys                             # the deployed store's key pair into ./.env (git-ignored)
bun run mix <film> [--stems]                   # remix full.wav in-process (no API): levels per bus; stems to out/<film>/stems
bun run cues <film> [scene]                    # scene times, {mark} times, named cues, seam= to the next voice (fails if a cue overruns)
bun run cues <film> [scene] --sound            # every effect placement's film time and sound, and each bed's span
bun run cues <film> --short <id>               # a short's spans: film time, time in the short, and its length
bun run doctor                                 # headless Chromium and its H.264 encoder, elevenlabs CLI + login: ok or how to fix
bun run check <film>                           # cues, sound cues, stale takes/sound, text collisions, DeadAir, DrawThrew, FrameImpure (fails on any); warns SeamLong, AssetMissing, SoundStale, LeadIn, WordPinFar, DurOnWord, CueTwin, Storyboard, KnobRepeated, MasterLoudness, EffectHot, InkOverFace, StaticHold, HeldShare, FaceSmall, ColourScript, HandJump, HandFar, HandHidden, EndShort
bun run check <film> --static --allow-stale    # the files alone: no mix, no browser (the lab runs this after each write)
bun run check <film> --sound                   # the static leg and the mix the film makes now (DeadAir, MasterLoudness, EffectHot), no browser
bun run check <film> --draw                    # the static leg and every scene drawn in this process (DrawThrew, FrameImpure, InkOverFace on a face the viewer sees), no browser
bun run check <film> ... --json                # each finding as one line of JSON {level,tag,message,address:{part,time}} (the lab reads this)
bun run check <film> --short <id> [--zone ads] # a short: text in the safe zone, a hook by 0.5 s, a clean loop, 45–75 s (--static: no frames probed)
bun run render <film>                          # out/<film>/film/main.mp4 + .share.mp4 + .vtt (+ .chapters.txt when film.ts declares a look), recorded in out/<film>/catalogue.json
bun run render <film> --contact 1 --from 0 --to 40   # contact sheet, a frame per second
bun run render <film> --stills 3,10.5          # PNG stills in out/<film>/film/main/stills/t0003.00.png ...
bun run render <film> --scene id[,id] ...      # a video or contact sheet over those adjacent scenes in out/<film>/scenes/<id>[+<id>]/ (not --stills); --act name for one act (acts/<act>/)
bun run render <film> --short <id> ...         # out/<film>/shorts/<id>/main.mp4 + .vtt at 1080×1920; --stills/--contact/--from/--to in its seconds
bun run render <film> ... --variant <name>     # another render of the same address beside main (<name>.mp4, <name>/stills/…): a look or score option, lab-<id>
bun run lookbook <film> [--captions]           # out/<film>/film/main/lookbook.jpg: palette + every scene's stills at cue edges and 60%; prints per-scene and per-act luma, dark, saturation, hues, held share, largest face
bun run look <film> --scene <id> --at <place> [--at …]  # stills of the scene as its sources stand, from the running lab's warm page in about a second (no render): out/<film>/look/<scene>/…, one line per still; a place is seconds into the scene, mark:<name> or cue:<name>[@0..1] (FILM_LAB_URL, else :8229)
bun run look <film> ... [--crop x0,y0,x1,y1] [--size <long side>] [--mode value|squint] [--captions] [--format png|jpeg] [--json]  # a region at 1:1, a smaller still, the value or squint view; --json prints the lab's answer, or its failure as the route answers it (`ToolFailure`), as one line
bun run look <film> ... --level <look>=<level>  # a wedge: that look (palette.ts's looks) drawn at that level instead of the one it plays, the pick left unwritten
bun run judge <film> --scene <id> [--point look:<name>|render:<address>] [--captions] [--json]  # a blind second opinion on one picture choice: every version's stills at the scene's marks and cue middles, labelled at random, ranked against CRAFT and the director's vision by okra counsel --deep in a bwrap sandbox that reads only the packet; prints the verdict's path (out/<film>/judge/<scene>-<stamp>-<draw>/verdict.md) and the ranking; writes no choice
bun run journal <film> note "text" [--scene <id>]   # append an observation to src/films/<film>/journal.md (committed), dated and placed; an empty note is refused
bun run journal <film> read [--scene <id>] [--last N]  # the newest N entries (20), oldest first, one line each, under 8,000 characters
bun run project <film> [--variant v] [--json]  # every scene: its render current, stale, stale:sound or missing, approved or not, its comments
bun run project render <film> [--scene id,id] [--scale 0.33]  # render each scene on its own into out/<film>/scenes/<id>/; a current one is skipped (--force), a stale:sound one re-muxed (nothing drawn)
bun run project approve <film> --scene id,id | --act name | --all  # approve scenes' renders (a stale or missing one named is refused), an act's current scenes, or every current one; a re-render leaves the approval stale
bun run project withdraw <film> --scene id,id | --act name | --all  # withdraw those scenes' approvals
bun run project comment <film> "text" [--scene id | --act name]  # a comment on a scene's render as it is now (or the scene, before its first render), an act, or (neither) the film
bun run chapters <film>                        # the YouTube chapters film.ts's look.acts name, one `mm:ss title` a line
bun cli.ts options list <film> [--check]       # the film's choice points as the review reads them, fresh from disk (one line of JSON); --check adds the static check's findings
bun cli.ts options take <film> --point p --variant v --verb pick|unpick|reject  # keep, unkeep or reject a sound's take in the library as it stands
bun cli.ts options mix <film> --point p --variant v --to f.m4a  # the film's whole mix with a score option or a take in place
bun cli.ts options keep-voice <film> <beat> <file> [--accept-mismatch]  # keep a beat's recorded attempt as its take, and remix
bun cli.ts read voice <film>                   # what the lab's studio reads of the film, fresh from disk (one line of JSON)
bun cli.ts read cue <film> <scene> <cue> [--spans <json>] [--patch <json>]  # a cue on its scene's clock as the files declare it (or with these spans, and this patch over its own span when its source computes part of it), or why it does not resolve (one line of JSON)
bun run notes <film> [--watch [--since <seq>]] # open lab notes and `cursor seq=`; --watch streams changes past it, each with seq=
bun run notes reply <film> <id> "text" [--still file.png] [--since <seq>]  # then new notes + user replies since your last reply, and `cursor seq=`
bun run notes resolve <film> <id>
```

Every command is the `film` CLI from `@bible/film/tools`, run by this app's
`cli.ts` (`bun cli.ts --help`), which hands it the player server that `render`
and `check` load (`index.html`, on a free loopback port; the render's server never serves
Solid) and, for `lab`, the lab: one server for every film, meant to stay up
(on the box, the `film-lab` user unit on port 8229). The lab builds its pages
from this app's source in its own process when they are asked for, and again
after a file they were built from changes: the review (`review.html`) at `/`,
`/sets/<folder>[/<point>]` and a film's `/films/<film>/choices` and
`/films/<film>/project`, the lab (`lab.html`, whose entry `src/lab.ts` mounts
`@bible/film/lab`) at `/films/<film>/lab[/<scene>]`, and the player
(`play.html`) at a film's Scenes, `/films/<film>/scenes[/<scene>]`, and
`/films/<film>/play`. Each is rendered first on the server by its server
entry beside it (`src/*.server.tsx`, `LAB_SERVERS` in `server.ts`), in a
worker of its build's own, and the browser bundle hydrates it. There is no build step and no
restart after an edit: an open lab reloads itself onto the new code at the
frame it shows, and a page that does not build shows the bundler's words
until it does. The lab's routes are under `/api/` (a film's at `/api/films/<film>/*`; a name
that is not one of the app's films is answered 404 `FilmUnknown`). Lab notes and their stills are
written to `lab/<film>/` (git-ignored; `FILMS_LAB` moves it). Narrate flags: `--only id,id` (record these, current or not),
`--force` (every beat), `--dry-run` (print each beat `recorded`, `staging` or
`stale` with why, record nothing), `--accept-mismatch id,id` (keep these
beats' takes though their transcripts differ; bare, the `--only` beats, and
bare without `--only` fails), `--replace-recorded` (stage over a person's take whose
line changed). Takes import flags: `--only id,id` (just these beats; one file
not named for its beat imports as the one beat named), `--accept-mismatch id,id`,
`--whole` (the file is one reading of the whole script, cut at the quietest
point of the silence around each beat; a flubbed line read again keeps the
reading that finished it). Score flags: `--force`, `--dry-run` (each option's
movements and estimated credits), `--option <name>` (just that one), `--cap n` and
`--tally file`; `score` composes only the score, keeps each option in the
private store (as `sfx push` does) and remixes. Mix flags: `--stems` and
`--score <option>` (play another option; its stem is `music.<option>.wav`). A film's beds and effects name sounds in the app's
library (`sounds/library.ts`, shared by every film) with a level in dB
relative to the voice; `check` fails on a sound the library lacks
(`UnknownSound`), one placed for the other use (`SoundUseMismatch`) or one
not yet made (`SoundUnmade`), and warns on a stale one or an effect within
3 dB of the voice where it speaks (`EffectHot`). How to word a generated
sound's prompt and pick its length and influence, per kind (one-shot foley,
impacts, beds), is `sounds/PROMPTING.md`. The library's generated files sync
with the private store `library.ts` declares (below), never a folder under
`~/film-media`, whose index deletes files it did not mirror. A misspelt `--only` beat
fails narrate before anything is planned with `UnknownScene`. The films are
always `src/films`, the folder the player imports (`cli.ts` hands it and
`sounds/` to the tools, with the app's `out/` and `lab/`, so a run writes there
whatever directory it starts in); `FILMS_OUT` overrides `out` and `FILMS_LAB` `lab`.

Check flags: `--static` (the files alone: no mix and no browser), `--sound`
(the static leg and the mix, no browser), `--draw` (the static leg and every
scene drawn in this process into the stand-in context: a scene that throws,
a frame that is not pure, ink or text over a face; no browser), `--allow-stale` (stale takes, sound
and audio master are warnings), `--scene id,id` (probe only these scenes'
layout), `--act name` (probe that act's scenes and judge its colour script),
`--workers n`. The address (`--act`, `--scene`, `--short`: one of them) is
resolved once, in `core/address.ts`, before a page opens: a name the film
lacks fails with `UnknownAct`, `UnknownScene` or `UnknownShort`, listing what
the film has; scenes with another scene between them fail with `ScenesApart`
(a part is one stretch of the film: name the scenes between, or render each
alone); and two at once with `AddressConflict` (`cues <film> <scene>`
fails the same way for its scene).
Once every take is recorded, the static leg also reads `narration/full.wav`
and the stamp `mix` writes beside it (`full.json`): missing is
`AudioMissing`; longer or shorter than the film, or mixed for another plan
(a score pick, a re-take, a moved effect), is `AudioStale`; `mix` fixes both. `check` is a
review step, run by hand: films have no tests and the gate checks no film (a
film is a function of the framework's code, and its change is reviewed by its
diff). `check --draw` runs every scene at its first frame, each cue's edges and
midpoint, its 60% point and its last frame, through the film's own
compositor into the framework's stand-in 2D context, so a scene that reads a
mark, cue or knob its film no longer has, or draws what a real canvas
refuses (a negative arc radius), or a frame that depends on the one drawn
before it, is an error.

Render flags that would be ignored fail with `FlagsConflict` before a browser
opens: `--stills` goes with none of `--contact`, `--scene`, `--act`,
`--from/--to`, `--scale`, `--out`, `--no-share`, `--encoder`; `--contact` takes a range (clipped to the
film like a video's, so no frame repeats; a range wholly outside it is
`RangeEmpty`) but no video flag (`--workers` and `--encoder` included: one
page composes the sheet);
`--scene` and `--act` go with neither `--from` nor `--to`; a video's
`--from/--to` needs `--out` (a stretch is not the film's render, so it never
replaces the film's clip or its catalogue record).

Render flags: `--from/--to` seconds, `--scene id,id` or `--act name`, `--workers n`
(pages; the measured knee on each encoder: 6 on the Mac's
hardware encoder, 8 in software, or half the cores on a software machine with
fewer than 16), `--scale 0.5`, `--no-captions`, `--variant name` (the render
beside `main` at the same address, so parallel renders don't collide), `--out file` (a file outside the
project folder, not catalogued), `--no-share` (skip the smaller copy to send, `<clip>.share.mp4`), `--encoder
hardware|software`.
A first page chooses the H.264 encoder once and every page uses it; the
render logs `render.encoder kind=…` and `bun run doctor` prints the same
choice on its `encoder` line. The Mac renders on its hardware encoder only:
if the GPU encoder fails the render stops with `EncoderMissing` rather than
changing the film's look (`--encoder software` renders there in software on
purpose). A Linux box (GPU launch flags are macOS-only) renders on Chromium's
software encoder, and its share copy is made after the join by x264, in-process, from the
master (`render.share by=x264`), which adds minutes but keeps the grain at
half the size the in-page encoder needed (`packages/film/README.md`,
"Encoders"). Each page runs one encoder, two on the Mac with the share copy.
On hardware past 14 at once the encoder hangs; on software more encoders than
cores only thrash. So a render that would need more fails with
`TooManyEncoders` before it draws (hardware: at most 7 pages with the share
copy, 14 without; software: one page a core). The count is per render: on the
Mac two renders at once (say two `--variant`s) share the hardware, so keep their
pages together within the same 14 or they can hang with no error. Each chunk lands in a folder of the render's own in the system's temp folder (`film-segments-*`, with `share/` on the hardware encoder)
until the film is joined, then it goes: a video leaves no segments under `out/<film>/`, whatever its `--variant`
(so two renders at once never share segments); a failed join leaves them. A video's audio
is encoded to AAC once, beside the pages, and the video and its share copy
take the same packets. It comes from the film's track `narration/full.wav`, which must cover the
whole film to within a frame before a frame is drawn (`AudioMissing` or
`AudioStale` otherwise: run `mix`). Its captions are also
written as WebVTT beside it. `mix` runs in-process (`core/mix.ts`'s
`mixPlan` and `renderMix`, its filters in `core/dsp.ts`) and logs each bus's mean and peak dBFS (`mix.levels`), so balancing
needs no other tool; it writes `full.wav` whole (a partial of its own,
renamed only once written), so a failed or interrupted mix leaves the previous track as it was. The
player streams the same WAV. Ctrl-C stops
a render cleanly: every page, the browser and the server close. Player keys: space play, ←/→ frame (shift = ten frames), `[` `]` scene,
`c` captions. In the lab (`bun run lab`, `/films/<film>/lab`) a click on the frame pins a
note, a drag boxes one, the Pen draws on it and `n` (or the Note frame button, on a phone)
notes the whole frame; notes show as pink pins on the track and in the side list, where the
agent's replies arrive with their after-stills (if the page loses the lab server, the notes say so and connect again on their own). The strip under the timeline shows the
current scene's cues: drag one (body = offset, edges = start/end; a bar too short for edges is
all body, alt-drag for its end; an `until` cue's right edge sets its `untilOffset` off its point, so its end keeps following the point; snaps to words and frames while Snap is on (S), shift inverts it; Esc puts it back) and the release writes the new value into
the scene's `.ts` file, the page reloading at the same time and selection.
The inspector sets offset, dur (an `until` cue's end) and ease (each curve drawn) and knobs; a point
knob gets a handle on the frame, placed through the transform it was read
under (inside `at(...)`, scaled, tilted) or, read before a camera, through that
camera, so it drags where it is drawn. A camera's target (a point knob `face`
beside `faceZoom`) is a reticle; while the camera sits on it, dragging it moves
the picture with the pointer (the target moves the other way). `film check --static`
runs after each write and its findings show in the panel; Undo (⌘Z) puts the
newest write back and Redo (⇧⌘Z) makes it again, over the last 50 writes, never
over a change made since. One write is out at a time: a drag or a field set while one
is in flight is not taken. Review with `git diff`. The lab's tools are modes, one at a time on the
mode tray (Edit, Note, Motion, Compare, Record; ⌘K too). Motion ghosts the frames
around a paused one (Onion: warm before, cool after), slows the clock to
0.25× or 0.5× (narration mutes), and loops the selected cue or an A–B range (setting B after A plays from A; a B before A waits for a new one). A film with no mixed `full.wav` yet plays on its own clock and the time line says `no narration`; a browser that holds the narration until a click says `narration waits for a click`, and the next play tries again. A play pressed while the narration still loads starts the voice once it can, from where the picture is then.
Compare draws the same frame as HEAD declared the scene's timeline and
knobs: wipe (HEAD left of a divider you drag), blink, or diff (HEAD over now
in the difference blend: black where nothing moved), the mode in the link
(`?view=wipe|blink|diff`); when HEAD cannot give the scene, the mode says the server's reason. Speed, loop, onion,
the wipe's divider and play are kept through the reload a write causes (the tab's
sessionStorage, per film). A film's Scenes (`/films/<film>/scenes`, the page
bar's Scenes) is the whole film as stills from the code as it stands; a tap
on a still selects its scene and moves the playhead there, and its card's
Open in Lab (E) opens it in the lab. The **Record**
mode records the owner's voiceover beat by beat: pick a beat (its line is
the teleprompter), click into the mode, then R records after a 3 s
count-in (the meter warns of clipping at −1 dBFS), Space stops, play it back,
K submits; what was heard and the word error show, or the server's refusal,
and a `TakeMismatch` offers Accept anyway (K). ←/→ step through the beats and
Esc cancels; those keys are Record's only while it has focus. Each beat's
attempts play again and Keep makes one the take; a keep, like every lab write,
is undone by Undo (⌘Z) and redone by Redo: the track remixes and the lab reloads, the take it replaced playing again (the editor waits as long as for a keep, then asks the lab whether the step landed). A reload never takes a take being recorded or under review, nor a note being written: it waits until you submit, discard or save it, and the panel says what it waits for. A kept take reloads the lab
at the same time, on the same beat, playing the new take (`/films/*` is served
uncached for that). Use Chrome or Firefox on a computer (every iPhone and
iPad browser is Safari underneath) and allow the microphone for the lab's origin; a browser gives the microphone only to `https://` or
`localhost`, so record on the box's own browser or through the box's HTTPS
address (`https://bite-cristian.exe.xyz:8229/…`, the exe proxy in front of
8229); pick the interface in Record's mic list
(it is remembered in the browser). The capture is raw PCM (no echo cancelling,
noise suppression or gain control) posted as a 24-bit WAV at the microphone's
own rate. `bun studio-harness.ts` runs the same lab over a temp
copy of a film with a fake speech-to-text (no paid call; its control is behind
the lab's gate, a write JSON as from a tool, `curl -H 'content-type: application/json' -d '{}'`: `POST
/harness/mishear/<beat>` makes it mis-hear a beat, `POST
/harness/stop` stops it and removes the copy), for driving the panel
without touching the real films. A striped timeline segment means that beat's narration is
estimated, not recorded. The track also marks every `{mark}` (a tick at its
foot), every named cue (a bar as long as the cue), every sound effect (a dot
along the top) and every score movement's start (a line through it), from the film's
`sound` passed to `createFilm`; hover one for its name and time.

**The review** (the lab's home page, `/`) is where options are compared and
picked; each film on it is a card that opens its Scenes, and the page bar
moves between a film's Scenes, Lab, Choices, Project and Play. Its home lists the
films and every folder of renders under every checkout's `out/` (and any
`FILM_REVIEW_EXTRA_ROOTS`). Videos named `<clip>.<variant>.mp4` in one
folder are a comparison set, played on one clock (all of them, the first
against one other (`?view=pair&other=<id>`), that pair as a wipe or as their
difference at a moment, every variant's frame at a few moments, or the notes;
space plays, ←/→ step 2 s, 🔊 picks whose sound is heard), titled and
annotated by an optional `review.json`. A film's choices page (`/films/<film>/choices`) plays
its newest render with the film's whole mix heard over it and lists its
choice points: the score's options, each library sound's takes, each beat's
voice attempts, each look's levels (`looks` in `palette.ts`) and each sound
layer's level (a knob). **Pick** writes `play` in `sound.ts` (a score) or
`palette.ts` (a look); **Pick**, **Unpick** and **Reject** on a take curate it
in `sounds/library.lock.json`, as `sfx keep`, `unkeep` and `reject` do; Pick
on a voice attempt keeps it as the beat's take; a knob writes the level's one
number in `sound.ts`. Each write is checked and undoable (Undo, Redo), and a
pick or a knob runs `check --sound`, its findings shown; review it with `git
diff`; Undo and Redo name what they would undo. Every current variant can be
approved, an approval withdrawn, and any variant commented on. The project page
(`/films/<film>/project`) is the film by acts and scenes: each scene a card,
its render (this checkout's) or still, its state (current, stale by its
sources or its sound, missing with the command that renders it), approval
and comments; a tap opens its sheet (`?point=`), with Approve, Unapprove, a
comment, Open in Lab and the choices that play in it, each a link to its
card on Choices. An act's and the film's approvals and comments are in
their inspectors, context menus and ⌘K, with "Approve all current". The lab answers loopback, and the names in
`FILM_LAB_HOSTS` when `LAB_HOST=0.0.0.0`, on every path (the pages too: built
in process and served behind the check); every request passes one gate
(`admit`), and writes are JSON, from the lab's own origin or from a tool's
(no Origin). The
review never edits a scene: the lab's own page does. The player and the lab
serve a film's narration through the framework's one route
(`packages/film/src/tools/narration-route.ts`),
`/films/<film>/narration/<file>`: the film one of the app's films now (a
folder with `scenes/index.ts`, read per request, so a film made while the
lab runs is served), the file one directly in its `narration/` (never
`attempts/`); any other name is a 404.

### Looking at a scene: the easel

A painter steps back from the easel after every passage; `bun run look` is
that step back. It asks the running lab (`FILM_LAB_URL`, else the always-on
one on 8229) for stills of a scene as its files stand now, and prints one
line per still: its file, the scene, the place asked, its time in the scene,
its frame, its pixel size and the lab's build. The lab draws them on an
export page it keeps open per film (no render, no encode), so a look takes
about a second once that page is open; the first look after a save rebuilds
the pages and opens a fresh one first (a few seconds). A look never shows
stale code: a save the lab's watch has not heard yet is built before the
still is drawn, a page that does not build answers `PagesBroken` with the
bundler's words and draws nothing, and a scene, mark or cue the film lacks,
or a time past the scene's end, is its own refusal (`UnknownScene`,
`LookPlaceUnknown`, `LookOutOfRange`). No lab answering is `LabDown`: a look
starts no browser of its own. A lab started from another checkout refuses
(`LabElsewhere`) rather than show its own files; start a spare one from this
checkout (`LAB_PORT=8264 bun cli.ts lab`) and point `FILM_LAB_URL` at it.

Two painter's views read the picture apart from its colour. **Value**
(`--mode value`) is the frame in greys: the light and dark alone, the way a
value study checks that the subject reads before colour helps it. **Squint**
(`--mode squint`) is the greys blurred (1.2% of the still's long side): the
detail goes and the big masses stay, the squint test for where the eye lands
first. `--crop` shows a region at 1:1 to read faces, hands and lettering;
`--size` scales the still's long side. A crop is a lossless PNG; a whole
frame is a JPEG (0.95) unless `--format png` asks, since the paper's grain
makes a 1920×1080 PNG about 4 MB. Stills are kept under
`out/<film>/look/<scene>/`, named by time, view and build
(`t0002.33.value.b<build>.jpg`), and never rewritten.

A **wedge** (`--level ground=light`) is the printer's wedge: one strip printed
at each of several grades so one can be chosen. It draws the scene with a
look (`looks` in `palette.ts`) at another level than the one it plays,
without writing the pick: the lab builds its pages once more with
`palette.ts` read as a pick of that level would write it (the very edit the
Choices view's **Pick** makes), serves that build beside its own, and draws
from it. The file on disk never changes. A look or level the palette lacks
is `LookLevelUnknown`; a wedge's stills carry its levels in their names
(`….wground-light.b<build>.jpg`).

### A second opinion: the judge

`bun run judge <film> --scene <id>` asks another model family to rank the
versions of one picture choice at a scene, blind. A version is what the
Choices view picks between for the picture: a look's levels (`--point
look:ground`, each drawn through the easel as a wedge) or a render set's
variants (`--point render:scenes:<id>`, each cut from its video). Without
`--point` it takes the scene's one picture choice that has two versions or
more, and names them all when there are several (`JudgePointAmbiguous`).
Every version is shown at the same moments, the scene's marks and its cues'
middles (at most 12, spread evenly), as 1280-pixel JPEGs, under labels A, B,
C drawn at random. The packet (`packet.md`) gives the beat's words, its
picture's brief and register, its act, and the rules that bear on it,
each named by its file's name alone (`JUDGE_RULES` in `cli.ts`: the look, the palette,
the colour script, the paper and what we never do for every beat; human
scale, figures and staging for a STORY beat; words off the picture,
repetition and type for an IDEA beat). It never says which version is
newer, which is picked or who made it, nor where anything lives (each still
is named by its path beside the packet). The counsel reads it in a sandbox
(bubblewrap, `bwrap`, which must be installed) that shows it the packet's
folder (the packet and the stills, under the system's temp folder) and what
okra and Codex need to run, and no other file: no earlier judge's folder,
no look file, no repo, no cache. The network is shared, since Codex needs
the internet, so the lab stays reachable on this machine's loopback, though
nothing in the sandbox says it is there. The key stays in the judge's
memory until the counsel has answered. `okra counsel --deep` (Codex)
answers with a ranking (one
whole line: labels and `>` or `=`, or exactly `no preference`) and, for
each version, the still and the rule that decide it. The judge unblinds
that answer into `verdict.md`, beside the stills, the packet and the key
(`key.json`) in `out/<film>/judge/<scene>-<stamp>-<draw>/`: the ranking in
real names beside the owner's pick, the key, the reasons, and the counsel's
answer by path. It prints three
short lines (`verdict <path>`, `ranking <names> (point= pick=)`, `counsel
<path>`), or one JSON line with `--json`. It writes no choice: a pick is still
the owner's, in the Choices view.

### The journal

A film's journal (`src/films/<film>/journal.md`, committed with its
sources) is its production log: what was seen, heard or measured while it was
made, so the next pass reads the film's history instead of finding it again.
Its rule is written at its top: **observations, never instructions**. "Under
squint the robe is the lightest mass at mark roof" is an entry; "make the
robe lighter" is not (a decision lands in the source, a request is a lab
note). `bun run journal <film> note "…" --scene <id>` appends one entry, its
UTC time to the second and its scene (`film` without one), the words on one
line; a scene the film lacks is refused (`UnknownScene`), and so is an empty
note (`JournalEmpty`). Notes at once all land: a first note publishes its journal whole (written beside it, then linked into place, which fails if one is there), and every other appends. `bun run journal <film> read [--scene <id>] [--last N]`
prints the newest entries, oldest first, as `<time> scene=<id> <text>`,
never more than 8,000 characters, with a first line saying how many earlier
entries it left out.

### A painter agent: the gent extension

`.gent/extensions/film.ts`, at the repo root, is a project extension for
[gent](https://github.com/cevr/gent). It gives gent the
`scene-painter` agent and `film.paint`, which starts one. The agent holds
these tools and no others (no bash, no cell):

- `film.look`, `film.check`, `film.cues` and `film.journal` run this
  checkout's own film CLI (`bun cli.ts …` in `apps/animations`). The stills
  come back as images the model reads. A refusal (`UnknownScene`,
  `PagesBroken`, `LabDown`, …) comes back as a failure whose fields are the
  film's tag and words.
- gent's own `read`, `grep`, `write` and `edit`, which the agent's `paths`
  confine: `apps/animations/src/films` to write, `.claude/skills/film` (the
  film skill's rules) to read. gent's paths are fixed folders, so the
  definition cannot name one film; `film.paint` admits each painter session
  with its film's folder alone as the `paths` override.

`film.paint { film, scene, brief? }` checks the film and the scene as
`film.cues` does, refuses an unknown one before any session is made, then
starts a child session as `scene-painter` on that film and sends it the
scene. It returns at admission with the session's id; `read_session` reads
the painter's transcript. The painter does not hold `film.paint`.

Every result fits whole in gent's 8,000-character tool result. A result that
stops early says how to read on: `film.cues` gives the `next` line and column
(inside a line, when one is longer than a result), `film.check` the `next`
finding and the report it belongs to. When the findings change between
pages, the check says `restarted` and lists them again from the first, so
none is skipped. The journal names the file `read` takes for the lines it
left out.

The agent's brief, in the extension, has it work in passages: read the scene,
its cues and its journal; paint one passage; look; note what it saw; and run
the check before it stops. When a painter's context window fills, the agent
condenses it from the files (the scene file, the newest journal entries for
the scene, its cues and the last look's stills) and asks no model to do it.
A later condensing carries the scene and the last look forward from gent's
own handoff marker, never from a summary copied into a message.

To run a painter:

1. Trust the checkout once. Add its canonical root (`realpath .` at the repo
   root) to `trustedProjects` in `~/.gent/config.json`. gent runs no project
   code otherwise, and its extension status says "Project code is not
   trusted".
2. Start the server: `gent server start`.
3. With the repo root as the working directory, run
   `gent -H "film.paint the roof scene of <film>: …"`. Run as
   `-a scene-painter` directly, a painter may write in every film.

A look asks the lab named by `FILM_LAB_URL` in the gent server's environment,
or the always-on lab on 8229 when that is unset. `bun run test:gent`
typechecks and tests the extension against a local gent checkout:
`~/Developer/personal/gent`, or the one named in `GENT_CHECKOUT`. It runs
only on your machine, like `test:perf`, and the gate never runs it.

## How a film is built

```
src/films/<film>/
  script.ts        the screenplay: ordered beats — narration, citations, picture brief
  voice.ts         who reads it: the film's one narrator (changing it re-records everything)
  scenes/index.ts  scenesOf(script, { drawings, light, card }): every beat with its drawing by id; undrawn beats play as storyboard cards
  scenes/*.ts      one Drawing per beat: draw(frame) + timeline (named cues) + enter transition + timing
  kit.ts           the film's recurring props, its people and type treatments
  film.ts          createFilm: the film's scenes, palette and fonts, what the player and renderer load
  palette.ts       the film's colours and fonts
  acts.ts          the film's acts, once: colour-script targets, chapters
  light.ts         each act's light over its scenes
  credits.ts       the credit roll: each beat's cite, grouped by author
  sound.ts         score movements and sound effects, placed on scenes' named cues
  shorts.ts        vertical shorts: spans of scenes, from a mark or cue to a later one (optional)
  narration/       one take per beat + timings.json (word timings); full.wav (the mixed track) is derived
  sound/           each score option (git-ignored, private store), and manifest.json (their request hashes, sha256)
  sources.md       how every quotation was checked (optional)
  quotes.jsonl     the verified quotation records the script sheet reads (optional)
```

**Narration drives the clock.** A scene lasts `lead + speech + tail`: `lead`
defaults to 70% of its entrance (at least 0.5 s) and `tail` to 0.1 s, so the
seam between two voices is about 0.6 s; set a longer `tail` only for a pause
the script means (rule 9 of the film skill's CRAFT.md). `cues` prints each
seam (`seam=0.60`), and `check` warns `SeamLong` where a seam runs over 0.6 s
with neither scene declaring it (no `tail` before it, and no `min` that
stretches that scene past its words; no `lead` after it): a long entrance stretching the default lead. A
seam is measured from the last voiced word, not the end of the take file
(below). Put
`{mark}` cues in the narration before the word the picture should hit;
`f.mark('name')` returns that word's scene-local time from the recorded take
(or an estimate before recording). Marks are stripped before speech, so adding
one never re-records. `f.spoken(from, to)` is 0→1 in step with the words
between two marks — quotes reveal as they are read. The picture keeps pace
with the voice too: `check` warns `StaticHold` where a drawn scene speaks for
more than 4 s with no cue running and nothing moving, probed a boil tick
apart (captions and boil aside, at any zoom; a storyboard card is exempt). A
flourish no cue declares does not hide the still stretch after it. Pin a
motion to a mark in that stretch, or cut it. A colour change, or drawing the
probe cannot see, reads as still: look before pinning.

**A film has one narrator.** `voice.ts` exports one reader
(`{ voiceId, model, settings }`, recorded through text-to-speech), and the
narrator asks the viewer's question too (the film skill's CRAFT.md, rule 6).
The engine can also read a cast
(`{ model: 'eleven_v4', settings: { stability, similarity? }, voices: [{ name, voiceId }, …] }`),
recording each beat as one text-to-dialogue take in which the first voice
reads until a line hands over with `{@name}` before a word. Like a mark, a
turn is not spoken, but moving one re-records the beat; a turn to a voice the
cast lacks fails `narrate` and `check` with `UnknownVoice`; captions never run
a line across two voices, and each voice's first line opens with a dash. A
one-voice cast is how a film reads through text-to-dialogue.

Settings are the model's own: `eleven_v4` has two sliders, `stability` and
similarity (`similarity` in a cast, `similarity_boost` for a reader), each
0–1, and no style or speed, so a film that names another setting on v4 fails
to load rather than paying for a slider the model ignores. A reader on v3 or
v4 reads each line alone; earlier models hear the neighbouring lines.

A staging take's tail is trimmed when it arrives: `narrate` cuts silence past
the last word the way `takes import` does (a trimmed take is kept as FLAC),
and `check`'s `SeamLong` and `cues` measure a seam from the last voiced word,
not the file's end.

**A moment is declared once.** When something besides the drawing reads a
moment (a sound, another cue), name it in the scene's `timeline`, anchored to
a mark, another cue (`after` / `with`) or a scene landmark. A beat on a word
that has no mark is a word pin: `{ mark: 'gift', word: 'faith', dur: 0.6 }`
starts on the first word said at or after `{gift}` that reads `faith` (read as
a take is checked: any case, apostrophes dropped, `cover` in `cover-up`, accents kept), so a re-take carries it; `check` warns `WordPinFar` when it lands more than a sentence past the mark; a line that never says
the word there fails the layout with `WordMissing` (`film check`, the player,
`check --draw`), never falling back to the mark. It lasts its `dur`
(`check` warns `DurOnWord` where a `dur` of a second or more ends, or with
`ends` starts, within 80 ms of where a phrase of its take is heard to start
or stop: a length sized to this take, which a re-take leaves behind; it
reports and never rewrites),
or runs `until` a mark (`{ mark: 'right', offset: -0.4, until: 'notes' }`) or a
landmark (`{ mark: 'daily', until: { at: 'speechEnd' } }`, never a progress rolled
by hand to `f.speech.end`), so
a re-take moves its end as well as its start; a span declares one or the
other, and a `dur` written replaces a mark's `until`. An end a set time off
its point keeps the `until` and adds `untilOffset`, its seconds off the point
(`{ mark: 'near', until: 'held', untilOffset: 0.2 }`, negative before it), so
it still follows the point; the lab's right-edge drag or End field writes
it, and 0 takes it away. A part of another cue
that ends with it runs `until` that cue's edge, `{ with: 'roll', until: { cue:
'roll' } }` (its end, or `edge: 'start'`), or lands on it, `{ after: 'speck',
dur: 0.68, ends: true }`, never an offset and dur that add up to the parent's
length (`film/span-ends-on-anchor`), so a lab drag of the parent carries it. A motion that must land on
its moment `ends` there: `{ mark: 'true', dur: 0.5, ends: true }` ends on
`{true}` and starts its `dur` before it (never `offset: -0.5, dur: 0.5`, the
same number twice), so a lab `dur` write or drag keeps the landing. A
timeline that does not resolve fails the layout naming its scene and cue
(`UnknownCue`, `UnknownMark`, `CueCycle`, `UntilBeforeStart`, `WordMissing`),
as does a line with a mark named twice (`DuplicateMark`) or a turn with no
word (`TurnInvalid`). Read it in
`draw` with `f.cue(name)` (scene-local `{ start, end, dur }`) or
`f.at(name)` (0→1 across it, eased by the span's `ease`), or keyframe a
motion across it with `f.keys(name, [[0, 0.35], [0.4, -0.2], [1, 1.5, 'outQuad']])`:
each key's time is a fraction of the cue, so a `dur` edit stretches the motion,
and a key that names no ease takes the span's. Items that follow one another
across a cue (sheets falling, stains spreading) read `f.stagger(name, i, n)`:
the span's `stagger` (0 to 1) is the share of the cue their starts spread over,
and each item lasts the rest, eased by the span's `ease`, so a `dur` edit
scales every item (`drop: { mark: 'evidence', dur: 1.4, ease: 'inCubic', stagger: 0.857 }`).
A set spread by place rather than count (fields greening as the rain reaches
each) reads `f.staggerAt(name, at)`, `at` 0 for the first and 1 for the last.
A part of a cue (a fill over its last tenth) is a cue of its own, `{ after:
'into', dur: 0.1, ends: true }`, never `clamp((f.at('into') - 0.75) / 0.25)` (`film/no-cue-remap`):
the lab cannot reach a fraction written in the draw. A step part way
through a cue (the colour comes back to a face as it starts to sit up) is a
cue of no length, `colour: { with: 'sit', offset: 0.056, dur: 0 }` read as
`f.at('colour') > 0`, never `f.at('sit') >= 0.3`. An instant the drawing's
own shape makes is read from the shape, so a drag keeps it there: the word
card shows its other side once it is edge on, `Math.cos(f.at('flip') *
Math.PI) < 0`, and a book's cover is open once both halves of its opening
are, `lerp(230, 460, (f.at('unclasp') + f.at('pages')) / 2)`. A set that takes a
number staggers its pieces with `staggered(p, at, share)` (`@bible/film/core`).
Plain `keys(t, …)` is for ornament. Wrap the drawing in `drawing({ timeline,
draw })` so an undeclared name fails to compile, in `f.cue`/`f.at`/`f.keys`/`f.stagger` and in the
timeline's own `after`/`with`. `layout()` resolves every cue
once; `cues` prints them and fails when one ends after its scene. A span's
easing is data too (`{ mark: 'fiction', dur: 0.35, ease: 'inQuad' }`), and
only data: `f.at` takes no ease, so the lab's ease picker always changes the
frame. Ornament
(wobble, idle motion) stays inline.

**A tweakable value is a knob.** A position or an angle a review may ask to
move is declared on the drawing, `knobs: { palm: [960, 800] }`, and read with
`f.knob('palm')` (a number or an `[x, y]` point), never repeated as a
constant. A framing is knobs too: a point and a zoom (and a tilt),
`face: [800, 610], faceZoom: 1.22`, made a camera in the draw with
`knobCamera(f.knob('face'), f.knob('faceZoom'))` (`@bible/film/canvas`); the lab gives that pair a reticle. Only the unmoved
frame (`UNMOVED` from `@bible/film/canvas`, the canvas itself), a framing derived from another
constant and one shared across scenes (in a set file) stay code; a framing
written out in a scene or blended by hand with `lerp` (a camera spread from another, `{ ...cam, zoom: lerp(cam.zoom, 1, t) }`, included) fails `film/framing-is-a-knob`,
and `film check`'s `KnobRepeated` compares a framing by its point and zoom. A push is a `shotPath` stop
to a knob camera, `shotPath(UNMOVED, [[f.at('plunge'), knobCamera(f.knob('page'),
f.knob('pageZoom')), pushInto]])`, never a zoom eased again by hand
(`film/no-ease-on-cue`); a held close-up that keeps pushing in is
`pushOn(cam, f.knob('pushOn'), f.at('hold'))`, its push a number knob. Read a position knob
under the transform it is drawn with (inside the camera or the plane), so
its handle lands on it.

**Takes are content-addressed.** `narrate` hashes each beat's spoken text,
with its turns, and re-records only beats whose text or turns changed, transcribes every new take back with
speech-to-text, and fails the run with `TakeMismatch` when the take doesn't say
what the script says (over 8% word error, both read as said: numbers however
written or spoken, `144,000` and "one hundred forty-four thousand", a year in
pairs, "Zechariah 3:1-4" as "chapter three verses one through four", `Mrs.`
as "Missus", and a name spelt as `script.ts`'s `heardAs` lists it, e.g.
`export const heardAs = { Ellet: ['Elliot'] }`). A failed take never replaces
the current one; `--accept-mismatch <id,…>` keeps the named beats' takes
with a warning. A new take is saved
as `<id>.<audio hash>.mp3` (a person's, `.flac`), beside the take it replaces, and becomes current
only when `timings.json` is rewritten to name it, so a crash at any step
leaves every take the timings name on disk and matching them. The next
`narrate` clears what a crash or a failed take left in `narration/`: it
removes `*.partial` writes, and puts every take the timings no longer name
away into `narration/attempts/<beat>/` (git-ignored), never deleting one
(beside an attempt of its name that holds other bytes, never over it), all
under the timings' lock, so a lab's Undo naming a take in another process is never undercut.
`timings.json` and `sound/manifest.json` are
Schema-decoded (`@bible/film/core` `schema.ts`: durations and word times are
non-negative, words run in order, and none ends after its take) and written
one writer at a time across processes (`ContentStore`: the operating
system's lock on `.<file>.lock` beside it, held for each change and let go
when its process ends), so takes finishing together never lose entries.

**ElevenLabs stages; the owner's voice replaces it.** A film is staged with
ElevenLabs (`narrate`), then read by a person beat by beat:

1. `bun run script <film> --sheet`, and print `out/<film>/script-sheet.html`:
   each beat's line with its marks stripped, the file to save it as
   (`<beat>.wav`), quotations set apart with their source, `/` for a breath.
2. Record each beat into its own file (WAV or FLAC for the final voice; M4A
   or MP3 import with a warning; any rate, any room noise), or the whole
   script in one file.
3. `bun run takes import <film> <folder>` (or `<file> --whole`). Each
   recording is trimmed to the staging takes' padding and levelled to their
   loudness (numbers in `packages/film/README.md`), kept as a 24-bit FLAC
   master (`<beat>.<hash>.flac`: the owner's voice is the final voiceover,
   never lossy after the recorder), transcribed and timed by the words heard;
   `TakeMismatch` and `--accept-mismatch` work as for `narrate`. Every
   recording stays in `narration/attempts/<beat>/` (git-ignored), the original
   file byte for byte beside its FLAC; the kept FLAC is committed, with
   `source: "recorded"` in `timings.json`. The take it replaces moves out of
   `narration/` into the same attempts folder (a staging take too), so git
   drops it from the commit and no take is ever deleted.
4. `bun run check`, `bun run cues` and `bun run mix` as for any take, then
   tighten each scene's `lead` and `tail` at the seams.

Staging never overwrites a recorded take: `narrate` skips it (even under
`--force` and `--only`); when its line changes the take is stale, `check`
fails it, and `narrate` refuses to stage over it without `--replace-recorded`.
A change of staging voice leaves recorded takes current.

**Sound follows the same clock.** `sound.ts` declares the score as one or more
options (`score.options`: each a whole score in its own musical language, in
`movements` that each start at a scene (`from`) and last 3–120 s), `play` naming the one the
mix plays, with its `under` and `alone` levels; and effects and beds as library
sounds placed at a point in a scene, the same `ScenePoint` a short's span
names: a named cue, `{ scene, cue, edge }` (the cue's start or end), so the
sound lands where the picture does and a re-recorded line carries both; a
`{ scene, mark }` (or a word pinned after it) for a sound on a word; or a
landmark, `{ scene, at: 'speech' }`, for a bed that hands over where the next
scene's voice starts (never `offset: 0.4`, a copy of the scene's `lead`). A
sound at a scene's start names that landmark too (`{ scene, at: 'start' }`),
so a timeline, a short and the sound spell a point one way. A one-shot whose
loudest moment is its event (a stack settling, a page landing) says
`sync: 'hit'` and anchors on the cue where the picture lands; a sustained
one (steps, a creak, a whoosh) says `sync: 'onset'`, so its sound, not its
file's silent lead-in, begins on the cue (its hit may be a second in, and
hit-sync would start it that early). The lock records each take's `onset`
and `hit` (seconds into its file, measured when kept, or by `sfx describe`),
and the mix starts each take its own onset or hit early, so a re-rolled take
stays on the picture. Never an `offset: -0.3` sized to one take's lead-in;
`check` warns `LeadIn` on an effect placed from its first sample (no `sync`)
whose take starts more than 0.05 s in. A point names one
anchor: a cue and a mark together do not compile. `score` sends each option's
movements as one timed ElevenLabs composition plan (music v2 enforces the
section lengths, so the score turns where the film does). Movements are the
score's own turns; the film's acts (`acts.ts`) are the colour script and
chapters, and a movement may cross an act's first scene. Assets are content-addressed
like takes: re-timing a scene makes every option stale; a level change only
needs `mix`. The mix holds the score `under` dB against the voice wherever
anyone speaks and lets it rise to `alone` where no one has for 3 s. Generated
music, like generated effects, never enters the repo: each option's file sits
git-ignored in the film's `sound/`, its manifest (committed) records its hash
and sha256, and `sfx pull`/`push` sync it with the private store under
`scores/<film>/`.
Music works with the CLI's OAuth login; effects
need an API key in `ELEVENLABS_API_KEY` or the Keychain (service
`ELEVENLABS_API_KEY`) — without one they are skipped, not faked. Balance with
`mix --stems` against the levels in rule 10 of the film skill's
[CRAFT.md](../../.claude/skills/film/CRAFT.md).

**Shorts are cut from the film, not drawn again.** `shorts.ts` exports
`shorts`, each `{ id, title, hook?, spans }`, a span being `{ scene, from, to }`
where a point is a `{ mark }`, a named `{ cue }` (its start, or its end as a
span's `to`, or `edge` to say which) or a scene landmark
(`{ at: 'start' | 'speech' | 'speechEnd' | 'end' }`), never a second, so a
re-timed scene carries its shorts. `render <film> --short <id>` plays the spans
back to back at 1080×1920 with the track cut from `full.wav` under the same
spans (a 10 ms fade either side of each join, so no join clicks), and writes
`out/<film>/shorts/<id>/main.mp4` and `main.vtt`. A scene, mark or cue the film
lacks fails before a page starts (`UnknownScene`, `UnknownMark`,
`UnknownCue`, naming what the scene has). `cues <film> --short <id>` prints each span's film time and the
short's length, on the frames at the rate the film declares (read from its page,
as the render and `check --short` do). The page is stacked: the film's 16:9 frame in a band 620 px
down, byte for byte the film's own frame at that time (a band crop of
`render --short <id> --stills T` equals `render --stills <film time> --no-captions`);
above it the short's `hook` (the narrator's question or claim, set from the
first frame, held 2.4 s, faded by 2.8 s); round it the film's paper, vignette
and grain made at the page's size; below it the captions, burned in two to
four words at a time as they are said, with no plate, and each quoted word
(between the script's “ and ”) marked gold as it is read. `check <film>
--short <id>` checks the short, not the film: `ShortUnsafeText` (text under
the platform's buttons: the `default` zone keeps 270 px top, 520 bottom, 140
right and 65 left clear, `--zone ads` the bottom 35%; the short's own lines
are errors, the film's a warning), `ShortHook` (a first word after 0.3 s,
nothing moving by 0.5 s, or the film's title card first), `ShortLoop`
(warning: the last frame far from the first, or over 0.6 s of silence round
the loop) and `ShortLength` (over 90 s an error, outside 45–75 s a warning).
The film's `short` style sets the hook's
and the captions' fonts and colours (`createFilm({ short: { hook, caption } })`).
`src/films/index.ts` keeps `films` (a key per film folder, `narratedFilms`:
the framework loads each film's `narration/timings.json` and names its
`full.wav` by that key, and asks with it for the faces the films draw in
(`src/films/faces.ts`: each subset a woff2 under `assets/fonts`, imported
from the script, `pictureFaces`), waiting for none of them, so no face holds
a page's first paint or the film's bar (what draws the film, its canvas and
its stills, waits for them), then calls the film's `film({ timings, audio })`; a
film with no timings file yet is laid out on estimates, as the tools lay it
out, and a timings file the page cannot read fails with
`NarrationUnreadable`) apart from `pages`, what the player mounts: the films plus each short's page
from `shortPages`, under `<film>/shorts/<id>`.

## The private store

Generated audio (ElevenLabs' terms forbid publishing it as files), composed
scores and review renders never enter the repo. They live in one private
store, declared by `store` in `sounds/library.ts` as a tagged union:

```ts
export const store = defineStore({ kind: 'folder', folder: '~/film-sounds' });
export const store = defineStore({ kind: 'r2', bucket: 'film-store' }); // the bucket the stack makes (infra/store.ts)
```

Keys are prefixes in the one store: `files/<name>/<hash>.flac` (the library's
sounds), `scores/<film>/<option>.<ext>` (each score option) and
`renders/<…>` (review renders, `media`: a render's key is its path under
`FILMS_OUT`, so two films' `contact.jpg` never share one, and a key the store
holds with other bytes is refused, `StoreKeyTaken`, unless `--replace`). The
R2 store keeps each object's sha256 as its `x-amz-meta-sha256` metadata, so
`push` asks the store for a hash with one `HEAD` and never downloads to
compare; a file is hashed and sent as it streams, never read whole; `pull`
streams the bytes beside their place, checks them against that hash, and
renames them into place (or leaves nothing).

**The stack.** `alchemy.run.ts` (wiring only) deploys `infra/store.ts`: one R2
bucket, `film-store` on `prod` (`film-store-<stage>` on any other stage),
with no public access and no domain, and one account API token allowed to
read and write objects in that bucket only. The prod bucket is retained
(`RemovalPolicy.retain`): `alchemy destroy` forgets it and never deletes it;
a throwaway stage's bucket is emptied and deleted with the stage. State is
local, in the git-ignored `.alchemy/`, which also holds the token's value;
keep it.

**The key.** R2's S3 API takes the token as a key pair (the token's id, and
the sha256 of its value). `bun run store:keys` derives it from the stack's
outputs into `./.env` (mode 0600, only its `FILM_STORE_*` lines replaced,
nothing printed but the names):

```
FILM_STORE_ACCOUNT_ID  FILM_STORE_ACCESS_KEY_ID  FILM_STORE_SECRET_ACCESS_KEY
```

The tools read them as `Config.Redacted` (`PrivateStore`); a command that
touches an R2 store without them fails `StoreCredentialsMissing`, naming the
ones missing, and a command that does not touch the store never asks. Requests are signed
with SigV4 through Effect's `HttpClient` (no SDK) and retried on transient
failures. A dashboard R2 API token scoped to the bucket works the same: put
its account id, access key id and secret in `.env`.

**Moving from the folder.** Once the owner has deployed:

```bash
bun run deploy && bun run store:keys
# library.ts: store = defineStore({ kind: 'r2', bucket: 'film-store' })
bun run sfx push --from ~/film-sounds          # sounds and scores, each read back by hash; the folder is left as it was
bun run media push <render.mp4…> --under <dir> # renders
```

`push --from` is idempotent: a second run sends nothing. A lock file found in
neither this checkout nor the old folder is named `missing`, never
regenerated.

**For a review page.** `PrivateStore.store` (in `@bible/film/tools`) gives the
`MediaStore` interface a page needs without holding files locally:
`list(prefix)` → `{ key, size, modified }[]` sorted by key, and
`read(key, range)` → `Option<{ size, start, end, stream }>` (an inclusive byte
range, clamped to the object; `none` when the key is absent), which is what a
`206 Partial Content` answer to a `<video>`'s `Range` request needs. The page
itself is not wired yet.

## Engine (`@bible/film`)

The engine lives in [`packages/film`](../../packages/film); this app is its
first user. `src/main.ts` is the render page's entry: it calls `mountRender(pages)`
with the registry in `src/films/index.ts` (the films and their shorts); `src/play.ts` calls `mountPlay(pages)` for a film's Scenes and Play pages in the studio's shell, `src/lab.ts` `mountLab(films)`, and `src/review.ts` `mountReview(films)`; beside each, its server entry (`src/<page>.server.tsx`) renders the page on the server with none of the films imported. Scenes import from three entry
points:

| Entry point          | Module               | What it gives a scene                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@bible/film/core`   | `time.ts`            | easing, `progress`, `keys`, `envelope`, `lerp`, `clamp`, `staggered`, a walker's bob `gait`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|                      | `random.ts`          | seeded `hash2` and `rng`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|                      | `schema.ts`          | `defineScript` and the schemas a film declares its sound, voice, looks and shorts with (`Sound`, `Music`, `Movement`, `Voice`, `Looks`, `Shorts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|                      | `acts.ts`            | `membersOf` (each act's scenes, from its first scene until the next act's)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|                      | `sfx.ts`, `store.ts` | the sound library's declarations (`defineLibrary`) and the media store's (`defineStore`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `@bible/film/canvas` | `film.ts`            | `Frame` (t, dur, boil, mark, cue, at, keys, stagger, knob, spoken, hand), `SceneSpec`, `drawing`, `createFilm`, the compositor and its finish (`FilmSpec.finish`: vignette, grain), captions (`CaptionStyle`: font, colours, plate); `createFilm` refuses a finish or plate value the canvas cannot draw                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|                      | `ink.ts`             | path builders (line, quad, spline, ellipse) and shapes (`rectShape`, `ellipseShape`, a centred `plate`, `rounded`, a seeded `blob`), the variable-width brush `stroke` (its `boil`: `tick` redraws the wobble each boil tick, as ink does and by default; `crawl` lets a figure's line wander at most `CRAWL_MAX`, 0.3 px, a tick; `none` holds scenery's line; `closed` for a path that returns to its start: no end taper, and the wobble and swell run on round the seam, so an outline has no notch), and `sub(hand, k)`: a sub-hand on its own seed, so each piece of a drawing boils on its own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|                      | `cutout.ts`          | torn-paper `cutout` (rim, grain, shadow; an opaque face under flat state takes its pastel pre-blended per colour, `preblends`, unless the transform magnifies it, `magnifies`), `at` placement, `raised` (longer shadows for a nearer layer)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|                      | `fibre.ts`           | the paper fibre fixed to the paper: one seamless tile (a 1–2 px fibre inside a 50–150 px mottle at ±3–6 %), soft-lit over a multiplane backdrop in its plane's space by `planeFibre(ctx, view, w, h)` so a pan or push carries the grain with the plane (the tile pre-scaled to the plane's period and laid at a whole-pixel offset, never resampled; a turned camera samples it through the plane's transform); faces keep their own pastel grain (`cutout.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
|                      | `ground.ts`          | the contact shadow under something standing: `ground(ctx, x, y, w)`, a flat warm ellipse at 28 % (the direction's 15–30 %), its gradient made once per context; fade it with `globalAlpha`. The film kit's `person` lays one under the feet (`ground: 0` for a figure with nothing under it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|                      | `piece.ts`           | paper by meaning: `piece(ctx, shape, { color, role, outline, kind? }, hand)`; a `figure` is cut (thin light core) and outlined in ink, `scenery` torn (white fibrous rim) with no outline, `kind: 'ink'` a prop's letters (no core); a figure's edge and outline crawl, scenery's hold still (`boilOf`); a named `kind`/`line`/`boil` wins. The film kit's `piece(ctx, shape, color, hand, { role })` wraps it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|                      | `hand.ts`            | `floatingHand`: the one hand (given its figure's `HandBody`, it declares itself to a check probing hands), a mitten with a thumb and no arm, floating by its figure (`HandRoot`: shoulder, rest, away side, breath); at rest it bobs with the breath, and toward `{ to, reach, grip }` it swings on a soft arc about the shoulder, eased, and settles; a grip changed mid-act names the grip it `was` and morphs by `change`; `handAt` where it is (pure, no allocation), `closeHand` (the same hand close up with no forearm, palm up from above, a lifeline and two joint lines; `turn` turns a figure's mitten into it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|                      | `type.ts`            | glyph-by-glyph lettering: `write` (write / rise / pop), `measure`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|                      | `paper.ts`           | the sheet under everything, the faint film grain over everything (`Grain`, 0.03 by default since the paper carries its own, `fibre.ts`: pre-drawn sheets copied at the boil tick's shift), the vignette drawn once (`makeVignette`, multiplied in by `shadeBy`), `offscreen` canvases                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
|                      | `colour.ts`          | hex colours, `#rgb` or `#rrggbb`, typed `Hex` (a palette `satisfies Record<string, Hex>`; any other that gets through is refused, named): `mix` (a colour between two), `clearOf` (a colour at alpha 0 for a gradient to fade into)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
|                      | `glow.ts`            | soft light on the page: `sky` (a vertical gradient over the frame), `wash` (the same over any rect: a beam) and `glow` (a round light), each gradient, and `ground`'s, one `unitGradient`: made once per context at unit size by what it holds and placed by the transform, the last `GRADIENTS_KEPT` of each kind kept                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|                      | `scratch.ts`         | `Posed<T>` (a pose written in place every frame) and `reset(scratch, defaults)` (every default written back in one call, no allocation)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
|                      | `credits.ts`         | `creditRoll(title, cites, authors)`: the end roll from each beat's `cite`, scripture then each `Author`'s works, one entry a work, places merged, lines of at most `CREDIT_MEASURE` characters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
|                      | `camera.ts`          | pan/zoom over a scene's world; `multiplane`: planes at depth `z` (parallax, haze, blur off focus, shadows raised by nearness, `planeLift(z)`, unless a plane names its `lift`; the backdrop plane carries the paper fibre, `depth.fibre`, 0 for none); every drawn scene breathes once by `DRIFT` (3 % and 24 px), a push of `drift.zoom` and a slide of `drift.x` frame px that peak mid-scene and settle back (`sin(π·t/dur)`, pure in the frame's time), so a scene starts and ends as framed: through its outermost `camera` or `multiplane` when it frames one, as the outermost transform over its whole draw when it frames none (`hearingCameras`; `createFilm` draws a frame again the other way when a scene's last answer was wrong, so no pixel depends on the frame before); a scene may set its own in place of it, `drawing({ drift: 0, … })` (an end card that must not breathe); a shot's own `drift` is the share of it it takes, 0..1: `0` is designed stillness (the cross, the landing's last line) and `driftHeld(hold)` eases into it; a shot as data, `shotPath(REST, [[f.at('push'), FACE], [f.at('back'), REST]])` (each stop blends from where the earlier ones left the camera), over `lerpCamera(out, a, b, t)`; a deep push names `pushInto` as its stop's third element, `[f.at('through'), ICON, pushInto]`: zoom by a constant ratio about the one point both framings hold still, so its target never leaves the frame (every other leg stays a straight blend); a picture in picture (a callback in an icon) draws in `inset(ctx, draw)`, whose shots are its own and never the scene's outermost, so the scene breathes as it would without it |
|                      | `storyboard.ts`      | placeholder card for a beat with no drawing yet                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `@bible/film/player` | `render.ts`          | `mountRender` (the `?export` handle for the renderer); `narrated.ts`: `narratedFilms`; `face.ts`: `pictureFaces`, `SUBSETS` (a film's faces as script imports)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

`core` is pure and DOM-free, so the scripts and tests read it without a
browser.

Rules that keep renders deterministic: never call `Math.random` (use
`f.hand(key)` seeds and `random.ts` from `@bible/film/core`), and never keep
state between frames — compute everything from `f.t`. A callback, or a shot
carried over a cut, draws another scene's paper with `f.handsOf(message)` (found by its drawing, so a mistyped scene fails to compile):
that scene's hands as its own `f.hand` gives them, boiling on this frame's
tick; a drawing no scene of the film draws throws, naming the scene that asked. It frames what that scene
framed with its knobs, `f.knobsOf(thesis)('city')` (found by its drawing,
typed by its knobs, a lab edit to them included), never a copy of the point.

**Lint.** The repo's `film` oxlint plugin (`packages/film/lint/`, rules read
as `film/<rule>`) holds the rules a film's syntax can show, in `bun run lint`,
for every film:

| Rule                         | What it refuses                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `film/drawing-literal`       | what the lab's locator (`unlocatable` in `packages/film/src/tools/scene-source.ts`, the same code the lab edits with) cannot locate: a `drawing(…)` that is not a module-level `export const x = drawing({…})` (a drawing built in a function, one no export names, `drawing` off a namespace), a `timeline` or `knobs` that is not an object literal (inline, or a same-file module `const`) or is declared twice, a spread, and a scene with a timeline built without `drawing()`                                                                                                                                                                                                                                                                                                                                                                                      |
| `film/no-unprobed-ink`       | `stroke`, `strokeRect`, `fillText` or `strokeText` read off the raw context however it is spelled (`ctx.stroke()`, `ctx['stroke']`, `.call`, destructured), which `film check` cannot see cross text: draw with the kit (`stroke`, `write`, `block`), or wrap texture that never crosses text in the kit's `unprobed(ctx, () => …)` (imported by name, aliased, or off a namespace import; a local function named `unprobed` exempts nothing)                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `film/no-hand-timed-seconds` | a second written by hand, which the lab cannot reach, a sound cannot follow and a re-take leaves behind: `clamp(t / 2)` or `clamp((t - cue.end) / 1.5)` over the scene clock, `(t - cue.start) / 0.5`, `progress`/`envelope(t, …)` with a literal start or length, `keys(t, …)` on the scene clock, `cue.end + 0.5`, `f.mark('x') - 0.4`, `f.dur - 1.5` or `t - 4.2`, the clock compared with a second (`t > 3.5`, `t - cue.start > 0.5`), a second hidden in a module `const`, and a span whose literal `offset` sits over 1 s from its `mark` or the scene's `start`/`speech`. Declare a cue and read `f.at`/`f.keys`/`f.stagger`, anchored to a word pin, another cue (`after`/`with`) or the voice's end (`at: 'speechEnd'`); a pause the script means is a named cue with its reason in a comment. A rate (`Math.sin(t * 7)`) and a lead-in under 1 s are not times |
| `film/no-ease-on-cue`        | a cue's progress eased a second time, `ease.inCubic(f.at('plunge'))`: the span's `ease` already curves it, and the lab's picker cannot reach the second; a push is a `shotPath` stop with `pushInto`, another curve its own cue or `f.keys`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `film/framing-is-a-knob`     | in a scene file, a framing written out, `{ x: 1060, y: 580, zoom: 1.18 }`, or blended by hand, `zoom: lerp(1, 1.12, f.at('hold'))` or a scratch camera's `cam.zoom = lerp(…, 2.75, …)`: make it knobs read with `knobCamera`, a move a `shotPath` of them, a push that keeps going `pushOn` with a number knob. The unmoved frame and a framing derived from the scene's geometry pass; a framing shared across scenes lives in a set file                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `film/no-cue-remap`          | a cue split by a fraction written in the draw, `clamp(f.at('answer') * 4)` or `clamp((into - 0.75) / 0.25)` over a cue's progress: the part is a cue of its own, `{ with: 'answer', dur: 0.4 }` or `{ after: 'into', dur: 0.1, ends: true }`, which the lab can reach; a step part way through one, `f.at('sit') >= 0.3`, is a cue of no length at that instant, `{ with: 'sit', offset: 0.056, dur: 0 }`; an instant the drawing's own shape makes is read from the shape (a card shows its other side once edge on, `Math.cos(f.at('flip') * Math.PI) < 0`). A part that runs to the cue's end, `(x - a) / (1 - a)`, lands on it: `{ after: cue, dur, ends: true }`                                                                                                                                                                                                    |
| `film/span-ends-on-anchor`   | a span that lands on its anchor written as `offset: -d, dur: d` (its length twice, so a `dur` edit moves the landing): write `{ mark, dur, ends: true }`; and a `{ with: P, offset, dur }` whose offset and dur add up to its sibling `P`'s `dur` (it ends on P's end only by arithmetic, so a drag of P leaves it): write `{ after: P, dur, ends: true }` or `{ with: P, until: { cue: P } }`                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

One rule holds the tools as well as the films, over all of `packages/film` and
this app: `film/no-point-free-log` refuses a variadic logger (`Console.log`,
`console.*`, `Effect.log*`) handed point-free to a callback that is passed an
index, `Effect.forEach(lines, Console.log)`, which prints the index after
each line; write `(line) => Console.log(line)`.
