# Player

One bottom bar holds the player. While the player holds no hymn, a hymn
page draws the bar as its own, offering `Play hymn <n>` for that hymn: it
comes in with the page's push and goes out with its back, frame for frame,
and a cancelled edge pan leaves it in place. Once a hymn is held, the bar is
docked in the hymnal's layout under the stack and holds that hymn on every
page, with its `Sound` and `Play`/`Pause` marks (one size, no text: a
speaker with waves or a slash, play, pause, again or retry) and a thin seek line that shows the part played and takes no touch.
A tap on the bar (`Open player`) opens the full player on the bar's hymn, a
sheet at `/player?hymn=<n>` (the route names the hymn, as the web keeps no
page under the sheet): the hymn's number and title, what the player is doing, its
button, and a `Position` bar to drag, shown in every state (still while the
length is not known).

## Sub-features

- `player-play`: `Play hymn <n>` starts the recording; the button becomes `Pause hymn <n>`.
- `player-pause`: `Pause hymn <n>` pauses; the button becomes `Play hymn <n>` again.
- `player-bar`: the bar (region `Player`) shows on a hymn page and on every screen while the player holds a hymn; its `Open player` button tells the place (`0:30 of 2:00`). Its `Sound` and Play/Pause buttons are marks of one size (about 22 pt in 44 by 44 targets), with no text: the bar reads only the number and title (and `Play <n>` while another hymn sounds over a page). The full player keeps its text buttons.
- `player-bar-page`: while the player holds no hymn, the bar is the hymn page's own: on a back (the header's button or a pan from the left edge) it slides out with the page, never left on the screen after the page has gone; on a push it slides in with it.
- `player-full`: `Open player` opens the sheet `/player?hymn=<n>` on the bar's hymn, with the group `Recording`, that hymn's heading and the `Position` bar in every state, on the web too (where the page under it unmounts). A paused held hymn gives way to the page's, as on the bar.
- `player-title`: the sheet's hymn number and title is a button named `<n>, <title>` (hint: opens the hymn's page). A press closes the sheet and pushes that hymn's page where the sheet was, with its back button and back pan; over that hymn's own page the sheet only closes. The player is not told: a track plays or stays paused as it was.
- `player-seek-hold`: on iOS, while a finger drags the sheet's `Position` bar, in any direction, the sheet does not move; once the finger lifts, a drag elsewhere on the sheet moves it again.
- `player-line`: the iOS `Position` bar draws one track, with no line of ticks under it (a column of the sheet's still crosses one line).
- `player-fail`: a recording that cannot load offers `Retry hymn <n>`.
- `player-sound`: the button `Sound`, left of Play in the bar, shows a speaker with waves in the accent while on (the default) and a muted speaker with a slash while off, no text; a press turns it. On the web its `aria-checked` says its state. On iOS its accessibility element is labelled `Sound` and says its state in its value, `checked` (on) or `unchecked` (off). Off, Play sounds nothing and the bar's place runs on the score's clock (follow, [follow.md](follow.md)). The choice is kept after a relaunch.

## How to get to it (user POV)

- The hymn reader, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): the bar at its foot.
- The bar on any screen while a hymn sounds; the full player by a tap on it.

## Driving it with sim

- **Preconditions:** the hymn reader open (`sim open hymns/100 --expect "label=Play hymn 100"`). Web only for steps that play (Gotchas).
- **States:** default, loading. Error (`Retry`) needs the recording's host down and is n/a on a normal run.
- **Regression:** `apps/hymnal/src/player/player.test.ts`, `apps/hymnal/src/player/bar.test.ts`, `apps/hymnal/src/player/button.test.ts` (each state's buttons, labels and commands), `apps/hymnal/src/reader/pager.slow.test.ts` (the bottom bar), `apps/hymnal/src/player/ui.slow.test.tsx`, `apps/hymnal/src/player/bar.property.slow.test.tsx`, `apps/hymnal/src/player/world.property.slow.test.ts`.

1. **The bar.** `sim snapshot reader`. → the tree holds `Play hymn 100` and `Open player` in the region `Player`, and no group `Recording` in the page.
2. **The full player.** `sim tap "label=Open player"`. → the sheet holds the group `Recording` and `Position` (disabled while Idle). On iOS, take a still, crop it to the `Position` band (no hymn words), and read one column across it: one line run, the track. Then close the sheet; on iOS stop here.
3. **Play (web).** `sim tap "label=Play hymn 100"`. → `ok`; `sim snapshot playing` holds `Pause hymn 100` once loading ends (or `Loading hymn 100` before it).
4. **The bar elsewhere (web).** `sim tap label=Search`, then `sim snapshot bar`. → the region `Player` still holds `Pause hymn 100`, and `Open player` tells the place.
5. **Pause (web).** `sim tap "label=Pause hymn 100"`. → `ok`; the button reads `Play hymn 100` again.
6. **Title (web, then iOS with the player idle).** `sim tap "label=Open player"`, then `sim tap "role=button label=100, <title>"`. → the sheet closes on hymn 100's page, and the bar still reads `Pause hymn 100` (web). From the home list, with the bar's hymn held, open the sheet and press the title. → hymn 100's page, the bar unchanged, and its header's `Hymns` button (or a pan from the left edge) gives the home list.
7. **Seek holds the sheet (iOS).** Open the sheet, read the heading's `y` (`agent-device snapshot --json`), then pan from the `Position` bar's middle down and across (`agent-device gesture pan <x> <y> 120 250 700`). → the heading's `y` is unchanged, and the sheet is still open. Pan from the heading down (`agent-device gesture pan <x> <y> 0 250 700`). → the sheet moves: it closes or drops to its lower detent.
8. **Proof.** `sim shot` after steps 2 to 5, and `sim log` for the page's console.
9. **The marks (`player-bar`, `player-sound`).** On hymn 100 with the player idle: `sim shot` with Sound on, `sim tap label=Sound` and `sim shot` with it off, then (web, or iOS with Sound off) Play and Pause and `sim shot` at Play. Crop the bar 1:1. → two marks of one size and no text beyond the number and title; a speaker with waves (on) or a slash (off). The raw snapshot still lists `Sound` with its value and `Play hymn 100`. Put Sound back on.

## Gotchas

- The simulator plays through the Mac's speakers. Never press Play on iOS with sound on; the web browser is muted by `sim boot`, so play there with sound on.
- On iOS, press Play only once the `Sound` button reads off. The presented `sim snapshot` shows only `[button] "Sound"`; read its value with `agent-device snapshot --json --raw --observe-only --force-full --session verify-hymnal` (`checked` is on, `unchecked` is off). `sim tap label=Sound` turns it, and the choice is kept, so a relaunch (or another drive's) may have left it on. Put it back to `Sound on` at the end of a drive, after a relaunch, when the player holds no hymn.
- Step 7 needs a known length, which only a play gives. On iOS, point `audioUrl` (`src/remote.ts`) at a silent local file for the drive alone (`ffmpeg -f lavfi -i anullsrc=r=44100:cl=mono -t 120 silent.mp3`, as `file:///<path>`: One's iOS audio takes `file://` or `https://` only), press Play in the sheet, then Pause. Revert the edit before any commit.
- The recording streams from the app's host: offline, Play ends in `Retry hymn <n>`. That is the error state, not a defect of the drive.
- Loading shows a spinner named `Loading hymn <n>`, not a button: wait for `Pause hymn <n>`, never a fixed sleep.
