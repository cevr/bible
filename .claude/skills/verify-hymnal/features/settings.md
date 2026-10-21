# Settings and about

The Settings tab holds one choice, the appearance: `System`, `Light` or
`Dark`, a check beside the one chosen. The app keeps it and draws every
screen in it at once. An about section (version, sources, credits) is
**not on main**.

## Sub-features

- `settings-appearance`: a radio group `Appearance` of `System`, `Light`, `Dark`; a press chooses one.
- `settings-kept`: the choice holds after leaving the tab and after a relaunch.
- `about`: the app's version and credits. Not on main.

## How to get to it (user POV)

- The `Settings` tab.
- The link `hymnal://settings` (iOS) or the route `/settings` (web).
- About: no entry point on main.

## Driving it with sim

- **Preconditions:** the appearance is `System` (the default); put it back at the end.
- **States:** default, open (the chosen radio). Focus-visible, loading, empty and error are n/a.
- **Regression:** `apps/hymnal/src/settings.test.ts`, `apps/hymnal/src/theme.test.ts`.

1. **Open.** `sim open settings --expect label=Dark`. → `ok`; the snapshot holds `Appearance` and `System` checked.
2. **Choose Dark.** `sim tap label=Dark`. → `ok`; the screenshot is dark, the snapshot has `Dark` checked.
3. **Second view.** `sim tap "role=button label=Hymns"`, then `sim tap "role=button label=Settings"`. → `ok`; `Dark` still checked, the list was dark too (`sim shot`).
4. **Put it back.** `sim tap label=System`. → `ok`; `System` checked.
5. **About.** `sim tap label=About`. → on main: `TargetMissing` (not on main).

## Gotchas

- On iOS the radios read as `other` elements with `[checked]`/`[unchecked]`; on the web as `radio` with `aria-checked`. Tap by label on both.
- `Settings` names the tab and the screen title on iOS: use `role=button`.
- A run that leaves `Dark` chosen changes the next run's screenshots: always end at `System`.
