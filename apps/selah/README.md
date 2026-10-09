# Selah

A native, offline macOS menu bar app for memorizing Scripture. SwiftUI, SF typography, near-black surfaces, rounded controls, and short focused sessions. Requires macOS 14 or later.

## Run

```sh
./scripts/gate.sh
./scripts/build-app.sh
open dist/Selah.app
```

The build uses only Apple's installed tools; no third-party packages are required. The build script selects the installed macOS 26.5 SDK when using Command Line Tools because CLT's macOS 27 SDK references a SwiftUI macro plugin that only ships with full Xcode. It does not change `xcode-select` or system settings.

## Practice

1. Open **Library** and choose verses, a chapter, a book, or the whole Bible.
2. Open **Today** and begin a session of up to 10 verses. Due reviews come first, then new verses in canonical order. The default is 3 new verses per calendar day, shared across all goals.
3. Read a new verse, hide it, then recite aloud or type from memory. Reveal and compare. Optional first-letter hints limit the rating to Hard.
4. Rate Again, Hard, Good, or Easy. Ratings save immediately. Again returns in 10 minutes. Successful recalls begin at 1 day, then 6 days, then grow with the verse's ease factor. Keyboard: Command-Return hides/reveals; 1–4 select the visible ratings. Return begins practice from Today.
5. Use **Library → Read → Hide & Recite** to rehearse entire passages and the transitions between verses. This rehearsal does not change verse review dates.

In **Settings**, opt into native notifications and choose a 30-minute, 1-hour, 2-hour, or 4-hour rhythm. macOS may ask for notification permission. Selah keeps one pending invitation and avoids reminders before practice is ready. Clicking an invitation opens practice. Reminders are renewed while Selah is running; quitting stops renewal, though the already pending notification may still arrive. Opening the app or waking the Mac refreshes the schedule. Focus settings and macOS notification preferences affect delivery. Launch at login is not yet implemented.

Progress is stored atomically at `~/Library/Application Support/Selah/progress.json`. Goals, per-verse scheduling, settings, and review history survive relaunch. Overlapping goals share verse progress. A file that cannot be decoded is preserved and puts the app into read-only mode; inspect or restore the file using **Show Progress File**, then relaunch. There is no cloud sync or automatic backup yet.

## Learning design and limits

Retrieval practice and spacing underpin the flow. The first-letter scaffold and chapter rehearsal are product choices, not a claim that a Bible-specific optimal method has been established.

- [Karpicke & Roediger, The Critical Importance of Retrieval for Learning (2008)](https://doi.org/10.1126/science.1152408)
- [Research on retrieval and spacing (2016)](https://www.psychologicalscience.org/journals/psychological-science/0956797615617778/)
- [SuperMemo SM-2 source](https://www.super-memory.org/archive/english/ol/sm2source.htm)
- [Anki's current algorithms and FSRS](https://faqs.ankiweb.net/what-spaced-repetition-algorithm)
- [Apple MenuBarExtra](https://developer.apple.com/documentation/swiftui/menubarextra)

The initial scheduler is an **SM-2-derived baseline, not FSRS or an Anki clone**. Four ratings and a 10-minute lapse interval are adaptations. Review events retain the actual time, grade, hint use, and interval for a future FSRS migration. No automatic scoring or speech recognition: the user compares and grades their recall. “Recalled at least twice” is a progress signal, not a guarantee of memorization.

The whole Bible is a selectable long-term goal; it does not mean the app optimizes years of chapter/book-level retention yet. Chapter recitation currently supplements verse review without its own scheduling. Priorities for the next iteration: FSRS with independent reference fixtures, scored word-level feedback, and scheduled passage/transition reviews.

## Structure

- `SelahCore`: indexed corpus, goals, review queue, scheduler, cached readiness, and serialized storage transactions.
- `SelahApp`: SwiftUI scenes, state, native notification lifecycle, practice and reading views.
- `Tests/SelahCoreTests`: behavior tests for relaunch, daily limits, overlapping goals, hints, spacing, corrupt storage, and concurrent transactions.
- `scripts/gate.sh`: Swift formatting lint, compilation with warnings treated as errors, behavior tests, and corpus integrity checks.

This build is locally ad-hoc signed. Distribution signing, notarization, and App Store packaging are not configured.

## Responsiveness

Corpus decoding/indexing, readiness calculation, and atomic progress writes run away from the main UI actor. Views consume cached readiness and direct book/chapter indexes. Typing does not rescan the Bible or review log. Chapter rehearsal navigates pre-grouped chapters. Successful saves publish the next card; failures retain the current card and error state. Tab movement is 180 ms; verse reveal is 150 ms; both honor Reduce Motion.

Run `./scripts/benchmark.sh` for the full-size core workload: all 31,102 verses introduced, 50,000 review events, 50 queries of the same due queue, and one atomic save. On this Mac, before/after matched optimized builds measured approximately:

| Core operation                          | Original |  Current |
| --------------------------------------- | -------: | -------: |
| Average whole-Bible queue calculation   |  38.8 ms |   7.5 ms |
| Corpus decoding / decoding plus indexes |  35.4 ms |  37.0 ms |
| Atomic JSON save, 50,000 reviews        | 142.7 ms | 116.9 ms |

These are core timings, not measured UI frame times or end-to-end launch times. The key change is removing calculation and I/O from the UI thread. A save still must finish before a rating advances. The JSON format rewrites the complete history; an incremental SQLite store is a future scaling improvement for substantially larger histories.

Validation: formatting lint, warning-free Swift compilation, 8 passing behavioral tests, and corpus integrity checks. A locally signed application process was launched. The live practice window has been visually inspected, including onboarding, study/recall, hints, and passage selection. Native notification delivery remains unverified. Notifications are off until enabled in Settings.

## Text provenance

The bundled KJV was exported read-only from the existing Bible Tools corpus at `bible-tools/packages/core/data/bible.db`, with 31,102 unique verses across 66 books. Practice removes printed paragraph signs and italic brackets while retaining the original source text and supplied Psalm superscriptions. The source's version metadata states: “This Bible is in the Public Domain in most parts of the world. However, in the United Kingdom, it is under perpetual Crown copyright.” See `Sources/SelahApp/Resources/KJV-NOTICE.txt`. No other Bible Tools data is included.
