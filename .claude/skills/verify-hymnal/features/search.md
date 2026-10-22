# Search

The Search tab finds a hymn by number, title or first line, typed in its
field (`Number, title or first line`; on iOS the native header's search
field). The results are hymn rows as in the list; a press opens the hymn
inside the Search tab. A query with no match says
`No hymn matches “<query>”.` The query and the list's place are kept when
the reader leaves and comes back.

## Sub-features

- `search-number`: a number finds that hymn.
- `search-text`: words of a title or a first line find the hymns that hold them.
- `search-open`: a result opens the hymn, with a back button `Search`.
- `search-empty`: a query with no match shows the empty message.

## How to get to it (user POV)

- The `Search` tab.
- The link `hymnal://search` (iOS) or the route `/search` (web); a result at `/search/<n>`.

## Driving it with sim

- **Preconditions:** the Search tab at its field, not at a hymn opened from it (Gotchas).
- **States:** default, empty, focus-visible (the field). Open, loading and error are n/a.
- **Regression:** `apps/hymnal/src/hymns/search.test.ts`, `apps/hymnal/test/browser/list.slow.test.ts`.

1. **Open.** `sim open search --expect "role=search label=Number, title or first line"` on iOS; on the web `--expect "label=Number, title or first line"`. → `ok`.
2. **Text match.** `sim fill "role=search label=Number, title or first line" "great is thy"` (web: without `role=search`). → `ok`; the snapshot holds one result, `100, Great Is Thy Faithfulness`.
3. **Open a result.** `sim tap "role=link label=100, Great Is Thy Faithfulness"`. → `ok`; the reader shows `Stanza 1`.
4. **Empty.** Back to the field (`sim open search …`), `sim fill … "zzzz"`. → the snapshot holds `No hymn matches “zzzz”.`
5. **Proof.** `sim snapshot` and `sim shot` after steps 2 and 4.

## Gotchas

- The Search tab keeps the hymn last opened from it: a tap on the tab can land on that hymn, not the field, and its back button is also named `Search`. Go back with `sim back`, or open `search` by link to reach the field.
- On iOS the field and the screen share the name; narrow it with `role=search`. On the web the field is a plain text input named by `aria-label`.
- Results follow the typing after a deferral: wait for a result (`--expect`, or `sim tap` of the row with its timeout), never a fixed sleep.
