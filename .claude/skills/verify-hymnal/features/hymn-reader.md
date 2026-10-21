# Hymn reader

A hymn shows its number and title, the player's controls, and its words in
the order they are sung: each stanza under its number, and the refrain
written out each time it is sung. The words scroll; the header keeps the
title and a back button to where the reader came from.

## Sub-features

- `reader-words`: stanzas in order, each a group named `Stanza <n>`, the refrain a group named `Refrain` after each stanza.
- `reader-scroll`: the words scroll to the last stanza and back.
- `reader-back`: the header's back button returns to the list or the search it came from.

## How to get to it (user POV)

- A row of the Hymns list.
- A result of Search (its back button then reads `Search`).
- The link `hymnal://hymns/<n>` (iOS) or the route `/hymns/<n>` (web); from search, `/search/<n>`.

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default. Focus-visible, open, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/reader/reader.test.tsx`.

1. **Open by deep link.** `sim open hymns/100 --expect "label=Stanza 1"`. → `ok`; on iOS `detail.prompts` is 0 or 1; the snapshot holds `100`, `Great Is Thy Faithfulness`, `Stanza 1`, `Refrain`.
2. **Scroll to the end.** `sim scroll "label=Stanza 3" down`. → `ok`; `Stanza 3` is on screen (`sim shot`).
3. **Scroll back.** `sim scroll screen up` twice. → `ok`; `Stanza 1` is on screen again.
4. **Back.** `sim back`. → `ok`; the Hymns list.
5. **Proof.** `sim snapshot` and `sim shot` after each step.

## Gotchas

- Hymn 100 has three stanzas, so `label=Stanza 4` is a `TargetMissing`, not a defect.
- A deep link opened while an earlier iOS prompt is unanswered stacks prompts; `sim open` answers up to three. A snapshot that shows only the alert means a prompt is still up.
- On iOS a stanza's group is read as text named `Stanza <n>`; on the web it is a `group` with that `aria-label`. `label=` matches both.
