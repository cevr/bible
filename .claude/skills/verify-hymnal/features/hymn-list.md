# Hymn list

The Hymns tab lists all 695 hymns, one row each: the number and the title.
A press on a row opens the hymn. On a phone, the reader's Recent hymns come
first under their own row, and each of the reader's favourites has a small
star before its title in every row it has. The list keeps its scroll offset
when the reader opens a hymn and comes back, or switches tabs and returns.

## Sub-features

- `list-rows`: every row is one line, number and title, named `<n>, <title>` (`<n>, <title>, favourite` for a favourite on a phone).
- `list-open`: a press on a row opens that hymn.
- `list-place`: back from a hymn, or back to the tab, the list is where it was.
- `list-favourites`: on a phone, a hymn starred on its page (the head's `Favourite` button) shows a small star before its title in each of its rows, under `Recent` and under its topic, and VoiceOver reads the row as `<n>, <title>, favourite`. The list has no `Favourites` row. Kept across launches (`lists.favourites`).
- `list-recent`: on a phone, the hymns opened last show first under a `Recent` row, most recent first, at most 5; kept across launches (`lists.recent`). A row pressed under `Recent` opens its hymn, and a swipe there pages through Recent only.

## How to get to it (user POV)

- The app's first screen.
- The `Hymns` tab.
- The back button `Hymns` on a hymn opened from the list.
- The link `hymnal://` (iOS) or the route `/` (web).

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default. Focus-visible, open, loading, empty and error are n/a (the hymns are compiled in).
- **Regression:** `apps/hymnal/test/browser/list.slow.test.ts`, `apps/hymnal/src/reader/back.test.tsx`; the lists: `apps/hymnal/src/reader/pager.slow.test.ts` (the reader's lists), `apps/hymnal/src/reader/rows.test.ts`, `apps/hymnal/src/settings.test.ts`.
- **Steps 6 to 11 change the app's data:** the lists stay on the simulator until the app is reinstalled or erased.

1. **First screen.** `sim open / --expect "role=link label=1, Praise to the Lord"`. → `ok`; the snapshot lists rows `1, Praise to the Lord`, `2, All Creatures of Our God and King`.
2. **Scroll.** `sim scroll "role=link label=31, Tell Out My Soul" down` (any row below the fold). → `ok`; the row is on screen.
3. **Open a row.** `sim tap "role=link label=31, Tell Out My Soul"`. → `ok`; the reader shows `Stanza 1` (`sim snapshot`).
4. **Back keeps the place.** `sim back`. → `ok`; the snapshot still shows the row of step 2, not `1, Praise to the Lord` at the top.
5. **Proof.** `sim snapshot` and `sim shot` after steps 2 and 4: the same rows on screen.
6. **Favourite.** Open hymn 3, `sim tap "role=button label=Favourite"`. → the snapshot shows `Favourite` `[selected]`. `sim back`. → the list starts `Recent`, then `3, …, favourite`; no row is named `Favourites`. Scroll to hymn 3 under its topic: its row is named `3, …, favourite` too, and `sim shot` shows a small star before its title; a row next to it has no star.
7. **Recent.** Open hymn 1, `sim back`. → `Recent` lists `1, …` then `3, …, favourite`.
8. **Recent keeps five.** Open hymns 2, 4, 5 and 6 from the list, each followed by `sim back`. → `Recent` lists five rows, `6, …`, `5, …`, `4, …`, `2, …`, `1, …`; hymn 3, the first opened, is gone from it, and its row under its topic keeps its star.
9. **Kept.** `xcrun simctl terminate booted im.cvr.hymnal`, then `xcrun simctl launch booted im.cvr.hymnal`. → `Recent` as in step 8, and hymn 3's row still named `3, …, favourite`.
10. **A list's pager.** Press the `5, …` row under `Recent` by its ref (`agent-device press @eN --session verify-hymnal`: the label also names the row under its topic), then swipe left (`agent-device gesture pan 350 450 -300 0 250 --session verify-hymnal`). → the page is hymn 4, the next in Recent, not 6.
11. **Place with a new Recent row.** Scroll deep, read a row's `y` (`agent-device snapshot --json`), open a hymn not yet in Recent, `sim back`. → the row's `y` is unchanged. From the top, the new hymn shows first under `Recent`.

## Gotchas

- A favourite's row name ends `, favourite`: a `--expect` on `label=<n>, <title>` alone misses it once the hymn is starred. Take the star off (step 6 again) at the end of the drive.
- On iOS a row's link and its group share one name: a target without `role=link` fails with `AMBIGUOUS_MATCH`.
- On a hymn opened from the list, `Hymns` names both the back button and the tab (`role=button label=Hymns` is `AMBIGUOUS_MATCH` on iOS): go back with `sim back`, and use the tab only from another tab.
- On the web a screen is mounted anew when the reader returns, so a place kept on the web is the app's own restore, not a cached view: check it after the list has drawn (`--expect`), never after a fixed sleep.
