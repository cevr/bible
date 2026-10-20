# @bible/hymnal-app

The hymnal app (One). This README covers how the app reads the hymns, how it
plays their recordings, and where the recordings live and how they got there.

## The reader

One screen and a stack: the home screen lists all 695 hymns, number and
title. On a phone the list falls under sticky rows that name the hymnal's
topical sections (each hymn's topic is joined from the compiled
`topics.json` through `topicOf` when the app is bundled), and a pull down
shows a search field (number, title or first line) that opens a search
over the list. A gear in the title row opens Settings (appearance) as a
sheet. A hymn opens pushed over the home screen. A hymn shows its words in the order they are sung: each stanza
under its number, and the refrain written out each time it is sung.

- The words come from the compiled 1985 set (`@bible/hymnal`). The
  `virtual:hymnal` plugin (`vite/hymnal.ts`) derives them when the app is
  bundled, for the web and the native bundle alike, so the app opens offline
  and no derived file is committed.
- The colours are palette A, Wada No. 167, as nine roles (ground, ink,
  muted, line, accent, soft, onAccent, the text on an accent fill, and
  pressed and onPressed, a held accent fill and its text) in
  light and dark in `src/theme.ts`; a screen reads a role, never a hex value. On iOS each role is a `DynamicColorIOS`
  (`src/color.native.ts`), on the web a CSS `light-dark()` property
  (`src/color.ts`). Android keeps the system's colours. `src/theme.test.ts`
  holds every text role to WCAG AA on what it sits on.
- The phone's list is a Legend List (`src/reader/HymnList.native.tsx`):
  each row of a kind has one height from the text size, the topic rows
  stick under the status bar, and the search field sits above the first
  row, the list opening scrolled past it (`src/home/Home.native.tsx`).
- One's web navigators are headless, so `src/web/` draws a small header and
  search field on the web, and the web's home screen shows the search field
  above the list, with no topic rows. A phone never renders them.
- On the web a screen is mounted anew when the reader comes back to it, so
  the search's query and each list's scroll offset live in the app's
  registry (`src/reader/place.ts`), not in the screen. A list keeps its
  offset as it unmounts and opens there again before its first paint, and
  holds its opening props only until it is there. A list at its top renders
  as the server rendered it, whatever the window, so hydration keeps it.
  Every row is one line of one height (a long title ends in an ellipsis), so
  the list can open at any row at once (`src/reader/HymnList.tsx`). On the
  web a list puts the keyboard away only when the reader drags it with a
  finger, so its own scrolls never take the search field's focus
  (`src/reader/keyboard.ts`).
- Each row is a link (an anchor on the web): a press opens the hymn inside
  the app; Enter, a Cmd-click and "Open in New Tab" work as on any link.
- `bun run test` runs the app's tests (`src`, with `src/test/setup.ts` as the
  preload: react-native-web for `react-native`, the real words for
  `virtual:hymnal`, a happy-dom document for the tests that press and type),
  the browser tests and the infra's: the browser tests beside the other two,
  which run one after the other, and it fails when any of them fails.
  `HYMNAL_LIST_SEED` reaches the browser tests through turbo too (`bun run
  gate`, `bun run test:budget`).
- `bun run test:browser` (`test/browser/`) renders the home screen's list and
  its search results on a server, hydrates them in Playwright's Chromium, and drives
  them: hydration keeps the server's list and a scroll made before it (the
  page hydrates once that scroll's own event has come, so the list must be
  told of it); Back,
  the header's back link and a switch to the other list (the test's own
  links between the list and the search), at offsets across the whole list
  and window heights from 320 to 1400 px, come back within one row with
  every row on screen drawn (a press at once whose list heard of the last
  scroll before it left is made again, up to three tries, and the run prints
  how many were); the search field keeps the reader's focus;
  and a row is a real link. Its cases are drawn from that whole domain by a
  seeded sampler (`test/browser/visits.ts`), every pair of values meeting in
  each run and each visit leaving from its own offset; the run prints its
  seed, and `HYMNAL_LIST_SEED=<seed>` runs its cases again. It needs
  Chromium installed once (`bunx playwright install chromium`).

## The player

A hymn page plays the hymn's 1985 recording from `audioUrl(n)`: a Play or
Pause button in the accent (a `UIButton`'s title on iOS, an accent fill
under the onAccent text on the web and Android), a bar to seek, and the time played and the
length. The recording plays on when the reader leaves the hymn, and a bar
docked at the foot of the screen shows the hymn playing (its number, title and Play or Pause);
a press on it opens the hymn. Playing another hymn replaces the first.

