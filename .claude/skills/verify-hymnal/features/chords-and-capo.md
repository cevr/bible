# Chords and capo

**Not on main.** A reader will turn chords on over a hymn's words, each
chord above the syllable where it changes, and set a capo that moves them.
Main keeps only the stored `chords` setting; no screen shows a chords
toggle or a capo control. Every journey here fails with `TargetMissing`
until a unit merges them, and that failure is the expected result.

## Sub-features

- `chords`: a toggle on the hymn reader that shows and hides the chords. Not on main.
- `capo`: a control that sets the capo and moves the chords. Not on main.

## How to get to it (user POV)

- The hymn reader, `hymnal://hymns/<n>` (iOS) or `/hymns/<n>` (web): the toggle `Chords` (not on main).
- The capo control beside it (not on main; its name is not decided).

## Driving it with sim

- **Preconditions:** the hymn reader open (`sim open hymns/100 --expect "label=Stanza 1"`).
- **States:** none on main. Default, focus-visible, open, loading, empty and error are n/a until the feature merges.
- **Regression:** none on main.

1. **Chords toggle.** `sim tap label=Chords`. → on main: `{"ok":false,…,"error":{"_tag":"TargetMissing","target":"label=Chords",…}}`, exit 1. Once merged: `ok`, and the snapshot shows chord names over the words.
2. **Capo.** No step on main. The unit that adds the capo writes its step and its accessible name here.
3. **Proof.** Keep the `TargetMissing` line in `results.jsonl` and `sim shot` of the reader without the toggle.

## Gotchas

- `TargetMissing` here is the reason "not on main", not a defect: report it as such, never as a pass through the settings or another path.
- When chords merge, edit this file in the same branch: drop the "not on main" lines and write the real steps.
