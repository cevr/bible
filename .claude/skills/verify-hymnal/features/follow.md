# Follow

While a hymn plays, its page follows the singing. The line sung now is
marked: its words turn muted and the word sung now takes the accent colour,
with no box and no underline. The page scrolls each line in about 600 ms
before it is sung, a third of the way down, so a reader never scrolls by
hand. With sound on, the marks keep time with the recording; with sound off
(`Sound off` beside Play), nothing sounds and they keep the score's time
from the first sung line. A drag of the page pauses the scroll (the marks
go on) and shows `Resume follow`; a tap on it, or a seek in the player,
brings the sung line back and follows again. The marked line is
`selected` on iOS and `aria-current="true"` on the web.

## Sub-features

- `follow-play`: one tap on `Play hymn <n>` follows the hymn to its last line, with no other touch.
- `follow-play-recording`: with sound on (web, muted browser), the marks follow the recording.
- `follow-line`: exactly one line is marked at a time, in order, never back, each line longer than 1 s seen, and the marked line and the next line's top inside the page's scroll.
- `follow-word`: the sung word in the accent colour, the rest of the marked line muted.
- `follow-sound`: with `Sound off`, Play sounds nothing and the marks run on the score's clock. One Play tap is enough: the player shows Playing from the first sung line, which is marked, with no seek. While a recording is still loading, `Sound off`, Pause and Stop answer at once, and a load that never answers is given up after 15 s.
- `follow-hand`: a drag of the page while it plays shows `Resume follow` and stops the scroll; a tap on it brings the marked line back into view.
- `follow-seek`: a seek on the player's `Position` bar, or on the lock screen, of any size, shows the line sung there and follows again.

## How to get to it (user POV)

- A hymn page, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): `Play hymn <n>` in the bar at its foot.
- `Resume follow` over the page after a drag while it plays.
- `Open player`, then the `Position` bar, to seek.

## Driving it with sim

- **Preconditions:** the hymn reader open (`sim open hymns/100 --expect "label=Play hymn 100"`). On iOS, `Sound off` before any Play: the `Sound` button's state is its value, which the presented `sim snapshot` does not show, so read it with `agent-device snapshot --json --raw --observe-only --force-full --session verify-hymnal` (the node labelled `Sound`: value `checked` is on, `unchecked` is off), and `sim tap label=Sound` while it reads `checked` (player.md, Gotchas). On iOS, Play is pressed only with sound off.
- **States:** default (playing, paused by hand, ended), loading (web, before the recording sounds). Empty and error are n/a: every hymn has a timeline.
- **Regression:** `apps/hymnal/src/follow/timeline.test.ts`, `apps/hymnal/src/follow/clock.test.ts`, `apps/hymnal/src/follow/follower.test.ts`, `apps/hymnal/src/player/sound.test.ts`, `apps/hymnal/src/follow/follow.slow.test.tsx`, `apps/hymnal/scripts/follow.test.ts` (the checker's judge).

1. **One tap to the end (iOS, `follow-play`, `follow-line`, `follow-sound`).** With the page of hymn 100 open and `Sound off`, from `apps/hymnal`: `bun run follow --udid <udid> --hymn 100 --out "$EVIDENCE/follow"`. It presses `Play hymn 100` once, touches nothing else, records `follow-100.mp4` and reads the tree about every 0.5 s until the button reads `Play hymn 100 again`. → one JSON line, exit 0: `holds` true, `backwards` 0, `missed` [], `last` true, `outside` 0, `doubled` 0, `mismatched` 0, `adrift` 0 (each marked line is sung within 1.5 s of the sample's time on the score clock, which starts at the first sung line at the tap), `early` false (the player does not end more than 1.5 s before the timeline does), `ended` true, `touches` 1. Then the same on hymns 93 (a refrain after each stanza) and 212, each opened by `sim open` first.
2. **The word (iOS, `follow-word`).** During step 1's run of 100, `sim shot word-1` and, some seconds later, `sim shot word-2`. Crop the marked line 1:1 into the evidence. → one word in the accent colour, the rest of the line muted; no box, no underline.
3. **Sound on (web, `follow-play-recording`).** `sim boot --platform web`, `sim open hymns/100 --expect "label=Play hymn 100"`, `sim tap "label=Play hymn 100"`, wait 45 s, `sim snapshot recording`. The snapshot does not show `aria-current`, so read the page through the drive's browser session, counts and boxes only, no words: `agent-browser --session verify-hymnal eval` of a function that returns the number of `[data-testid="line"]` elements, the `[aria-current="true"]` ones with their index among the lines, and their `getBoundingClientRect()` top and bottom beside `[data-testid="hymn-scroll"]`'s. → exactly one element with `aria-current="true"`, a `line` after the first stanza's first line (index 4 of 24 on 100 at about 50 s), inside `hymn-scroll`'s box. The console has `[follow] line i=<i> ... clock=recording`.
4. **A drag (iOS, `follow-hand`).** On hymn 100, `Sound off`, `sim tap "label=Play hymn 100"`, wait 20 s, `sim scroll id=hymn-scroll up`. → `sim snapshot held` holds `Resume follow`, and `sim log` has `[follow] pause reason=drag`. `sim tap "label=Resume follow"`. → `Resume follow` is gone, the selected line lies inside `hymn-scroll`'s frame (`agent-device snapshot --json`), and the log has `[follow] resume reason=pill`.
5. **A seek (iOS, `follow-seek`).** While it still plays, drag the page again, then `sim tap "label=Open player"` and drag the sheet's `Position` bar (`agent-device gesture pan <x> <y> <dx> 0 700` from the bar's middle). → the log has `[follow] resume reason=seek`; close the sheet, and the selected line lies inside `hymn-scroll`'s frame. Then `sim tap "label=Pause hymn 100"`.
6. **Proof.** `sim record start follow` before step 4 and `sim record stop` after step 5; `sim log` at the end (`app.log`), where each marked line logs `[follow] line i=<i> of=<n> at=<ms> clock=score` (with sound on, `clock=recording`).

## Gotchas

- The simulator plays through the Mac's speakers: on iOS, read the `Sound` button's value as `unchecked` before every Play. The choice is kept across relaunches. The checker refuses to press Play unless it reads `unchecked` itself.
- The pager keeps the pages beside the open hymn in the tree, each with a `hymn-scroll` and `line` nodes of its own, off the screen. The checker takes the scroll whose frame, cut to its ancestors' frames, the screen shows, and only the lines inside it; read a raw snapshot the same way.
- In a dev build a LogBox toast at the foot can cover the player bar. A tap on the bar then opens the LogBox, the press never reaches the app, and the checker samples a hymn that never plays (`seen` 0, `ended` false). The snapshot still lists the bar's buttons under the toast, so take a `sim shot` before a run. `agent-device react-native dismiss-overlay --session verify-hymnal` clears it; run it again until it reports `No React Native overlay detected`. The pager sets `recycleItems`, so LegendList's warning no longer raises one on every launch.
- A tap on the iOS seek line in the bar does not seek; seek by a drag on the sheet's `Position` bar.
- The checker reads the tree without touching the app (`--observe-only`); any other driver acting on the simulator during its run counts as a touch it cannot see. Run nothing else until it prints.
- A load above 12 delays the snapshots: read a run with `missed` lines under such load as no claim and run it again.
- The checker keeps no words: its JSON holds each line's selected state and frame only. Snapshots from `sim snapshot` hold the hymn's words, as the app renders them.
