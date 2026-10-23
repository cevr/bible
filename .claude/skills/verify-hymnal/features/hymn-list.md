# Hymn list

The Hymns tab lists all 695 hymns, one row each: the number and the title.
A press on a row opens the hymn. On a phone, the reader's latest five hymns
come first under a `Recent` header that opens all of Recent, and each of the reader's favourites has a small
star before its title in every row it has. The list keeps its scroll offset
when the reader opens a hymn and comes back, or switches tabs and returns.

## Sub-features

- `list-rows`: every row is one line, number and title, named `<n>, <title>` (`<n>, <title>, favourite` for a favourite on a phone).
- `list-open`: a press on a row opens that hymn.
- `list-place`: back from a hymn, or back to the tab, the list is where it was.
- `list-favourites`: on a phone, a hymn starred on its page (the head's `Favourite` button) shows a small star before its title in each of its rows, under `Recent` and under its topic, and VoiceOver reads the row as `<n>, <title>, favourite`. The list has no `Favourites` row. Kept across launches (`lists.favourites`).
- `list-recent`: on a phone, the hymns opened last show first under a `Recent` header, most recent first, at most 5 there; Recent keeps the latest 50, across launches (`lists.recent`). A row pressed under `Recent` opens its hymn, and a swipe there pages through those five only.
- `list-recent-all`: the `Recent` header is a button, named `Recent, see all` and showing `See all ›`; it pushes the Recent screen (`/recent`, title `Recent`), every hymn Recent keeps, most recent first, a favourite starred. A row there opens its hymn, a swipe pages through that whole list, and a pan from the left edge goes back to it; its back button `Hymns` goes home. With nothing opened it says `The hymns you open show here.`

## How to get to it (user POV)

- The app's first screen.
- The `Hymns` tab.
- The back button `Hymns` on a hymn opened from the list.
- The link `hymnal://` (iOS) or the route `/` (web).
- The Recent screen: the `Recent` header's `See all ›` on a phone's home list, or the route `/recent`.

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default. Focus-visible, open, loading, empty and error are n/a (the hymns are compiled in).
- **Regression:** `apps/hymnal/test/browser/list.slow.test.ts`, `apps/hymnal/src/reader/back.test.tsx`; the lists: `apps/hymnal/src/reader/pager.slow.test.ts` (the reader's lists, the Recent header and screen), `apps/hymnal/src/reader/lists.test.ts`, `apps/hymnal/src/reader/rows.test.ts`, `apps/hymnal/src/settings.test.ts`.
- **Steps 6 to 14 change the app's data:** the lists stay on the simulator until the app is reinstalled or erased.

1. **First screen.** `sim open / --expect "role=link label=1, Praise to the Lord"`. → `ok`; the snapshot lists rows `1, Praise to the Lord`, `2, All Creatures of Our God and King`.
2. **Scroll.** `sim scroll "role=link label=31, Tell Out My Soul" down` (any row below the fold). → `ok`; the row is on screen.
3. **Open a row.** `sim tap "role=link label=31, Tell Out My Soul"`. → `ok`; the reader shows `Stanza 1` (`sim snapshot`).
4. **Back keeps the place.** `sim back`. → `ok`; the snapshot still shows the row of step 2, not `1, Praise to the Lord` at the top.
5. **Proof.** `sim snapshot` and `sim shot` after steps 2 and 4: the same rows on screen.
6. **Favourite.** Open hymn 3, `sim tap "role=button label=Favourite"`. → the snapshot shows `Favourite` `[selected]`. `sim back`. → the list starts `Recent`, then `3, …, favourite`; no row is named `Favourites`. Scroll to hymn 3 under its topic: its row is named `3, …, favourite` too, and `sim shot` shows a small star before its title; a row next to it has no star.
7. **Recent.** Open hymn 1, `sim back`. → `Recent` lists `1, …` then `3, …, favourite`.
8. **Home shows five.** Open hymns 2, 4, 5 and 6 from the list, each followed by `sim back`. → `Recent` lists five rows, `6, …`, `5, …`, `4, …`, `2, …`, `1, …`; hymn 3, the first opened, is not among them, and its row under its topic keeps its star.
9. **Kept.** `xcrun simctl terminate booted im.cvr.hymnal`, then `xcrun simctl launch booted im.cvr.hymnal`. → `Recent` as in step 8, and hymn 3's row still named `3, …, favourite`.
10. **A list's pager.** Press the `5, …` row under `Recent` by its ref (`agent-device press @eN --session verify-hymnal`: the label also names the row under its topic), then swipe left (`agent-device gesture pan 350 450 -300 0 250 --session verify-hymnal`). → the page is hymn 4, the next in Recent, not 6.
11. **Place with a new Recent row.** Scroll deep, read a row's `y` (`agent-device snapshot --json`), open a hymn not yet in Recent, `sim back`. → the row's `y` is unchanged. From the top, the new hymn shows first under `Recent`.
12. **See all.** From the top, `sim tap "role=button label=Recent, see all"`. → the header reads `Recent`; the rows are every hymn opened in steps 6 to 11, most recent first (after step 8 alone: `6`, `5`, `4`, `2`, `1`, `3, …, favourite`), hymn 3 starred.
13. **The Recent screen's pager.** Press its `4, …` row (`role=link label=4, …`), swipe left (`agent-device gesture pan 350 450 -300 0 250 --session verify-hymnal`). → the page is hymn 2, the next in the full list. Swipe again twice: hymn 1, then hymn 3, which the home shelf no longer shows.
14. **Back to Recent, then home.** Pan from the left edge (`agent-device gesture pan 1 450 300 0 250 --session verify-hymnal`). → the Recent screen, its order now led by the hymn last shown. `sim back`. → the home list, its `Recent` five rows.

## Gotchas

- A favourite's row name ends `, favourite`: a `--expect` on `label=<n>, <title>` alone misses it once the hymn is starred. Take the star off (step 6 again) at the end of the drive.
- On iOS a row's link and its group share one name: a target without `role=link` fails with `AMBIGUOUS_MATCH`.
- On a hymn opened from the list, `Hymns` names both the back button and the tab (`role=button label=Hymns` is `AMBIGUOUS_MATCH` on iOS): go back with `sim back`, and use the tab only from another tab.
- On the web a screen is mounted anew when the reader returns, so a place kept on the web is the app's own restore, not a cached view: check it after the list has drawn (`--expect`), never after a fixed sleep.
- The `Recent` header scrolls away with its rows: it is not pinned as a topic's row is, so tap it from the list's top.
