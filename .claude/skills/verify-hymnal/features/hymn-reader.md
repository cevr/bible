# Hymn reader

A hymn shows its topic as a quiet line, its number and title in one row
under it (the number first), and its words in the order they are sung: each stanza under its number, and the refrain
written out each time it is sung. The words scroll; the header keeps the
title and a back button to where the reader came from. On a phone a swipe
turns to the next or the previous hymn of the list the reader opened it
from, and a pan from the screen's left edge goes back. The header's `Aa`
button opens the reading sheet: text size, font, line spacing and keep
screen on, each kept across launches. A printed line that wraps hangs: its
later rows sit one indent right of its first.

## Sub-features

- `reader-head`: the topic above, then the number and the title side by side, the number left of the title.
- `reader-words`: stanzas in order, each a group named `Stanza <n>`, the refrain a group named `Refrain` after each stanza.
- `reader-syllables`: with chords off, a sung line shows its syllables, a muted hyphen between the syllables of a word and the words a space apart, each word kept on one row; the line reads as one element named by its whole words. A Plain part shows its words alone.
- `reader-scroll`: the words scroll to the last stanza and back, inside a page as tall as the pager on every page, the open one and its neighbours.
- `reader-back`: the header's back button returns to the list or the search it came from, in one press however many pages were swiped, and the list is at its place.
- `reader-pager`: on a phone, a swipe left or right turns to the next or previous hymn of the list the hymn was opened from (the home list in number order, its Recent rows too; a search's results; the Recent screen's whole list; every hymn in number order for a link); the header and the page head name the hymn shown. A pan from the left edge goes back on any hymn, after a list press and after a swipe; a pan from mid-screen turns the page.
- `reader-text`: `Aa` opens the reading sheet; `Larger text` and `Smaller text` step the size (each disabled at its end), `Font` and `Line spacing` are radio groups, and the page behind follows at once, chords included.
- `reader-indent`: a wrapped line's later rows start at least one indent (1.25 times the words' size) right of its first.
- `reader-awake`: with `Keep screen on` on, the screen stays on while a hymn page is shown.

## How to get to it (user POV)

- A row of the Hymns list.
- A result of Search (its back button then reads `Search`).
- A swipe from the hymn before or after it in the same list (phone only).
- The link `hymnal://hymns/<n>` (iOS) or the route `/hymns/<n>` (web); from search, `/search/<n>`.

## Driving it with sim

