# Hymnal verification map

The maintained source for verifying what a hymnal reader can do. Read this
index before driving the app, then use the matching feature file as the
recipe.

## Baseline

- `bun run --cwd apps/hymnal sim boot --platform ios --port $PORT --out "$EVIDENCE"`,
  then `bun run --cwd apps/hymnal sim install` (iOS), or `--platform web`
  (SKILL.md, Launch). Never ports 8191 or 8095, the owner's previews.
- `bun run --cwd apps/hymnal sim doctor` passes before the first drive.
- The recipes write `bun run --cwd apps/hymnal sim` as `sim`. A step's
  "→" is its observable result: the JSON line's `ok`, and what the
  snapshot or screenshot shows.
- The app has no seed: its 695 hymns are compiled in, and its stored
  choices are the appearance setting, the `Chords` choice, the chord
  style, each hymn's transpose and capo, and the reading sheet's choices. A
  drive that changes one puts it back at the end (`System`; chords off,
  chord style `Simple`, no transpose, no capo; text size 100%, `System`
  font, `Normal` spacing, keep screen on off).

## Proof and skip reporting

- Each journey records a video, `sim record start <feature>` to
  `sim record stop`: `$EVIDENCE/video/<feature>.mp4` or `.webm`.
- Each step appends its JSON line to `$EVIDENCE/results.jsonl` and saves
  `sim snapshot <step>` and `sim shot <step>`.
- A stored choice is proved by a second view: leave the screen and come
  back, or relaunch, and read it again.
- An entry point that is not on main is reported as the `TargetMissing`
  line `sim tap` printed and the reason in its Gotchas. It never counts as
  verified through another path.

## Entry contract

Each feature file has an H1, one paragraph of user-visible behavior, then
exactly these H2s in order:

1. `Sub-features`: short ids, one line each.
2. `How to get to it (user POV)`: every entry point a reader has.
3. `Driving it with sim`: starts with three lines, then labeled steps that
   pair a reader's action, an exact command and the observable result.
   - **Preconditions:** the state the steps need beyond the baseline.
   - **States:** which of default, focus-visible, open, loading, empty and
     error the steps exercise; mark the rest n/a.
   - **Regression:** the automated tests that cover the feature.
4. `Gotchas`: traps that waste or invalidate a run.

Name reader paths, accessible names, commands and observable results. Keep
source seams out.

## Features

| Feature                               | Id                                                                             | Deep link (iOS / web)               | Proof                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [Hymn list](hymn-list.md)             | `hymn-list`                                                                    | `hymnal://` / `/`                   | rows by number, open a row; a favourite starred; Recent 5 on home, See all opens all                                   |
| [Hymn reader](hymn-reader.md)         | `hymn-reader`                                                                  | `hymnal://hymns/100` / `/hymns/100` | stanzas and refrains in order, scroll; swipe to the next hymn, a left-edge pan goes back                               |
| [Chords and capo](chords-and-capo.md) | `chords`, `capo`, `transpose`, `chords-levels`, `chords-kept`, `chords-simple` | `hymnal://hymns/100` / `/hymns/100` | `chord-1-1-1` reads `Db`, then follows transpose and capo; kept per hymn; Simple on hymn 3: `G`, `D`, no `chord-1-1-6` |
| [Player](player.md)                   | `player`                                                                       | `hymnal://hymns/100` / `/hymns/100` | Play turns to Pause, the Recording control; the bar the page's own, docked once held                                   |
| [Settings and about](settings.md)     | `settings`, `settings-chords`, `about`                                         | `hymnal://settings` / `/settings`   | appearance kept after leaving; chord style kept after a relaunch; About's credits                                      |
| [Search](search.md)                   | `search`                                                                       | `hymnal://search` / `/search`       | one match for "great is thy", open it                                                                                  |
