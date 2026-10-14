# Selah

An offline SwiftUI menu bar app for memorizing Scripture on macOS 26+. Learn whole chapters at once or verse by verse, or learn curated promises by category. Liquid Glass is used only for controls and chrome; Scripture sits on a calm page surface in Georgia, with verse-number gutters, supplied-word italics, and red-letter text. Appearance follows the system or a chosen light or dark mode.

## Run

From the Bible Tools root, use `bun run --filter @bible/selah gate` or `bun run --filter @bible/selah build`. The commands below run from `apps/selah`. Native tasks explicitly skip other operating systems; `.github/workflows/selah.yml` validates SwiftUI on macOS. Native builds bypass Turbo artifact caching because SDK and code-signing state belong to the local machine.

```sh
./scripts/gate.sh
./scripts/build-app.sh
open dist/Selah.app
```

For launch at login, keep the packaged app in a stable location such as `~/Applications/Selah.app` and enable **Settings → Automation → Launch at login**. Selah uses Apple's `SMAppService.mainApp`; its control reflects the actual registration status and exposes Login Items settings if macOS needs approval. Login launches hide the practice window and leave the menu bar app available. Actual login execution has not been tested by logging out.

The build uses Apple's tools and the maintained [Swift FSRS package](https://github.com/open-spaced-repetition/swift-fsrs), pinned to revision `4fbaf20184d62f82a9f44f343337c61a2c5483e9`. It selects the installed macOS 26.5 SDK when using Command Line Tools because CLT's macOS 27 SDK references a SwiftUI macro plugin that requires full Xcode. It does not change `xcode-select`.

## Practice

1. Choose verses, a chapter, a book, or the whole Bible in **Passages**. Chapters, books, and the whole Bible learn **Whole chapter** by default; **Verse by verse** stays available per passage and can be switched later. Overlapping goals share verse progress.
2. Begin in **Today** (Return). A new whole chapter is read through once, then recited whole. Each verse carries a cue: full text, first letters, or nothing but its number. Cues start at first letters, or at nothing for verses you already know. **Show Letters** reveals one hidden verse and marks it as slipped.
3. Reveal (Command-Return) to see the chapter verse by verse with missing words underlined. A verse slips when at least a tenth of its words are missing; you can mark or clear any verse yourself. Extra or changed recalled words are in a disclosure. Comparison ignores case and punctuation, runs after reveal away from the UI thread, and is limited to one chapter of up to 6,000 words.
4. Choose a grade (keys 1–4). The whole chapter is one FSRS card from the first day. After a grade, slipped verses get more cue and the rest get less (Again keeps cues as they were). A chapter counts as learned when every verse stands without a cue, none slipped, and the grade is Good or better. Easy needs a recall with no cue and no peek; first-letter hints on a verse or passage limit grades to Again or Hard. Feedback informs your own grade; it does not grade automatically.
5. One new whole chapter starts per day at most, and the next chapter of a passage waits until the current one stands without cues. Verse-by-verse goals keep the earlier flow: a few new verses per day (default three), and the chapter joins review after every verse has two successful recalls. Chapter cards never change individual verse dates.
6. **Promises** lists 14 curated KJV categories (158 promises, 10–12 each, one to three verses and at most 70 words). Open a category to read its promises, then **Add to Practice**. Promises join the daily new-item allowance in turn with your verses; a single-verse promise shares its verse card with any passage that contains it. Each category shows how many promises are learned. Tests resolve every reference against the bundled KJV.

**Read → Memorize Chapter** starts any full chapter immediately, with its cues.

The scheduler is canonical **FSRS 6**, with default FSRS 6 weights, short-term learning steps, 90% target retention, and no interval fuzz so previews match saved schedules. Target retention is an algorithm setting, not a promise of Bible-specific performance. New-card learning steps are 1 and 10 minutes; graduated intervals adapt to elapsed time and grades. Relearning uses the package's 10-minute step. Raw review events are retained. The reference FSRS 6 interval sequence is checked independently in tests.

When opening v1 progress, Selah first backs up the original JSON, replays review history into FSRS state, and preserves existing due dates until the next grade. Corrupt or unsupported progress files are preserved and open read-only.

## Reader settings, book rehearsals, and dictation

**Settings → Reading → Typography → Reader Settings…**, or the typography button in the reader, opens a native sheet with a live Scripture preview. Apply saves the draft; Cancel leaves saved preferences unchanged. Defaults are Georgia at 22 pt, 1.55× line height, zero character spacing, 8 pt between verses, and an extra 16 pt at source paragraph marks. Choose Georgia, Palatino, Baskerville, or the system font; adjust text size, leading, character spacing, paragraph spacing, verse spacing, verse numbers, and red letters. Supplied-word italics remain intact. Restore Tasteful Defaults resets the preview before applying. Settings persist across launches and apply to reading and practice.

From **Passages → Read**, the reader's **⋯** menu offers **Rehearse [Book]** to start the entire book in canonical chapter order. Each chapter has its own study, recall, word comparison, and grade. Only chapters you actually grade acquire review events; ending early leaves the remaining chapters untouched. Chapter cards remain independent of verse cards.

