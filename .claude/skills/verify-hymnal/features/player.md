# Player

A hymn with a recording shows a `Play` button and a `Recording` control
under its title. Play starts the recording: the button turns to `Pause`
(with a short loading state first), the control shows the place and a
`Position` scrubber, and a Now Playing bar names the hymn on other screens.

## Sub-features

- `player-play`: `Play hymn <n>` starts the recording; the button becomes `Pause hymn <n>`.
- `player-pause`: `Pause hymn <n>` pauses; the button becomes `Play hymn <n>` again.
- `player-bar`: the bar `Now playing <n>, <title>` shows on other screens while it plays.
- `player-fail`: a recording that cannot load offers `Retry hymn <n>`.

## How to get to it (user POV)

- The hymn reader, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web).
- The Now Playing bar, on any screen while a hymn plays.

## Driving it with sim

- **Preconditions:** the hymn reader open (`sim open hymns/100 --expect "label=Play hymn 100"`). Web only for steps that play (Gotchas).
- **States:** default, loading. Error (`Retry`) needs the recording's host down and is n/a on a normal run.
- **Regression:** `apps/hymnal/src/player/player.test.ts`, `apps/hymnal/src/player/ui.slow.test.tsx`, `apps/hymnal/src/player/bar.property.slow.test.tsx`, `apps/hymnal/src/player/world.property.slow.test.ts`.

1. **The control.** `sim snapshot reader`. → the tree holds `Play hymn 100` and the group `Recording`. On iOS stop here.
2. **Play (web).** `sim tap "label=Play hymn 100"`. → `ok`; `sim snapshot playing` holds `Pause hymn 100` once loading ends (or `Loading hymn 100` before it).
3. **The bar (web).** `sim tap label=Search`, then `sim snapshot bar`. → the tree holds `Now playing 100, Great Is Thy Faithfulness`.
4. **Pause (web).** `sim open hymns/100 --expect "label=Pause hymn 100"`, then `sim tap "label=Pause hymn 100"`. → `ok`; the button reads `Play hymn 100` again.
5. **Proof.** `sim shot` after steps 2 to 4, and `sim log` for the page's console.

## Gotchas

- The simulator plays through the Mac's speakers. Never press Play on iOS during a drive; the web browser is muted by `sim boot`, so play there.
- The recording streams from the app's host: offline, Play ends in `Retry hymn <n>`. That is the error state, not a defect of the drive.
- Loading shows a spinner named `Loading hymn <n>`, not a button: wait for `Pause hymn <n>`, never a fixed sleep.
