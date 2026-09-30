# Prompting the sound library

What the p4-sfx2 trials heard (412 candidates in all, each logged with its settings, measurements and verdict). The trials changed one setting at a time: prompt influence 0.3/0.5/0.7/0.9, a tight or padded length, and the prompt's style (a bare noun phrase, "close, dry, single" tags, or a described action). The framework's defaults come from it: one-shots at influence 0.7 × 6 candidates, beds at 0.3 × 3 (`DEFAULT_INFLUENCE`, `DEFAULT_CANDIDATES` in `@bible/film/core`). A sound names its own influence only where a trial heard better.

Before you declare new settings, run `sfx try <name> --influence … --secs … --prompt …`. It makes candidates without editing `library.ts`. They wait under their own request, and `keep` takes them once the declaration says the same.

## One-shot foley (cloth, paper, reeds, thread)

- Describe the action and its material, not the object's name. "measuring tape" gets a steel tape whatever the cloth; "a long soft fabric ribbon pulled through fingers" gets cloth. "needle and thread" alone gets a sewing machine; "a needle punches through canvas and the thread is pulled tight" gets two punches.
- Hold the length to the action. At 1.5 s the ribbon became rhythmic ticks; at 0.8 s it was one swish. A reed mat at 1.2 s was a dense rustle, and padded to 3 s it was quiet and thin.
- Name the texture you want heard, "crisp fabric flutter" or "reeds crackling". "soft", "faint" and "subtle" make the quietest takes in a family.
- Watch for low rumble on cloth. A cloth _movement_ (lift, settle, unfurl) came back as a sub-30 Hz thud with the fabric on top, at every influence tried. "a cloth flag flapping and snapping once, crisp fabric flutter" had none. The loudness the mix levels by ignores sub-bass, so a rumbly take plays at the right level but spends headroom.
- The tags style ("close-up, dry, single …") on its own made near-silent takes (−49 to −53 LUFS for needle and sizzle). Add tags to a described action; never use them instead of one.
- A count ("twice", "three stitches") is not heard. Give each event its own sound in the prompt and room in the length.

## Impacts (gavel, stamp, stone, book)

- Use influence 0.7–0.9. At 0.5 the gavel was 20 dB quieter and carried more sub-bass; at 0.9 it was loud and clean.
- Pad the length a little past the hit, 1.6 s for a knock. Tight lengths (0.6 s) came back nearly silent, and a padded one starts 20–30 ms before the hit instead of on sample 0.
- Say "once" and "loud sharp knock", plus the surface: "on a hardwood block".
- Generated files are not trimmed. A take whose hit comes 0.3–0.5 s in lands that late after its cue, so keep takes that start within about 50 ms. At 0.9, 24% of takes had a lead-in, against 11% at 0.7.

## Beds and loops

- The subject decides whether it loops. Influence barely matters: 35% of beds passed the 1 dB seam at 0.3, 38% at 0.6. Indoor crowds and rain loop most of the time (court 7/7, hall and house 2/3 each, rain 3/3); a street with carts and footsteps less often (town 2/7). Birdsong and wind mostly fail (dawn 1/12, garden 1/9, desert 3/13) because they come and go in gusts and gaps.
- For a crowd bed, make the crowd the subject and the room its colour: "murmur of a crowd of people waiting in a large stone hall, many indistinct voices at a distance". "quiet … faint … very soft … no clear voices" gave near-silent room tone, and "a cart far away" gave low rumble.
- For birds, ask for song that never stops: "soft and continuous, even". Name birds first and close, because "leaves rustling" turned into wind boom.
- For wind, say "constant and even, no gusts". Lengthen it (30 s) so the two ends match in level. "wide" and "empty" gave gusts.
- Nature beds need more candidates. Where three fail the seam, `sfx try <name> --count 4` before rewording.

## What measuring caught that listening would miss

The trials measured each take with throwaway scripts; `sfx list` and `sfx check` report loudness, loop seams and each one-shot's start and hit (the lock's `onset` and `hit`, which `sync: 'hit'` placements land on). The measures were:

- integrated and momentary-max loudness;
- start time and peak time;
- onset count;
- share of energy under 30 Hz;
- spectral centroid;
- 4–6 Hz modulation in the speech band, a proxy for syllables and voice-like texture;
- seam level and click.

Rumble, lead-ins and loop seams are all quicker to find by number than by ear. Confirm the rest by ear in `sfx audition`.