- **Preconditions:** none beyond the baseline.
- **States:** default. Focus-visible, open, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/reader/reader.slow.test.tsx`; the pager and its left edge in `apps/hymnal/src/reader/pager.slow.test.ts`; the header on every way in, `apps/hymnal/src/reader/header.test.ts`; back on the web, `apps/hymnal/src/reader/back.test.tsx`; the reading sheet, the page's text, the hanging indent and keep-awake in `apps/hymnal/src/reader/reading.slow.test.tsx`.

1. **Open by deep link.** `sim open hymns/100 --expect "label=Stanza 1"`. → `ok`; on iOS `detail.prompts` is 0 or 1; the snapshot holds `100`, `Great Is Thy Faithfulness`, `Stanza 1`, `Refrain`.
2. **The head.** `sim open hymns/15 --expect "label=Stanza 1"`, then on iOS read the frames with `agent-device snapshot --json` (the `rect` of the topic, the number and the title). → the frames give `number.x + number.width <= title.x`, the number's and the title's vertical centres within half a line, and the topic's frame above both. Read the frames only; the snapshot holds the words, so trash it after.
3. **Scroll to the end.** `sim open hymns/100 --expect "label=Stanza 1"`, then on iOS read the `rect` of every `hymn-scroll` with `agent-device snapshot --json --raw --observe-only --force-full --session verify-hymnal`. → each is as tall as its `pager-page` (670 pt on a 402 pt wide simulator with the bar under the pager), not as its words; a `hymn-scroll` taller than its page cannot scroll. Then `sim scroll "label=Stanza 3" down`. → `ok`; `Stanza 3` is on screen (`sim shot`).
4. **Scroll back.** `sim scroll screen up` twice. → `ok`; `Stanza 1` is on screen again.
5. **Back.** `sim back`. → `ok`; the Hymns list.
6. **Proof.** `sim snapshot` and `sim shot` after each step.
7. **The reading sheet.** `sim open hymns/100 --expect "label=Stanza 1"`, then `sim tap label=Aa`. → `ok`; the sheet shows `Reading`, `Text size 100%`, `Font` (`System` checked), `Line spacing` (`Normal` checked) and `Keep screen on` off.
8. **Largest text.** `sim tap "label=Larger text"` until it is disabled. → the reading shows `Text size 188%`; dismiss the sheet; the page's words and chords are larger.
9. **Hanging indent.** At the largest size, `agent-device snapshot --json` on a hymn with a long line: the `rect` of the line's first word and of the first word of its next row. → the second row's x is at least one indent (40 pt at the largest size, before the system's text size) right of the first's. Read the frames only, then trash the snapshot.
10. **Kept.** `sim tap Serif`, `sim tap Roomy`, then relaunch and open `Aa` again. → the same size, `Serif` and `Roomy` checked. Put each back (`Text size 100%`, `System`, `Normal`, `Keep screen on` off).
11. **Swipe** (iOS). From the list, `sim tap "role=link label=3, God Himself Is With Us"`, then `agent-device gesture pan 350 450 -300 0 250 --session verify-hymnal` (a swipe left, mid-screen). → the header title and the page head (`id=hymn-number`) read 4, and the bar reads `Play hymn 4`. Two swipes right (`gesture pan 50 450 300 0 250`). → 3, then 2.
12. **Back after swipes** (`reader-back`). `sim back`. → one press shows the Hymns list at its place, not hymn 3 or 4.
13. **A search's pager.** Search `3`, open the second result (30), swipe left. → 31, the third result. Two swipes right give 30, then 3 (not 29: the results are the list). `sim back` → the results, with `3` kept.
14. **The left edge** (the owner's rule: "if we swipe directly at the left edge, it should go back"). On a hymn opened from the list, `agent-device gesture pan 1 450 300 0 500 --session verify-hymnal`. → the list, not the hymn before. Again after two mid-screen swipes (4 → 3 → 2), on hymn 1 (the first page) with the pan low (`y` 750), and on a deep link to 600 with the pan high (`y` 200): each goes back. A pan from `x` 30 turns the page instead.
15. **A link's pager.** `sim open hymns/600 --expect label=600`, then swipe left. → 601 at once, with no jump on the first frame.
16. **Syllables, chords off (`reader-syllables`).** `sim open hymns/100 --expect "label=Stanza 1"` with chords off, `sim shot syllables`. → `id=syllable-1-1-1` is in the raw snapshot's tree beneath a `line`; the shot shows muted hyphens inside words and no word split across rows. On the web, `agent-browser --session verify-hymnal eval` counts `[data-testid^="syllable-"]` (more than the 24 `line`s) and no `[data-testid^="chord-"]`.

## Gotchas

- Hymn 100 has three stanzas, so `label=Stanza 4` is a `TargetMissing`, not a defect.
- A deep link opened while an earlier iOS prompt is unanswered stacks prompts; `sim open` answers up to three. A snapshot that shows only the alert means a prompt is still up.
- The sheet opens at 0.7 of the screen, which shows every row at the default system text size; at a larger one, drag its grabber up for the rest.
- On iOS a line with chords over its syllables is not one element: its chords keep their `chord-<p>-<l>-<n>` ids. A line without chords over its syllables (chords off, or a line-level part) reads as one element named by the whole line.
- `sim` has no swipe: pages turn by `agent-device gesture pan` on the drive's session. A pan that starts within 20 pt of the left edge is the back pan, so a swipe right starts mid-screen.
- The web has no pager: one page per route, and a swipe does nothing there.
- A hymn opened by link has no back button: `sim back` there taps a header button (`Aa` or `Chords`). Go back with the edge pan or a new `sim open /`.
- On iOS a stanza's group is read as text named `Stanza <n>`; on the web it is a `group` with that `aria-label`. `label=` matches both.