- `src/player/player.ts` holds the player: its states (idle, loading,
  playing, buffering, paused, ended, stopped, failed) as an Effect atom, and
  the commands that move it. It plays through the `Playback` service;
  `playback.live.ts` is One's `Audio` session (AVPlayer on iOS, MediaPlayer
  on Android, an `<audio>` element on the web). The page shows the reader's
  ask at once (a Play loads, a Pause pauses), before the device answers it.
  One's `Audio` sends no status events and no byte counts, so the player
  reads the status every 250 ms and proves what the device does from those
  reads (`src/player/proof.ts`).
- A read is the device's state at one unknown instant between its ask and
  its answer. Two reads with no act between them prove silence when the
  place stayed within 2 ms and both say `loading` or `playing`, whatever the
  gap; they prove sound when the place moved on and the second says
  `playing`. An act (a page command, a lock-screen press, a play from a
  place) that moves the device is pending until it lands, and a read's
  place never lands it: One answers a seek only at its completion, so the
  act lands at the answer of the page's seek (or of a play's seek) when the
  answer's place lies from its target (clamped to the length) to the target
  plus the time since the page learnt of it, each within 2 ms (One rounds a
  place), or the answer says `ended`. A read of `ended` lands every act. A
  lock-screen seek with a place is the page's own seek, asked again; a seek
  the device refused, answered outside its window, or a newer command cut
  off is asked again while the device holds the recording. Two reads at one
  place still prove silence while an act is pending.
  No pair is taken across an act or while one is pending, no length of a
  gap and no count of reads proves anything, and the player alone owns the waits; the adapter
  asks a play's place again while the device holds the recording, and never
  gives up by its own clock.
