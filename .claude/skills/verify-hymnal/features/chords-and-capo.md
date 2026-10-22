# Chords and capo

A reader turns chords on with the `Chords` button at the header's top right
(a guitar's head: on iOS the SF Symbol `guitars`, filled while on), and
each guitar chord shows above the syllable where it changes, in the words'
own font, the lines wrapping between words. While chords are on, the reader
transposes the hymn and sets a capo fret, and the chords follow: a
transpose raises the sounding key, a capo shows the shapes it plays. Each
hymn keeps its own transpose and capo; chords on or off holds for every
hymn. Turning chords off shows the plain hymn again.

## Sub-features

- `chords`: the header's `Chords` button (role button, selected while on) shows and hides the chords over the words on every hymn; the page's body holds no chords switch.
- `transpose`: `Transpose down`/`Transpose up` move the sounding key, read as `Key <key>`, through the twelve keys.
- `capo`: `Capo down`/`Capo up` set a fret from 0 to 11, read as `Capo <n>, <key> shapes` or `No capo`; the chords show that key's shapes.
- `chords-levels`: a part placed by line shows a row of its chords above each line; a plain part, its words alone; a hymn with no chords, its words and "No chords for this hymn yet.".
- `chords-kept`: each hymn's transpose and capo, and the `Chords` choice, survive leaving the hymn and relaunching the app.

## How to get to it (user POV)

- The hymn reader, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): the button `Chords` in the header's top right (beside where `Aa` goes), the only chord control while chords are off.
- While chords are on and the hymn has chords: one row at the page's top, under the number and title, with no tap needed: `Transpose down`, `Key <key>`, `Transpose up`, then `Capo down`, the capo text, `Capo up`.
- Each chord's text is its symbol. The box over syllable s of line l of the page's section p (each from 1, in page order) has the id `chord-p-l-s`; a syllable with no chord has none. A line-level row has the id `chords-p-l`.

## Driving it with sim

- **Preconditions:** chords off and every hymn at no transpose and no capo (the default of a fresh install, and how step 9 leaves it).
- **States:** default (off), open (on, with the key controls), empty (a hymn with no chords: the notice). Focus-visible, loading and error are n/a.
- **Regression:** `apps/hymnal/src/hymns/chords.property.test.ts`, `apps/hymnal/src/hymns/chords.test.ts`, `apps/hymnal/src/reader/reader.slow.test.tsx`, `apps/hymnal/src/player/ui.slow.test.tsx`, `apps/hymnal/src/settings.test.ts`.

1. **Off.** `sim open hymns/100 --expect "label=Stanza 1"`. → `ok`; the snapshot shows the header's button `Chords`, not selected, no switch in the page, no `chord-` id and no `Transpose` or `Capo`.
2. **Chords on.** `sim tap label=Chords` (the header's button). → `ok`; the button reads selected; `id=chord-1-1-1` reads `Db`, the key text reads `Key Db` and the capo text `No capo`; the shot shows each chord above its syllable with no padded spaces, the lines wrapping between words.
3. **Transpose.** `sim tap "label=Transpose up"`. → `Key D`; `chord-1-1-1` reads `D`.
4. **Capo.** `sim tap "label=Capo up"` twice. → `Capo 2, C shapes`; `chord-1-1-1` reads `C`.
5. **Capo and transpose together.** `sim tap "label=Transpose up"`. → `Key Eb`; `chord-1-1-1` reads `Db`, the printed chord (capo 2 plus transpose 2).
6. **Kept per hymn, on for every hymn.** `sim open hymns/1 --expect "label=Stanza 1"` (no `sim back` here: on a hymn opened by deep link the header has no back button, and `back --in-app` taps `Chords`, its only button). → chords on with no tap, hymn 1's own key and `No capo`. `sim open hymns/100 --expect "label=Stanza 1"`. → `Key Eb`, `Capo 2, Db shapes`.
7. **Relaunch.** `xcrun simctl terminate verify-hymnal im.cvr.hymnal`, then `sim open hymns/100 --expect "label=Stanza 1"`. → `Chords` selected, chords on, `Key Eb`, `Capo 2, Db shapes`.
8. **Levels.** `sim open hymns/126 --expect "label=Stanza 1"`. → the words alone and "No chords for this hymn yet.", no key control. `sim open hymns/11 --expect "label=Stanza 1"`. → `id=chords-1-1` is a row of chords above the line (`sim shot`).
9. **Off again, back to the default.** On hymn 100: `Transpose down` twice, `Capo down` twice (→ `Key Db`, `No capo`), then `sim tap label=Chords`. → the button not selected, the words alone, as in step 1.
10. **The largest page.** `sim open hymns/150 --expect "label=Stanza 1"`, `sim tap label=Chords`, `sim snapshot` holds `chord-1-1-1`. The tap's `ms` stays under 1000 at the recorded load; three trials, chords turned off between them.
11. **Proof.** `sim snapshot` and `sim shot` after each step; the video of the journey.

## Gotchas

- Hymn 100 is printed in D-flat: `Db` at rest is right, and a transpose of 12 comes back to `Db`, never `C#`.
- `Capo down` at 0 and `Capo up` at 11 are disabled, not defects. The transpose wraps.
- The app's bundle id for `simctl terminate` is the one `sim install` printed; read it there if it differs.
- A run that leaves chords on or a move set changes the next run's step 1: finish with step 9.
- VoiceOver reads a syllable-level line in syllable pieces: a known gap, not a failure of this journey.
