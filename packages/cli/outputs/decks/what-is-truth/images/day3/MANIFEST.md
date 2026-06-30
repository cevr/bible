# Night 3 v3 — Image Set

11 devotional fine-art oil paintings for `why_suffering_v3.key`, generated in the
Day-2 deck's style (Greg Olsen / Simon Dewey lineage — warm earth tones, painterly
oil texture, volumetric divine light, golden mist). Style anchor: `01-covering-cherub`.
All generated via `okra image` (codex / gpt-5.5) at 1536×864 (16:9), using the Day-2
"world empires" painting as a `--ref` style anchor for consistency.

## Slide map

| File                           | Slide           | §   | Placeholder it fills                                                 |
| ------------------------------ | --------------- | --- | -------------------------------------------------------------------- |
| `00-title.png`                 | 1               | §1  | series title art (atmospheric, center kept clear for title overlay)  |
| `02-stars-before-creation.png` | 5               | §1  | field of stars / deep space — before creation                        |
| `01-covering-cherub.png`       | 21? / §3 anchor | §3  | Lucifer the covering cherub over the throne (STYLE ANCHOR)           |
| `03-sanctuary.png`             | 12              | §3  | the wilderness sanctuary / tabernacle, full view                     |
| `04-ark-cherubim.png`          | 14              | §3  | the ark of the covenant, two cherubim over the mercy seat            |
| `05-throne-guardian.png`       | 21              | §3  | light radiating from the throne, a guardian figure (the §3 payoff)   |
| `06-open-hands.png`            | 26              | §4  | open hands — love/freedom freely given                               |
| `07-human-before-cosmos.png`   | 49              | §8  | a single human figure facing a vast courtroom/cosmos (THESIS REVEAL) |
| `08-diverging-paths.png`       | 64              | §11 | two diverging lines from a near-shared origin                        |
| `09-bridge-of-light.png`       | 86              | §14 | a gulf/chasm with a cross-shaped bridge of light across it           |
| `10-door-light.png`            | 94              | §15 | a door, light beneath it (Rev 3:20 close)                            |

Note: `01-covering-cherub` and `05-throne-guardian` both serve §3's throne/guardian
beat. Slide numbers are from the 97-slide v3 build; confirm at embed time (the build
script's `[IMAGE: ...]` notes are the source of truth).

## Reusable style prompt (STYLE block)

> 16:9 widescreen devotional fine-art oil painting, classical religious illustration
> in the Greg Olsen / Simon Dewey lineage. STYLE: soft painterly oil-on-canvas
> brushwork with visible texture and no hard digital edges; warm muted earth-tone
> palette of golds, ambers, creams and soft browns, with cool slate-blue accents only
> inside the divine light; dramatic volumetric radiant light shafts from a heavenly
> source; soft atmospheric haze and luminous dust in the air; reverent, majestic,
> awe-filled mood; cinematic depth with background elements fading into golden mist.
> NO text, NO lettering, NO modern elements.

Reference image (`--ref`): the Day-2 "world empires" painting (extracted from
`just_another_book v2.key`). To regenerate any image, prepend the STYLE block to the
SUBJECT line and pass `--ref <day2 painting> --size 1536x864`.