- The rules. **P1:** after each act that asks for sound (Start, Resume, the
  lock screen's play) the page shows Loading until a pair proves sound, or
  Buffering once the load (each `play`) has sounded; a seek or a
  lock-screen act before that proof keeps the tag. **P2:** Playing at the
  first read that closes a sound pair while the device says `playing`; a
  landing ends it until a pair after it. **P3:** silence proved for 2 s
  shows Buffering after the first sound, Loading before it. **P4:** a wait
  starts at the answer of the first read of the silence run after the
  latest act, never earlier, and each act starts it again. **P5:** Failed
  (offline, with the reader's place) and one `stop`, once silence has been
  proved for 15 s while the reader wants to hear and One's `Network` told
  offline 15 s before, both at one read's ask; a device that says `failed`
  shows Failed at that read. **P6:** online, the same 15 s after the first
  sound shows Retry beside Buffering, and the device plays on. **P7:** the
  reader's place is where a sound pair last left the device, or the latest
  seek since; Failed and Stopped carry it, and a Resume from them, from
  Buffering with Retry, or from the lock screen on any of them, plays from
  it. A Start plays from 0:00. **P8:** Ended once a read says `ended`, and
  only then; an end leaves no place, so a Resume from Ended plays from 0:00, or follows a phone that
  already plays the recording again (the lock screen's play acts before
  the page hears of it).
- The page says each state in a line beside its button (`src/player/PlayerControl.tsx`):
  Loading and Buffering read "Loading the recording…" with Pause; Failed
  reads "The recording needs a connection." offline, else "The recording
  could not be played."; Stopped reads Paused. Retry (Resume) shows beside
  a Failed page, and beside Buffering once it offers Retry. An act clears
  Retry, as it starts the wait again. The lock screen's announce runs beside
  the reads, never ahead of them.
- A Pause before the first sound stops the recording: the page shows
  Stopped with the reader's place, and the device lets it go. iOS keeps
  such a pause, but Android's MediaPlayer starts once prepared and the web
  rejects the waiting `play()`, so one rule serves all three: Stopped, and
  a Play from the place. A `paused` the reader did not ask for (an
  interruption, or a lock-screen pause) shows Paused, and the page asks the
  device to pause once: Android starts a recording paused before it was
  prepared and says `paused` over its sound (`HybridOneAudio.kt:199-204`).
- The order the rules rest on (inferred from One 2.8.1 and Nitro 0.37.1,
  not measured on a device): a phone applies a lock-screen press and calls
  the app's listeners in one main-thread task (iOS
  `ios/Nitro/HybridOneAudio.swift:698-727`, Android
  `HybridOneAudio.kt:971-1015`), and a status read resolves in a later one
  (iOS `:159` and `:826`, Android `:230-234`); Nitro sends the listener call
  and the read's promise to JS through one `CallInvokerDispatcher`
  (`cpp/utils/JSCallback.hpp:106-114`,
  `cpp/threading/CallInvokerDispatcher.hpp:24-25`,
  `cpp/jsi/JSIConverter+Promise.hpp:56-68`). So the page knows every press
  before it handles a read that shows it. On the web the Media Session's
  handlers are the page's own. A later One that tells presses on another
  path breaks this order, and with it the rule that one pair proves sound.
- Known gaps. **1:** a server that stops sending while online leaves the
  page in Loading or Buffering; after the first sound Retry shows after
  15 s. **2:** Android sounds from 0:00 for a moment before a play from a
  place lands (MediaPlayer's lead-in; a gap of One's session player, still
  there in 2.9.0).
  **3:** a host pause hides what happens inside it: a connection blip One
  tells no change for, or sound no read sampled, is unseen, and the page
  keeps the place from before it.
- The app announces the hymn to the lock screen and Control Center once
  per recording, once the device holds it, and follows their play, pause
  and seek: each press is a command of the
  player, as the page's own buttons are. On a phone the session moves
  first and tells the app; on the web the page sets the Media Session's
  handlers itself, after One's `play`, `stop` and `setNowPlayingInfo`
  (One's handlers wait for the element to play before they tell), so a
  press shows on the page at once (`src/player/playback.live.test.ts`).
  `vite.config.ts` turns on
  `native.app.audio.background`, so the prebuild writes the `audio`
  background mode (iOS) and the media playback service (Android).
- The bar is docked under the stack, above the home indicator, on every
  platform while the player holds a hymn (`app/(hymnal)/_layout.tsx`); the
  lock screen also controls the recording.
- The seek bar is `One.iOS.Slider` on iOS (it seeks once the thumb rests for
  300 ms, as the slider reports no release), `One.Android.Slider` on Android
  and a range input on the web. On the web a press belongs to the pointer
  that opened it with the main button: it opens at that pointer's
  `pointerdown` and ends at the first of its `pointerup` (the drag seeks
  when it ends on another second than it began on), `pointercancel` or
  `lostpointercapture` (the drag is dropped); another pointer, another
  button and a key end nothing. The browser's `change` ends nothing, as
  Chrome sends none for a drag that comes back to where it began. The bar
  steps its own keys (the arrows, PageUp, PageDown, Home and End, by the
  browser's steps): a key's step seeks at once, inside a press or not, and
  a key that moves nothing (held at an end) leaves nothing behind. A value
  change with no press open (a screen reader's) seeks at once. After a seek, each
  bar holds the place sent until the player reaches it, or for 2 s. The
  played part of the track is in the accent, the rest in the line role;
  while the length is unknown the bar is disabled and its thumb is muted.
- `src/player/bar.property.test.tsx` holds the web bar to these rules over
  seeded runs of presses, all eight step keys (held, repeated with
  `repeat` set, their keyup lost) and modifiers held (each event says
  them), other pointers and buttons, a screen reader's steps and
  playback's ticks, from anywhere on the bar and often its ends, in
  Chrome's event order.
- `src/player/world.property.test.ts` holds the page to these rules in a
  world of One's devices (`src/test/world.ts`, measured constants from the
  iOS and Android captures): seeded runs on iOS, Android and the web of
  slow and silent loads, dry spells, iOS's closed socket, failures, host
  pauses with presses and connection changes inside them, lock-screen and
  page acts at any phase, landings that lag, and the end. The world judges
  the page at each step by what the device did, never by what the page
  proved, by the rules O1 to O10 (O10: a page turns from Playing to
  waiting only after the stand of silence); each earlier counterexample is
  a fixed case. A deep sweep runs by
  hand: `WORLD_SEEDS=8000 bun test --preload ./src/test/setup.ts
  src/player/world.property.test.ts -t seeded`.
- The tests run the player over a device the test holds
  (`src/test/device.ts`): each state and move in `src/player/player.test.ts`,
  and the page's control and the bar, pressed in a document, in
  `src/player/ui.test.tsx`.

## Recordings: R2 at hymns.cvr.im

The 1985 SDA Hymnal's recordings are in the Cloudflare R2 bucket `cvr-hymns`,
served publicly at `https://hymns.cvr.im`. The app builds each URL from
`src/remote.ts` (`audioUrl(n)` is `https://hymns.cvr.im/audio/warm-1/sdah/<n>.mp3`).
That module imports only `@bible/hymnal/recordings`, which imports nothing, so
the app, Vite and the infra all read it.

Key layout:

- `audio/<set>/sdah/<n>.mp3`: hymn `n` of the 1985 hymnal in a rendered set,
  with the number unpadded. The app plays the set `RECORDING_SET` in
  `packages/hymnal/src/recordings.ts` (`warm-1`). A set is rendered from the
  hymnal's MIDI files (`packages/hymnal/README.md`, "Recordings") and is never
  replaced: changed recordings are a new set (`warm-2`) beside it.
- `audio/sdah/<n>.mp3`: the recordings copied from the old S3 bucket
  (`sourcedKey(n)`). They stay, so going back is one constant.
- `data/`: reserved for the compiled hymn data.

Settings → About credits the instruments the sets are played on
(`src/about.tsx`), as the Salamander piano's CC BY 3.0 licence asks.

### The stack

`alchemy.run.ts` declares one resource, the bucket (`infra/bucket.ts`):

- The custom domain is `hymns.cvr.im`. The `r2.dev` host stays off, because it
  is rate-limited and meant only for development.
- CORS allows `GET` and `HEAD` from any origin, with `range` allowed for seeking.
  It exposes `content-length`, `content-range`, `etag` and `accept-ranges`.
- The bucket is adopted when it exists and retained on destroy, and
  `forceDestroy` is off. A deploy therefore never deletes the recordings.
- Only the stage `prod` exists. The stack refuses any other stage, because a
  second stage would take the same bucket and domain.

State lives in the Cloudflare state store. No CI workflow deploys this stack.

### The copy job

`bun run audio:copy` copies the recordings from the old S3 bucket
(`https://cvr-hymns.s3.amazonaws.com/<n>.mp3`, which the old Expo app still
plays) into R2. The code is in `infra/audio/`.

- It reads hymns 1 to 695 with S3 HEAD requests, because S3 refuses to list.
  On a single key, 403 means absent. Any other status except 200 is retried
  and then fails the key. It never counts as absent.
- S3 has no `388.mp3`. A key absent from S3 is filled from the owner's
  `cevr/sda-hymns` repo, pinned at commit `4645e76c`. The job uses a fill only
  after its size and git blob SHA-1 match the tree. Each fill prints its own
  `fill <n> github <bytes>` line. More than 10 fills prints a warning, because
  S3 may be refusing reads.
- It checks each upload: S3's bytes must match their ETag's MD5 (for a
  multipart ETag, their size), and R2's reply must carry that MD5 and size.
  At the end, the job lists R2 again and checks all 695 keys.
- It is idempotent and resumable. A key that R2 already holds with the same
  size and MD5 is kept. A failed key does not stop the other keys, also when
  an answer breaks after its headers. The run exits non-zero when any key
  failed or is missing, and a rerun copies only what is still missing.
- Both R2 calls go through distilled's Cloudflare protocol, so they fail and
  retry as distilled's own calls do: up to 8 retries with capped backoff.
  Distilled retries a 403 only when its message names a transient auth blip
  (code 10000 "Authentication error", code 10001 "internal error" or "Unable
  to authenticate request"). A permission denial, such as code 10001 "Method
  not allowed for token", fails at once. A final failure keeps Cloudflare's
  code and message. Each download, each upload and the R2 listing fail after
  3 minutes without completing, retries included.
- `x-amz-meta-title` is not copied, because the REST upload has no custom
  metadata. Titles come from the hymnal's own data.

`bun run audio:copy --dry-run` reads only the public sources: the S3 HEADs,
the GitHub tree, and the fill's bytes. It does not touch R2 or the Cloudflare
profile. It prints what would move and ends with:

```
audio-copy dry-run s3=694/1574581124 github=1/2991377 missing=0 total=695/1577572501 target=unread
```

A real run ends with
`audio-copy run … target=kept K uploaded U failed F verified V/695`.

`bun run test` runs the copy job's tests against fake stores, and the adapters'
tests over a recording HTTP client. Neither uses the network.

### The upload

`bun run audio:upload --set DIR` uploads a rendered set (the folder the render
writes, `~/.cache/manna-hymn-render/sets/warm-1/` by default) into R2 under
`audio/<set>/sdah/<n>.mp3`. The code is `infra/audio/upload.ts`, and its plan
is `infra/audio/upload-plan.ts`.

- It refuses the set before any upload unless its `manifest.json` is the set
  the app plays and holds hymns 1 to 695 once each, each with its own key and
  each passed, and unless every MP3 has the manifest's sha256, MD5 and size.
- It lists the set's prefix once. A key R2 holds with the manifest's size and
  MD5 is kept. A key R2 lacks is uploaded, 4 at a time, as `audio/mpeg` with
  `cache-control: public, max-age=31536000, immutable`, and R2's reply must
  carry that MD5 and size.
- A key R2 holds with other bytes is a conflict. It is never replaced: the run
  says to bump the set to `warm-2`. That refusal is what makes `immutable`
  true.
- At the end it lists the prefix again and checks every hymn. A failed hymn
  does not stop the others, the run exits non-zero unless all 695 are
  verified, and a rerun uploads only what is still missing.

`--dry-run` reads and checks the local set only. It does not touch R2 or the
Cloudflare profile. Both modes end with
`audio-upload <run|dry-run> set=warm-1 kept K uploaded U conflict C failed F verified V/695`.
A real run writes with the owner's Alchemy Cloudflare profile, as the copy job
does, and runs before the change that points the app at the set reaches
`main`, so the app never plays keys that do not exist.

### Deploy and copy

The orchestrator of the run that made this app runs these steps after the
change merges, from its detached main worktree
`~/Developer/personal/.rifts/bible-tools/hymnapp-main` (never the main
checkout, which another agent edits), in this order. It stops at the first
result that differs from the expected one:

1. `cd ~/Developer/personal/.rifts/bible-tools/hymnapp-main/apps/hymnal && bun run plan`.
   Expected result: one create, a `Cloudflare.R2.Bucket` named `cvr-hymns`
   with the domain `hymns.cvr.im` and the CORS rule. Nothing else.
2. `cd ~/Developer/personal/.rifts/bible-tools/hymnapp-main/apps/hymnal && bun run deploy`.
3. `cd ~/Developer/personal/.rifts/bible-tools/hymnapp-main/apps/hymnal && bun run audio:copy`.
   Expected last line: `… uploaded 695 failed 0 verified 695/695`. Run it
   again. Expected: `kept 695 uploaded 0`.
4. Probe (read-only; anyone can run it after step 3):
   `curl -sI https://hymns.cvr.im/audio/sdah/1.mp3` returns 200,
   `content-length: 2313865` and `content-type: audio/mpeg`.
   `curl -sI -H 'Origin: https://example.com' https://hymns.cvr.im/audio/sdah/388.mp3`
   returns `access-control-allow-origin`.
5. Listing (read-only):
   `cf r2 objects list --bucket-name cvr-hymns --prefix audio/sdah/ --per-page 1000`.
   Expected: 695 keys under `audio/sdah/`, `audio/sdah/1.mp3` to
   `audio/sdah/695.mp3`.

A key that fails in step 3 is retried by running step 3 again: the job copies
only what is still missing, and its `failed <n>` line gives Cloudflare's code
and message. Never upload a key with `cf r2 objects put`: it percent-encodes
the key's slashes, so the object would not land at `audio/sdah/<n>.mp3`.

The owner's Alchemy Cloudflare profile must allow these writes:

- R2 bucket write and R2 object write.
- Zone and DNS write on `cvr.im`, for the custom domain.
- The account listing (`memberships.read`), so that Alchemy can find the
  account.

Every stack in this repo shares the profile, and Cloudflare is already
connected to it. If a step fails on scopes, the owner runs
`! bunx alchemy profile edit --reconfigure Cloudflare` and chooses All Scopes
(recommended). With Custom, he chooses at least `memberships.read`,
`zone.read`, `dns.read`, `dns.write`, `workers-r2.write` and
`workers-r2-bucket-item.write`, plus the scopes that the other stacks
(`apps/egw-search`, `apps/triedgold`, `apps/animations`) already use.
`--add Cloudflare` is only for a profile that has no Cloudflare yet: on a
connected profile, Alchemy refuses it ("already connected").

The S3 bucket stays. The old Expo app still reads it, so its deletion is the
owner's decision.
