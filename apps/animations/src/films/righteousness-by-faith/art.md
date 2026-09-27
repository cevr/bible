# Art direction: righteousness-by-faith

The colour script is bright (BibleProject's Justice film: mean luma about 149,
one black moment). Skies change per beat; the world is chipboard; the people
are grey paper. Scarlet is sin (Isa 1:18), white the robe, gold the word and
God's presence. Draw every scene in `rive/scenes/<beat>.rml` from these
colours; a colour outside them needs a reason in the beat's brief.

## Colours

| Role                     | Name         | Hex       |
| ------------------------ | ------------ | --------- |
| IDEA: the page           | paper        | `#eeddc8` |
|                          | paperTone    | `#8c7f71` |
| IDEA: its ink            | ink          | `#332b23` |
|                          | inkSoft      | `#665d52` |
| STORY: chipboard         | board        | `#ab8163` |
|                          | boardLight   | `#c49a78` |
|                          | boardShade   | `#83644b` |
|                          | boardDeep    | `#423123` |
| The people               | figure       | `#b7b2a8` |
|                          | figureShade  | `#8f8a80` |
|                          | outline      | `#2b2622` |
| Sin                      | scarlet      | `#ce0914` |
|                          | scarletShade | `#a4070e` |
| The robe                 | robe         | `#fcfefc` |
| The word, God's presence | gold         | `#e6b347` |
|                          | glow         | `#fbefc8` |
| Teal day (open, landing) | tealTop      | `#5dccb5` |
|                          | tealMid      | `#a4f0b7` |
|                          | tealLow      | `#e7fab0` |
| Peach (explaining)       | peachTop     | `#f4b18b` |
|                          | peachLow     | `#f9d08e` |
| Sunset (the cross)       | sunsetTop    | `#d3a27f` |
|                          | sunsetLow    | `#8a4736` |
| Dawn (the answer)        | dawnTop      | `#cfddcf` |
|                          | dawnLow      | `#ded7b1` |
| The one black moment     | night        | `#1b150d` |

## Type

Display Fraunces, body Inter, handwriting Gaegu, Greek EB Garamond, Hebrew
Frank Ruhl Libre. The project ships Inter (`rive/fonts/`); add each other face
as a `FontAsset` in `rive/assets.rml` with its file in `rive/fonts/` before a
scene uses it.
