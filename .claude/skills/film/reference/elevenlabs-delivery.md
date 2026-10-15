# Delivery marks and what ElevenLabs is sent

How a line is said is written in it, beside its cues (`packages/film/src/core/delivery.ts`). The compiler turns the marks into what each ElevenLabs model takes (`compileDelivery`); the table below is its `MODEL_MARKS`, and a test (`tools/delivery-doc.test.ts`) compiles the worked example on each model and holds this page to what it sends. Checked against the ElevenLabs docs on **2026-10-14**.

## The marks

| Mark   | Written                      | Means                                                                                                                                                 |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stress | `{*}word`                    | land on this word (usually a sentence's last)                                                                                                         |
| Breath | `{/}` in a gap               | a short pause, about 0.3 s                                                                                                                            |
| Hold   | `{//}` or `{//1.5}` in a gap | a timed pause, 0.6 s unless it names its seconds (0.4 to 3 s, by tenths); `{//3}` is the held beat before a landing's last word (CRAFT rules 7 and 9) |

- A mark is in braces, so it is never spoken: a card, a caption, a word pin, the KJV check and the take's hash read the line without it. A brace that is no cue, turn or mark fails the line (`DeliveryInvalid`), so nothing unknown is ever read aloud.
- A stress belongs to the word after it; a pause to the gap before the word after it, never the line's first or last gap (the beat's `lead` and `tail` are its silence there). One pause a gap, one stress a word.
- In the lab's Script reader: tap a word (or select words), and the box under the line offers Stress, what stands in the gap before them (no pause, breath, hold) and a hold's seconds (0.4, 0.6, 1, 1.5, 2, 3). Each tap is written back into the beat's `say` in `script.ts`, words unchanged, and the beat is voiced again. Series drafts are read only: marks go in once a draft becomes a film's `script.ts`.
- A new kind of mark is a case of `Mark`, its token (`markOfToken`, `tokenOf`) and a row in `MODEL_MARKS` and here.

## What each model is sent

| Mark   | eleven_v4, eleven_v3 (audio tags)                                   | eleven_multilingual_v2, eleven_flash_v2_5 (SSML)                          |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Stress | the word in CAPITALS (approximate)                                  | not sent: these models have no emphasis control                           |
| Breath | `[pause] in the gap` (approximate: the tag's length is the model's) | `<break time="0.3s" /> in the gap` (approximate)                          |
| Hold   | `[pause] in the gap, then the gap set to its seconds` (exact)       | `<break time="…s" /> in the gap, then the gap set to its seconds` (exact) |

The line `Not {/} by works. {//1.5} By {*}faith.` is sent as:

| Model                                     | Sent                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------- |
| eleven_v4, eleven_v3                      | `Not [pause] by works. [pause] By FAITH.`                             |
| eleven_multilingual_v2, eleven_flash_v2_5 | `Not <break time="0.3s" /> by works. <break time="1.5s" /> By faith.` |

and on every model the gap before "By" is then set to 1.5 s in the take.

- **A hold is exact on every model.** No model times a pause to the tenth, so the compiler sends the model's pause and then sets that gap in the take to the hold's seconds (`holdsIn`, `withGaps`): silence put in, or taken out at its middle, with 5 ms fades, and every later word moved with it. A take so edited is kept as FLAC, never re-encoded lossy.
- **Degrades predictably.** A mark a model cannot say is left out of what it is sent, never written in another form, and the reader shows the line as marked: the owner sees what he asked, the take says what the model could.
- **Pace.** The delivery rules time a line at 150 to 165 words a minute, aiming at 155. eleven_v4 and eleven_v3 take no speed: measured on the staging voice (A1, "First the Blade staging", `uklw0mSGyyFcEsdp2z45`) at speed 1.0, 1.08 and 1.2 on eleven_v4, a take ran 24.2, 24.5 and 24.2 s (orchestrator, 2026-10-14); the voice reads about 156 wpm of its own, so its pace is its own. The earlier models take `voice_settings.speed` (0.7 to 1.2, text-to-speech only): the compiler sends the speed that brings the voice's measured pace to 155 (`speedFor`), and a `speed` in `voice.ts` wins. The dialogue endpoint takes only stability and similarity. The reader shows each beat's pace at its take's real length against 150 to 165.
- **Neighbouring text.** eleven_v4 and eleven_v3 read each line alone (no `previous_text` or `next_text`); the earlier models are sent the lines either side (`sendsNeighbours`).
- **The last sound.** ElevenLabs ends a take on its last sound, so a staging take keeps no tail padding (`TAKE_PAD.tail` 0) and `trimTail` never cuts into speech; a dropped or clipped last word is caught by the speech-to-text check (8% word error fails the take). Undocumented by ElevenLabs; kept as the repo measured it.
- **Alignment.** Whether the timestamps align a tag as characters is not documented; the narrator strips `[...]` and `<...>` from the alignment either way (`spokenAlignment`) and names each word as the line writes it.

## Staging takes, the cache and the day's cap

- One staging voice for every film: `stagingVoice` in `packages/film/src/core/staging-voice.ts`. A later voice (a clone) is that one line.
- What ElevenLabs sent (the reading) is kept by the SHA-256 of the request (the words as sent, the model, the voices, the settings, the neighbours where sent), and the take (that reading with each hold set in it) by the SHA-256 of the reading and its holds, in `~/.cache/bible-film/staging` (`FILM_STAGING_DIR`), shared by every checkout. The same line, marks, voice and model never cost twice, and a hold's seconds changed costs nothing (v4 is sent the same `[pause]`; the gap is set again here). The lab's reader and `film narrate` share the cache; two asking for one reading at once make it once. Audio is named by the SHA-256 of its bytes, so a name never comes to hold other audio. A person's take is never in it and never replaced.
- A take whose transcript is more than 8% from its line is kept but never Ready: the reader shows it refused, with what was heard. The fill reads it again once more the day it is found and once each day after, never more, so a fluke heals by itself at a bounded cost. `film narrate` reads it afresh (`--accept-mismatch` keeps it).
- Every request is charged before it is sent against the day's cap, `FILM_STAGING_DAILY_CAP` (100,000 characters by default); past it the take is refused (`StagingCapReached`) and nothing is sent. The reader shows the day's spend in one line.
- Tests and CI never call ElevenLabs: they run over the fakes in `packages/film/src/tools/testing.ts`.

## Sources (checked 2026-10-14)

- Best practices (pauses, emphasis, tags): https://elevenlabs.io/docs/overview/capabilities/text-to-speech/best-practices
- eleven_v4 (no style or speed sliders, no SSML): https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4
- Models and their limits: https://elevenlabs.io/docs/overview/models
- Pauses through the API: https://elevenlabs.io/docs/help-center/product/core-capabilities/text-to-speech/how-can-i-add-pauses and https://elevenlabs.io/docs/help-center/technical/do-pauses-and-ssml-phoneme-tags-work-with-the-api
- Audio tags: https://elevenlabs.io/blog/v3-audiotags and https://elevenlabs.io/blog/eleven-v3-audio-tags-precision-delivery-control-for-ai-speech
- Speed (v3 playground, no speed): https://elevenlabs.io/docs/eleven-creative/playground/text-to-speech
- Timestamps: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps and https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert-with-timestamps
- Request stitching: https://elevenlabs.io/docs/eleven-api/guides/how-to/text-to-speech/request-stitching
- Dialogue (2026-09-28 changelog, v4 and context): https://elevenlabs.io/docs/changelog/2026/9/28 and https://elevenlabs.io/docs/overview/capabilities/text-to-dialogue