**Settings → Practice → Enable optional dictation** defaults off. During hidden recall, press **Dictate** to request microphone and speech permission and transcribe English on the device. Existing typed recall is retained as a prefix. Stop Dictation, revealing, advancing, ending practice, leaving practice, or switching apps stops capture. Speech recognition must support on-device English; there is no network fallback. Denied permissions and unavailable recognition show a message and leave typed recall usable. Transcription is optional and never assigns a grade. [Apple documents the on-device requirement](https://developer.apple.com/documentation/speech/sfspeechrecognitionrequest/requiresondevicerecognition).

## Reading and margins

The menu-bar popup is a compact launcher: reviews ready, Begin Practice, Read, Open Selah, and Quit. It never embeds the reader, practice session, Passages, Promises, or Settings. The main window uses a sidebar (Today, Passages, Promises, Settings; Command-1 to 3 and Command-comma).

The reader opens in its own native window, centered in the active display’s usable area every time you choose Read, including from the menu bar. It remains open independently of the menu-bar popover.

Scripture is selectable, uses a restrained line length and generous leading, and preserves supplied-word italics and red-letter quotations. **Settings → Reading → Show margin notes** defaults off for uninterrupted memorization. Enabling it adds small lettered anchors and collapsed note disclosures; selecting a note opens a native popover. Notes whose phrases do not match the printed verse remain available in the disclosure.

This interpretation follows the deleted Bible Tools web/desktop shared renderer, inspected at commit `a639e74d1^`: `packages/core/src/bible-rendering/segments.ts` and `packages/app/src/reading/verse-segments.tsx`. Selah does not include its wiki/Strong's study features.

## Automations and storage

- **Launch at login:** native macOS registration for the installed app. [Apple's service API](https://developer.apple.com/documentation/servicemanagement/smappservice/mainapp) and [login launch event](https://developer.apple.com/documentation/coreservices/keyaelaunchedasloginitem).
- **Daily backups:** on by default. Save the first valid snapshot of each local day, retain the latest 30 daily snapshots, and never overwrite that day's first snapshot. Backups occur at launch, during maintenance, and before the day's first progress mutation while Selah is running. Backup failures are shown in Settings and do not discard a successful grade.
- **Quiet-hour reminders:** default quiet window 10 PM–8 AM, adjustable or disabled. An invitation waits until both practice readiness and the chosen cadence, then moves past quiet hours. Scheduling handles overnight windows, time-zone changes, and DST gaps. Equal start/end times mean no quiet window. Native notification permission and Focus determine delivery.

Progress is written atomically to `~/Library/Application Support/Selah/progress.json`; backups are in the adjacent `Backups` folder. For development, `SELAH_DATA_ROOT=/some/folder` points the app at a separate folder (`progress.json` and `Backups` inside it), so a test build never touches real progress. **Show Progress File** and **Show Backups** open Finder. To restore a backup, quit Selah, preserve the current file, copy the chosen snapshot to `progress.json`, then relaunch.

Selah keeps one pending notification. It renews invitations while running; quitting stops renewal, though an already scheduled invitation can still arrive. Opening the app and waking the Mac refresh the schedule. Clicking a notification opens practice. Native scheduling and authorization were inspected live; actual banner delivery has not been verified.

## Responsiveness and validation

Corpus preparation, readiness calculation, comparisons, storage, and backups run away from the main UI actor. Views use immutable indexes and cached readiness; typing does not scan Scripture or review history. Ratings advance only after an atomic save succeeds. Reveal motion honors Reduce Motion.

`./scripts/benchmark.sh` uses the real corpus, all 31,102 verse cards, and 50,000 review events. On this Mac, an optimized build measured:

| Operation                                            |              Time |
| ---------------------------------------------------- | ----------------: |
| Corpus decoding, indexes, and rendering plans        | 477 ms at startup |
| Psalm 119 word alignment with 197 omissions          |              3 ms |
| Average whole-Bible verse/chapter queue calculation  |           11.6 ms |
| Atomic JSON save with 50,000 reviews and FSRS states |            210 ms |

These are core timings, not measured frame or end-to-end launch times. JSON saves rewrite the complete history; an incremental store remains a future scaling option.

The full gate checks formatting, warning-free compilation, 27 behavior tests, and corpus integrity. Tests cover independent FSRS intervals, v1 migration, daily limits, relaunch, independent chapters, hint grading, concurrent storage transactions, corruption preservation, nested italics/red letters, margin anchors, recall alignment, overnight quiet hours, DST gaps, and immutable backup retention, successful saves when backup storage is unavailable, whole-chapter cues and scheduling, recall segments and slipped verses, decoding the real pre-whole-chapter progress file without loss, and promise references and turn-taking. Packaged app screens, native margin popovers, reader preview resizing, Cancel/Apply, and the Psalms book rehearsal entry were inspected live. No test grades were recorded in user progress.

## Text provenance

The bundled KJV was exported read-only from `bible-tools/packages/core/data/bible.db`: 31,102 unique verses across 66 books and 7,320 margin notes. Raw source text and Psalm superscriptions are retained; printed markup is interpreted for display. The source metadata notes the KJV's public-domain status in most jurisdictions and perpetual Crown copyright in the United Kingdom. See `Sources/SelahApp/Resources/KJV-NOTICE.txt`.

This build is locally ad-hoc signed. Distribution signing, notarization, and cloud sync are not configured. Dictation has the required microphone and speech usage descriptions; actual microphone transcription has not been exercised during verification.
