# Settings and about

The Settings tab holds two choices, each a check beside the one chosen:
the appearance, `System`, `Light` or `Dark`, which the app draws every
screen in at once; and the chord style under `Chords`, `Simple` (the
default) or `Advanced`, which every hymn's chords are shown in. Below
them, the heading `About` credits the instruments the recordings are
played on, as their licences ask; the app's version is not shown.

## Sub-features

- `settings-appearance`: a radio group `Appearance` of `System`, `Light`, `Dark`; a press chooses one.
- `settings-kept`: the choice holds after leaving the tab and after a relaunch.
- `settings-chords`: under the heading `Chords`, a radio group `Chord style` of `Simple`, `Advanced`, `Simple` checked at first; a press chooses one, hymns show their chords in it, and it holds after a relaunch.
- `about`: the heading `About`, then the credits: `Salamander Grand Piano` by `Alexander Holm`, `CC BY 3.0` (a link to the licence), and `VS Chamber Orchestra 2` by `Versilian Studios`, `CC0`.

## How to get to it (user POV)

- The `Settings` tab.
- The link `hymnal://settings` (iOS) or the route `/settings` (web).
- The chord style: the same screen, below the appearance.
- About: the same screen, below the chord style.

## Driving it with sim

- **Preconditions:** the appearance is `System` and the chord style `Simple` (the defaults); put both back at the end.
- **States:** default, open (the chosen radio). Focus-visible, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/settings.test.ts`, `apps/hymnal/src/home/settings.test.tsx`, `apps/hymnal/src/reader/reader.slow.test.tsx`, `apps/hymnal/src/theme.test.ts`, `apps/hymnal/src/about.test.tsx`.

1. **Open.** `sim open settings --expect label=Dark`. → `ok`; the snapshot holds `Appearance` and `System` checked.
2. **Choose Dark.** `sim tap label=Dark`. → `ok`; the screenshot is dark, the snapshot has `Dark` checked.
3. **Second view.** `sim tap "role=button label=Hymns"`, then `sim tap "role=button label=Settings"`. → `ok`; `Dark` still checked, the list was dark too (`sim shot`).
4. **Put it back.** `sim tap label=System`. → `ok`; `System` checked.
5. **About.** `sim snapshot about`. → the tree holds the heading `About`, `Salamander Grand Piano`, `CC BY 3.0` as a link, and `VS Chamber Orchestra 2`.
6. **Chord style (`settings-chords`).** `sim open settings --expect label=Advanced`. → the radio group `Chord style`, `Simple` checked. `sim tap label=Advanced`. → `Advanced` checked. `sim open hymns/3 --expect "label=Stanza 1"`, chords on (`sim tap label=Chords` if off). → `chord-1-1-5` reads `Dsus4 Dsus2`. Relaunch (iOS `xcrun simctl terminate verify-hymnal im.cvr.hymnal`; web a reload), `sim open settings --expect label=Advanced`. → `Advanced` still checked; on hymn 3 `chord-1-1-5` still reads `Dsus4 Dsus2`. Then the chords-and-capo steps 1 to 9 on hymn 100 read as they always have.
7. **Put the style back.** `sim open settings --expect label=Simple`, `sim tap label=Simple`, chords off on a hymn. → `Simple` checked.

## Gotchas

- On iOS the radios read as `other` elements with `[checked]`/`[unchecked]`; on the web as `radio` with `aria-checked`. Tap by label on both.
- `Settings` names the tab and the screen title on iOS: use `role=button`.
- A run that leaves `Dark` chosen changes the next run's screenshots: always end at `System`.
- A run that leaves `Advanced` chosen changes the chords every later run reads: always end at `Simple`.
