# @bible/hymnal-app

The hymnal app (One). This README covers how the app reads the hymns, how it
plays their recordings, and where the recordings live and how they got there.

## The reader

Three native tabs: Hymns (all 695, number and title), Search (number, title
or first line, in the native header's search field) and Settings
(appearance). A hymn shows its words in the order they are sung: each stanza
under its number, and the refrain written out each time it is sung.

- The words come from the compiled 1985 set (`@bible/hymnal`). The
  `virtual:hymnal` plugin (`vite/hymnal.ts`) derives them when the app is
  bundled, for the web and the native bundle alike, so the app opens offline
  and no derived file is committed.
- The colours are palette A, Wada No. 167, as six roles (ground, ink, muted,
  line, accent, soft) in light and dark in `src/theme.ts`; a screen reads a
  role, never a hex value. On iOS each role is a `DynamicColorIOS`
  (`src/color.native.ts`), on the web a CSS `light-dark()` property
  (`src/color.ts`). Android keeps the system's colours. `src/theme.test.ts`
  holds every text role to WCAG AA on what it sits on.
- One's web navigators are headless, so `src/web/` draws a small tab bar,
  header and search field on the web. A phone never renders them.
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
  the browser tests and the infra's.
- `bun run test:browser` (`test/browser/`) renders the Hymns and Search
  screens on a server, hydrates them in Playwright's Chromium, and drives
  them: hydration keeps the server's list and a scroll made before it; Back,
  the header's back link and a tab switch, at offsets across the whole list
  and window heights from 320 to 1400 px, come back within one row with
  every row on screen drawn; the search field keeps the reader's focus;
  and a row is a real link. Its cases are drawn from that whole domain by a
  seeded sampler (`test/browser/visits.ts`), every pair of values meeting in
  each run and each visit leaving from its own offset; the run prints its
  seed, and `HYMNAL_LIST_SEED=<seed>` runs its cases again. It needs
  Chromium installed once (`bunx playwright install chromium`).

## The player

A hymn page plays the hymn's 1985 recording from `audioUrl(n)`: a Play or
Pause button in the accent, a bar to seek, and the time played and the
length. The recording plays on when the reader leaves the hymn, and a bar
above the tabs shows the hymn playing (its number, title and Play or Pause);
a press on it opens the hymn. Playing another hymn replaces the first.

- `src/player/player.ts` holds the player: its states (idle, loading,
  playing, buffering, paused, ended, failed) as an Effect atom, and the
  commands that move it. A recording that loads again mid-hymn keeps its
  bar and its times, and shows the reader's last ask: after a play it
  buffers with Pause (a stall, a seek past what the device holds, or iOS's
  wait of a few ms after a resume); after a pause it is paused (the web
  loads a paused place it does not hold). It plays through the `Playback`
  service; `playback.live.ts` is One's `Audio` session (AVPlayer on iOS, an
  `<audio>` element on the web). One's `Audio` sends no status events, so
  the player reads the status every 250 ms while the device says it loads
  or plays, whatever the page shows.
- A recording that cannot play says so on the page: "The recording needs a
  connection." when the device is offline, else "The recording could not be
  played.", with Retry beside it.
- The app announces the hymn to the lock screen and Control Center, and
  follows their play, pause and seek. `vite.config.ts` turns on
  `native.app.audio.background`, so the prebuild writes the `audio`
  background mode (iOS) and the media playback service (Android).
- The bar above the tabs is the native tab bar's bottom accessory on iOS 26
  and later; `src/web/WebTabBar.tsx` draws it on the web. Android and iOS
  before 26 show no bar; the lock screen still controls the recording.
- The seek bar is `One.iOS.Slider` on iOS (it seeks once the thumb rests for
  300 ms, as the slider reports no release), `One.Android.Slider` on Android
  and a range input on the web. On the web a press belongs to the pointer
  that opened it with the main button: it opens at that pointer's
  `pointerdown` and ends at the first of its `pointerup` (the drag seeks
  when it ends on another second than it began on), `pointercancel` or
  `lostpointercapture` (the drag is dropped); another pointer, another
  button and a key end nothing. The browser's `change` ends nothing, as
  Chrome sends none for a drag that comes back to where it began. A key's
  step seeks at once, inside a press or not, and a value change with no key
  and no press open (a screen reader's) seeks at once. After a seek, each
  bar holds the place sent until the player reaches it, or for 2 s.
- `src/player/bar.property.test.tsx` holds the web bar to these rules over
  seeded runs of presses, keys, other pointers and buttons, a screen
  reader's steps and playback's ticks, in Chrome's event order.
- The tests run the player over a device the test holds
  (`src/test/device.ts`): each state and move in `src/player/player.test.ts`,
  and the page's control and the bar, pressed in a document, in
  `src/player/ui.test.tsx`.

## Recordings: R2 at hymns.cvr.im

The 1985 SDA Hymnal's recordings are in the Cloudflare R2 bucket `cvr-hymns`,
served publicly at `https://hymns.cvr.im`. The app builds each URL from
`src/remote.ts` (`audioUrl(n)` is `https://hymns.cvr.im/audio/sdah/<n>.mp3`).
That module imports nothing, so the app, Vite and the infra all read it.

Key layout:

- `audio/sdah/<n>.mp3`: hymn `n` of the 1985 hymnal, with the number unpadded.
- `data/`: reserved for the compiled hymn data.

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
