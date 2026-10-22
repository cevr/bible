# Hymn reader

A hymn shows its topic as a quiet line, its number and title in one row
under it (the number first), and its words in the order they are sung: each stanza under its number, and the refrain
written out each time it is sung. The words scroll; the header keeps the
title and a back button to where the reader came from. The header's `Aa`
button opens the reading sheet: text size, font, line spacing and keep
screen on, each kept across launches. A printed line that wraps hangs: its
later rows sit one indent right of its first.

## Sub-features

- `reader-head`: the topic above, then the number and the title side by side, the number left of the title.
- `reader-words`: stanzas in order, each a group named `Stanza <n>`, the refrain a group named `Refrain` after each stanza.
- `reader-scroll`: the words scroll to the last stanza and back.
- `reader-back`: the header's back button returns to the list or the search it came from.
- `reader-text`: `Aa` opens the reading sheet; `Larger text` and `Smaller text` step the size (each disabled at its end), `Font` and `Line spacing` are radio groups, and the page behind follows at once, chords included.
- `reader-indent`: a wrapped line's later rows start at least one indent (1.25 times the words' size) right of its first.
- `reader-awake`: with `Keep screen on` on, the screen stays on while a hymn page is shown.

## How to get to it (user POV)

- A row of the Hymns list.
- A result of Search (its back button then reads `Search`).
- The link `hymnal://hymns/<n>` (iOS) or the route `/hymns/<n>` (web); from search, `/search/<n>`.

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default. Focus-visible, open, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/reader/reader.slow.test.tsx`; the reading sheet, the page's text, the hanging indent and keep-awake in `apps/hymnal/src/reader/reading.slow.test.tsx`.

1. **Open by deep link.** `sim open hymns/100 --expect "label=Stanza 1"`. → `ok`; on iOS `detail.prompts` is 0 or 1; the snapshot holds `100`, `Great Is Thy Faithfulness`, `Stanza 1`, `Refrain`.
2. **The head.** `sim open hymns/15 --expect "label=Stanza 1"`, then on iOS read the frames with `agent-device snapshot --json` (the `rect` of the topic, the number and the title). → the frames give `number.x + number.width <= title.x`, the number's and the title's vertical centres within half a line, and the topic's frame above both. Read the frames only; the snapshot holds the words, so trash it after.
3. **Scroll to the end.** `sim open hymns/100 --expect "label=Stanza 1"`, then `sim scroll "label=Stanza 3" down`. → `ok`; `Stanza 3` is on screen (`sim shot`).
4. **Scroll back.** `sim scroll screen up` twice. → `ok`; `Stanza 1` is on screen again.
5. **Back.** `sim back`. → `ok`; the Hymns list.
6. **Proof.** `sim snapshot` and `sim shot` after each step.
7. **The reading sheet.** `sim open hymns/100 --expect "label=Stanza 1"`, then `sim tap label=Aa`. → `ok`; the sheet shows `Reading`, `Text size 100%`, `Font` (`System` checked), `Line spacing` (`Normal` checked) and `Keep screen on` off.
8. **Largest text.** `sim tap "label=Larger text"` until it is disabled. → the reading shows `Text size 188%`; dismiss the sheet; the page's words and chords are larger.
9. **Hanging indent.** At the largest size, `agent-device snapshot --json` on a hymn with a long line: the `rect` of the line's first word and of the first word of its next row. → the second row's x is at least one indent (40 pt at the largest size, before the system's text size) right of the first's. Read the frames only, then trash the snapshot.
10. **Kept.** `sim tap Serif`, `sim tap Roomy`, then relaunch and open `Aa` again. → the same size, `Serif` and `Roomy` checked. Put each back (`Text size 100%`, `System`, `Normal`, `Keep screen on` off).

## Gotchas

- Hymn 100 has three stanzas, so `label=Stanza 4` is a `TargetMissing`, not a defect.
- A deep link opened while an earlier iOS prompt is unanswered stacks prompts; `sim open` answers up to three. A snapshot that shows only the alert means a prompt is still up.
- The sheet opens at 0.6 of the screen; drag its grabber up for the rest at the largest system text size.
- On iOS a chord line is not one element: its chords keep their `chord-<p>-<l>-<n>` ids. A line without chords reads as one element named by the whole line.
- On iOS a stanza's group is read as text named `Stanza <n>`; on the web it is a `group` with that `aria-label`. `label=` matches both.
