# Hymn list

The Hymns tab lists all 695 hymns, one row each: the number and the title.
A press on a row opens the hymn. The list keeps its scroll offset when the
reader opens a hymn and comes back, or switches tabs and returns.

## Sub-features

- `list-rows`: every row is one line, number and title, named `<n>, <title>`.
- `list-open`: a press on a row opens that hymn.
- `list-place`: back from a hymn, or back to the tab, the list is where it was.

## How to get to it (user POV)

- The app's first screen.
- The `Hymns` tab.
- The back button `Hymns` on a hymn opened from the list.
- The link `hymnal://` (iOS) or the route `/` (web).

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default. Focus-visible, open, loading, empty and error are n/a (the hymns are compiled in).
- **Regression:** `apps/hymnal/test/browser/list.slow.test.ts`, `apps/hymnal/src/reader/back.test.tsx`.

1. **First screen.** `sim open / --expect "role=link label=1, Praise to the Lord"`. → `ok`; the snapshot lists rows `1, Praise to the Lord`, `2, All Creatures of Our God and King`.
2. **Scroll.** `sim scroll "role=link label=31, Tell Out My Soul" down` (any row below the fold). → `ok`; the row is on screen.
3. **Open a row.** `sim tap "role=link label=31, Tell Out My Soul"`. → `ok`; the reader shows `Stanza 1` (`sim snapshot`).
4. **Back keeps the place.** `sim back`. → `ok`; the snapshot still shows the row of step 2, not `1, Praise to the Lord` at the top.
5. **Proof.** `sim snapshot` and `sim shot` after steps 2 and 4: the same rows on screen.

## Gotchas

- On iOS a row's link and its group share one name: a target without `role=link` fails with `AMBIGUOUS_MATCH`.
- On a hymn opened from the list, `Hymns` names both the back button and the tab (`role=button label=Hymns` is `AMBIGUOUS_MATCH` on iOS): go back with `sim back`, and use the tab only from another tab.
- On the web a screen is mounted anew when the reader returns, so a place kept on the web is the app's own restore, not a cached view: check it after the list has drawn (`--expect`), never after a fixed sleep.
