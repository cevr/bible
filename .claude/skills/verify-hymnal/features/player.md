# Player

One bottom bar holds the player. While the player holds no hymn, a hymn
page draws the bar as its own, offering `Play hymn <n>` for that hymn: it
comes in with the page's push and goes out with its back, frame for frame,
and a cancelled edge pan leaves it in place. Once a hymn is held, the bar is
docked in the hymnal's layout under the stack and holds that hymn on every
page, with its `Play`/`Pause`
button and a thin seek line that shows the part played and takes no touch.
A tap on the bar (`Open player`) opens the full player, a sheet at
`/player`: the hymn's number and title, what the player is doing, its
button, and a `Position` bar to drag, shown in every state (still while the
length is not known).

## Sub-features

- `player-play`: `Play hymn <n>` starts the recording; the button becomes `Pause hymn <n>`.
- `player-pause`: `Pause hymn <n>` pauses; the button becomes `Play hymn <n>` again.
- `player-bar`: the bar (region `Player`) shows on a hymn page and on every screen while the player holds a hymn; its `Open player` button tells the place (`0:30 of 2:00`).
- `player-bar-page`: while the player holds no hymn, the bar is the hymn page's own: on a back (the header's button or a pan from the left edge) it slides out with the page, never left on the screen after the page has gone; on a push it slides in with it.
- `player-full`: `Open player` opens the sheet `/player`, with the group `Recording` and the `Position` bar in every state.
- `player-line`: the iOS `Position` bar draws one track, with no line of ticks under it (a column of the sheet's still crosses one line).
- `player-fail`: a recording that cannot load offers `Retry hymn <n>`.

## How to get to it (user POV)

- The hymn reader, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): the bar at its foot.
- The bar on any screen while a hymn sounds; the full player by a tap on it.

## Driving it with sim

- **Preconditions:** the hymn reader open (`sim open hymns/100 --expect "label=Play hymn 100"`). Web only for steps that play (Gotchas).
- **States:** default, loading. Error (`Retry`) needs the recording's host down and is n/a on a normal run.
- **Regression:** `apps/hymnal/src/player/player.test.ts`, `apps/hymnal/src/player/bar.test.ts`, `apps/hymnal/src/reader/pager.slow.test.ts` (the bottom bar), `apps/hymnal/src/player/ui.slow.test.tsx`, `apps/hymnal/src/player/bar.property.slow.test.tsx`, `apps/hymnal/src/player/world.property.slow.test.ts`.

1. **The bar.** `sim snapshot reader`. → the tree holds `Play hymn 100` and `Open player` in the region `Player`, and no group `Recording` in the page.
2. **The full player.** `sim tap "label=Open player"`. → the sheet holds the group `Recording` and `Position` (disabled while Idle). On iOS, take a still, crop it to the `Position` band (no hymn words), and read one column across it: one line run, the track. Then close the sheet; on iOS stop here.
3. **Play (web).** `sim tap "label=Play hymn 100"`. → `ok`; `sim snapshot playing` holds `Pause hymn 100` once loading ends (or `Loading hymn 100` before it).
4. **The bar elsewhere (web).** `sim tap label=Search`, then `sim snapshot bar`. → the region `Player` still holds `Pause hymn 100`, and `Open player` tells the place.
5. **Pause (web).** `sim tap "label=Pause hymn 100"`. → `ok`; the button reads `Play hymn 100` again.
6. **Proof.** `sim shot` after steps 2 to 5, and `sim log` for the page's console.

## Gotchas

- The simulator plays through the Mac's speakers. Never press Play on iOS during a drive; the web browser is muted by `sim boot`, so play there.
- The recording streams from the app's host: offline, Play ends in `Retry hymn <n>`. That is the error state, not a defect of the drive.
- Loading shows a spinner named `Loading hymn <n>`, not a button: wait for `Pause hymn <n>`, never a fixed sleep.
