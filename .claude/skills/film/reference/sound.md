# Sound effects: code first

The owner's rule (2026-10-15): ElevenLabs makes a sound effect only when it needs realism that code cannot make, and code makes every simpler sound, for "the control and consistency of code-based sound fx". A code sound is data in the app's library (`apps/animations/sounds/library.ts`). It renders from each seed whenever a mix, a check or the lab needs it: nothing is stored, nothing is paid for, and one seed gives the same samples on every host. This page is how such a sound is written, judged without listening, and put to the owner.

## Which sounds are code

| Kind        | Made by                                                    | Kept                                 | Use it for                                                                                                         |
| ----------- | ---------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `code`      | a graph of nodes (`core/synth/graph/nodes.ts` `CodeSound`) | nothing: each seed renders on demand | every simple sound: a knock, a thud, a whoosh, a hiss, a chime, a drone, wind, rain                                |
| `generated` | ElevenLabs, as candidates the owner curates                | the lock and the private store       | the realism code cannot reach: voices and crowds, creatures, life far off, paper and cloth handled, textured foley |
| `recorded`  | a CC0 or CC BY recording under `public/`                   | the repo                             | a real sound already in hand                                                                                       |

A generated entry says `why` it needs ElevenLabs: the realism its credits pay for. The schema requires it (`core/sfx.ts` `Generated`).

Before a new sound is prompted, run `bun run sfx audit`. It reads which generated sounds code can make (`core/sfx-audit.ts` `auditLibrary`), by ordered rules over each prompt's words. The first rule that holds one of the words decides, and each verdict prints its reason and the words that decided it.

| Verdict                   | Words (each form the rule lists)                                                               | Reason                            |
| ------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------- |
| needs realism             | voice, crowd, people, bird, wing, footstep, town, market, …                                    | voices, creatures or life far off |
| needs realism             | rustle, crackle, scratch, flap, tear, slide, clink, clatter, …                                 | a handled texture                 |
| code can make this (try)  | creak, rumble, roll                                                                            | a borderline texture              |
| code can make this (sure) | whoosh, hiss, sizzle, knock, thud, thump, tick, click, chime, bell, drone, wind, rain, drip, … | a shape code makes                |
| needs realism             | paper, cloth, linen, robe, leaves, straw, thread, …                                            | a handled material                |
| code can make this (try)  | (no rule holds a word)                                                                         | no rule matched                   |

The order matters: a crowd's room is still a crowd, and "a paper cutout swept … whoosh" is a whoosh. The audit is free and the same on every run. Fix a misjudged prompt by a rule in `core/sfx-audit.ts` and its test, which pins the app library's verdicts.

## A code sound

```ts
'wood.knock': {
  kind: 'code',
  use: 'one-shot',
  variants: 3,
  sound: {
    play: {
      _tag: 'Layer',
      of: [
        {
          node: {
            _tag: 'Envelope',
            points: [[0, 1], [0.06, 0]],
            curve: 'exponential',
            of: {
              _tag: 'Filter',
              type: 'bandpass',
              hz: { _tag: 'Vary', min: 700, max: 1000, curve: 'log' },
              q: 3,
              of: { _tag: 'Noise', color: 'white', secs: 0.08, stream: 'crack' },
            },
          },
        },
        {
          node: {
            _tag: 'Envelope',
            points: [[0, 1], [0.18, 0]],
            curve: 'exponential',
            of: {
              _tag: 'Osc',
              wave: 'sine',
              pitch: { _tag: 'Ramp', from: 180, to: 120, curve: 'exponential' },
              secs: 0.2,
            },
          },
          db: -4,
        },
      ],
    },
  },
},
```

A short band of noise (the crack, its centre drawn per seed) over a falling sine (the body). Each seed renders 0.2 s, onset and hit at 0 s.

- `sound.play` is the graph. `sound.key` (`{ tonic, scale }`) is the scale a degree pitch counts in.
- `variants` is how many seeds play, 1 to 12: seed n is variant n. The mix rotates its placements through them as it does through takes.
- A code one-shot has no jitter unless it names one: its seeds vary it.
- Each render is one channel at `SYNTH_RATE` (44.1 kHz, the mix's rate), peaked at `SYNTH_PEAK` (−1 dBFS). The mix levels it by its measured loudness, as it levels a take.
- Its label, `code:<RENDER_VERSION>:<hash>/<seed>`, names the data and the renderer. An edit to either gives a new mix key, so `bun run check <film>` says the master is stale until `bun run mix <film>` remakes it.

### The nodes

| Group   | Node                          | What it does                                                                                                    |
| ------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Sources | `Osc`                         | a band-limited sine, triangle, saw or square at a pitch                                                         |
|         | `Noise`                       | white, pink or brown noise                                                                                      |
|         | `Partials`                    | struck modes: `glass`, `bell`, or a list of ratios, levels and decays                                           |
|         | `Sample`                      | another code sound of the library, rendered alone on its own seed                                               |
| Shapers | `Gain`, `Envelope`, `Fade`    | a level in dB; a level through points; faded in and out                                                         |
|         | `Drive`                       | driven into a `transfer` curve: `tanh`, `soft`, `hard` or `fold`                                                |
|         | `Crush`, `Resample`           | fewer bits or a held rate; faster or slower by semitones, its length with it                                    |
|         | `Filter`                      | a biquad of the Audio EQ Cookbook's eight types, whose frequency, Q and gain may move                           |
| Space   | `Delay`, `Reverb`             | an echo with feedback; a room (a mono Freeverb)                                                                 |
| Time    | `Loop`                        | its last seconds crossfaded into its head, so a bed loops                                                       |
|         | `Layer`, `Sequence`, `Repeat` | children mixed, each from its `at`; one after another; one child again and again (`Count`, `During`, `Poisson`) |

A field fixed for a render takes a value: a number, a range drawn once per seed (`{ _tag: 'Vary', min, max }`, with `curve: 'log'` for a pitch or a time), or a choice (`{ _tag: 'Pick', of, by }`; with `by: 'seed'`, variant n plays the nth). A field that moves takes a signal: a value held, a `Ramp`, `Points`, a `Wobble` (smooth seeded noise) or an `Lfo`. Each field's name says its unit: `secs`, `hz`, `db`, `semitones`. A pitch is Hz, a note name of octaves 0 to 8 (`D5`; `C0` to `B8`, whose octave is read whole) or a degree of the key (`{ degree, octave }`).

### The families

Most sounds are made of a few shapes. `core/synth/graph/presets.ts` builds each as a function of a few settings that returns a node, and `@bible/film/core` exports them to the app. A sound layers them (`Layer`, each child at its `at` and `db`), and its seeds vary each as the table says.

| Family    | Settings                                                    | What it makes                                                                                               | Each seed draws                                    |
| --------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `burst`   | `color`, `low`, `high`, `attack`, `decay`                   | noise in a band, struck: a click when short and bright, a puff of air when soft and dark                    | both edges of the band, within 2 semitones         |
| `thump`   | `hz`, `octaves`, `drop`, `decay`                            | a sine struck `octaves` over its pitch, falling to it over `drop` seconds, as a drum skin's pitch falls     | both ends of the fall, within a semitone           |
| `knock`   | `material` (`wood` or `stone`), `hz`, `secs`                | a material's modes struck at a pitch, over its click of contact                                             | the pitch, within a semitone                       |
| `scatter` | `count`, `first`, `every`, `fall`, `material`, `hz`, `secs` | things landing one after another, each `fall` dB quieter: a knock, a thud and a puff of dust each           | each landing's time but the first's                |
| `whoosh`  | `onset`, `hit`, `fall`, `low`, `high`, `q`                  | noise through a band that rises to `high` at the hit, as something passes close by                          | the top of the band, within 2 semitones            |
| `hiss`    | `hz`, `q`, `top`, `breath`, `rise`, `hold`, `secs`          | breath forced out: white noise in a high band over a low breath, up evenly, held, then falling evenly in dB | the band, within 2 semitones                       |
| `sizzle`  | `flash`, `crackle`, `secs`                                  | water on hot metal: a flash of steam, then steam, a low boil and pops, falling evenly by 45 dB              | the steam's edge, and the pops' times and levels   |
| `breeze`  | `secs`, `hz`                                                | a steady breeze, made to loop: pink air through a band that wanders slowly, its level swaying               | its sway and its band's wander                     |
| `rain`    | `secs`, `hiss`, `taps`                                      | soft rain, made to loop; with `taps`, that many taps a second on a roof's tiles                             | the drops' and the taps' times, levels and pitches |
| `room`    | `secs`                                                      | room tone, made to loop: brown body and pink hiss under a slow swell of air                                 | its swell                                          |
| `drone`   | `root`, `secs`                                              | a low held tone, made to loop: the root, its octave, its twelfth and its fifth, breathing slowly            | its breath                                         |
| `chime`   | `root`, `partials` (`glass` or `bell`), `secs`              | a struck chime on a degree of the root's major pentatonic scale                                             | its degree: variant n rings degree n − 1           |
| `drain`   | `from`, `to`, `secs`                                        | a hollow tone falling from one note to another, breath following it down a band, fading                     | its breath                                         |
| `bloom`   | `root`, `secs`                                              | a soft swell: the root's chord entering note by note under a rising shimmer                                 | each note's entry, up to 40 ms late                |
| `notes`   | `root`, `count`, `secs`                                     | `count` bright plinks on two octaves of the root's scale, one after another, each ringing on                | each plink's note, time and level                  |

Each family is pinned by its samples and heard to do what its doc says (`core/synth/graph/presets.test.ts`). A second of each renders inside the 20 ms budget that **Speed is measured, never gated** sets below (`bun run test:perf` logs each). A family is the place to change a shape: an edit to it changes the label of every sound built from it.

### Seeds and streams

Each node draws its numbers from a stream named for its place in the tree. A node that names its `stream` keeps its draws and its children's wherever it moves, so put a name on a node before you put nodes in front of it. A stream name is unique in its sound: two nodes with one name draw the same numbers, which is correlated noise nobody chose, and the library load refuses it (`StreamDuplicate`). A `Sample` renders on its own seed, so the sound it samples keeps its own names.

The load (`core/synth/resolve.ts` `resolveCode`) refuses these before anything renders:

- a sample of a sound the library lacks (`SampleUnknown`), or of one that is not code (`SampleNotCode`);
- a sound that samples itself through others (`SampleCycle`);
- a degree pitch with no key (`DegreeWithoutKey`);
- a sound longer than `MAX_CODE_SECS` (120 s), or one that writes more than `MAX_CODE_WORK` seconds of frames, at the most its draws allow (`CodeTooLong`).

What only a render shows, the film's check hears: a code sound that the film places, with a seed that renders silent (nothing over BS.1770's −70 LUFS gate), fails `bun run check <film>` (`SeedSilent`, an error that names the sound and the seed).

### The same samples on every host

The renderer computes with its own sine, cosine, exponential, logarithm and tanh (`core/synth/graph/math.ts` `sinTurn`, `cosTurn`, `exp`, `log`, `tanh`), built from + − × ÷ and the square root, which every host rounds the same way (IEEE 754). In the graph's folder, the lint rule `film/synth-own-math` refuses the host's `Math` transcendentals, `**`, and any helper from outside the folder. `RENDER_VERSION` is the digest of the probes' pins in `core/synth/graph/fixtures/golden.ts`: a change that moves one sample of one probe moves it, and with it every code sound's label.

## A code trial

A generated sound carries its code version as a trial: `code: { sound, variants }` on its entry. No film places a trial, so no film plays a code sound the owner did not choose.

A trial is heard beside what plays:

- `bun run sfx render <name> --trial --sheet` writes each seed as a WAV under `<FILMS_OUT>/sounds` (`<name>-trial-<seed>.wav`), and its sheet as a PNG beside it. `--seed n` renders one seed, past the variants too.
- `bun run sfx audition <name> --trial` writes its seeds in one WAV, levelled as the mix plays them, 0.5 s apart.
- `bun run sfx compare <name>` prints its numbers beside what plays (below).
- `bun run sfx check` hears a trial bed's loop seams, named `<name> (trial)` (`LoopSeam`, by seed).
- A film's choices (`GET /api/films/<film>/choices`) list a trial's seeds after the sound's takes, as `code trial n`, each heard alone (`…/choices/alone`) and in place (`…/choices/mix`). No verb picks one: a trial is tuned by editing its data, and chosen in an ask.
- `bun run sfx ab <name> --out <dir>` writes the clips for the ask (see Put it to the owner, below).

## The loop

1. Run `bun run sfx audit`. Pick a sound with the verdict "code can make this (sure)".
2. Write `code: { sound, variants: 3 }` on its entry, from the families where one fits. Start from what the take does: its prompt, its lock record (`bun run sfx list`) and its numbers (step 4 reads them).
3. Run `bun run sfx render <name> --trial --sheet`. Read each PNG.
4. Run `bun run sfx compare <name>`: each seed's numbers, each side's median, how far apart they stand, and the sync lines.
5. Edit the data and go again from step 3. A render takes milliseconds and no credits.
6. For a bed, run `bun run sfx check` until no `LoopSeam` names the trial.
7. When the trial meets the bar below, run `bun run sfx ab <name> --out <dir>`, then put it to the owner.

Judge every seed, by the median and the worst, never by the best. Never say how a sound sounds without its number.

## The bar a trial meets

A trial goes into an ask only when each of its seeds meets all of these:

- its onset is within `LEAD_IN` (0.05 s), unless the take's onset is later and a placement depends on it;
- where a placement plays it from its start, the hit moves 20 ms or less (`HIT_MOVE`; compare's sync lines), when what plays has a hit to hear: a swell or a hiss whose loudest 10 ms stands under `HEARD_HIT` (3 dB) over its neighbours has none, and its sync line says so;
- a bed's seam is unheard (`sfx check` finds no `LoopSeam`);
- its share below 30 Hz is no higher than the take's.

A trial that fails one stays out of the ask, and the report gives its numbers.

## Read a sheet

`--sheet` writes a 1200 × 640 PNG beside each WAV (`core/synth/sheet.ts` `sheetOf`, encoded by `tools/png.ts` `encodePng`). Three panels share one clock, left to right:

- **The spectrogram**, the top 400 rows: 30 Hz to 16 kHz on a log scale, low at the bottom, from black (−90 dB) through purple, red and orange to pale yellow (0 dB, a full-scale sine).
- **The waveform**, 160 rows: each column's least and greatest sample in pale blue, full scale at the panel's edges.
- **The momentary loudness**, 72 rows: BS.1770's 400 ms blocks in amber, −70 LUFS at the bottom and 0 at the top, faint lines every 20 LU.

Faint white lines cross at each second. A one-shot's onset is green and its hit red. On a bed, the cyan line is where the mix starts to crossfade the bed into its head. The picture holds no text: `sfx compare` prints its numbers.

## Compare's numbers

`bun run sfx compare <name>` prints a line for each render of what plays (the kept takes), then for each seed of the trial:

| Column             | What it is                                                                    |
| ------------------ | ----------------------------------------------------------------------------- |
| `secs`             | the render's length                                                           |
| `LUFS`             | its integrated loudness: what a bed is levelled by                            |
| `max`              | its momentary max: what a one-shot is levelled by                             |
| `peak`             | its sample peak, dBFS                                                         |
| `onset`            | where it starts to sound, seconds into the file                               |
| `hit`              | its loudest moment                                                            |
| `stands`           | how far that moment stands over the 150 ms either side, dB: under 3, no hit   |
| `tail`             | from the hit to the last 10 ms within 40 dB of the loudest: how long it rings |
| `centroid`, `flat` | its brightness, and how noise-like it is (0 a tone, 1 white noise)            |
| `<30 Hz`           | its share of the power below 30 Hz: rumble the loudness never hears           |

Each side's median follows its renders. The band table lists the one-third-octave bands within 40 dB of either side's loudest, each as its share of the power in dB, and how far it moved. `balance` is the RMS of those moves; the bands that moved over 6 dB are named, and how far the hit moved.

The sync lines read each film's `sound.ts`: one line for each effect that places the sound, with how far it would hear the hit move (the medians' move, and the worst seed's), marked `over 20 ms` past `HIT_MOVE`. An effect synced to its hit never moves; one synced to its onset moves as far as the hit moved from the onset. Where what plays has no hit to hear, the line is marked `no heard hit in what plays (it stands under 3 dB)`: its move is of a loudest moment nobody hears, so judge its onset and the sheet's loudness panel instead.

Numbers, no verdict: a distance is a hint for the ear, never a target to make small (`core/synth/compare.ts`).

## Put it to the owner

1. Run `bun run sfx ab <name> --out <dir>` for each trial. It writes three clips and their sheets: `<name>.now.mp4` (what plays now: the kept takes), `<name>.code.mp4` (the trial's seeds), and `<name>.now-then-code.mp4` (both, 1 s apart). Each is the line-up levelled as the mix plays it, 0.5 s between renders; a bed plays 8 s of each render, faded at the ends. The picture is the line-up's sheet, held (`tools/media.ts` `Media.card`, a key frame a second), so a set's video player plays it on the phone.
2. Publish the clips as one set (the lab MCP's `publish_set`, or `bun cli.ts publish <folder> --production <production>`).
3. Ask once (The flow, "Ask, don't chat" in [SKILL.md](../SKILL.md)): a section for each sound, video A (now) then video B (code), a choose of `code` (play the code sound), `keep` (keep the generated take) or `remake` (remake the code sound), one recommended with a why from the numbers, and an optional free text.
4. Apply the answers:
   - `code`: the entry becomes `kind: 'code'` with the trial's `sound` and `variants`, keeping its `use`, `level` and `duck`. Its lock record stays (the film's choices list those takes as "was"): put the generated entry back and its kept takes play again. `sfx pull` and `sfx push` still carry those takes, and `sfx check` checks them only once they play again.
   - `keep`: delete the trial. Put the owner's reason in `why` when he gave one.
   - `remake`: edit the trial and ask again.
5. Close the ask once its answers are in the source.

## A recorded sound

A real recording can replace a generated sound when its licence lets the repo hold it: CC0, or CC BY 3.0 or 4.0 (the owner's rule, 2026-10-16). Openverse finds them (`api.openverse.org`, no account; the Freesound HQ preview at the result's `url`, `-hq.ogg` in place of `-hq.mp3` where it is reachable).

1. Declare it `kind: 'recorded'` with its `licence`: `id`, `author` and `source` (the recording's https page); a CC BY one also `title`, `authorUrl` (an https page) and `changed` (`true` once it is cut or trimmed). Give its `openverse` id when Openverse found it. Give it `secs` (a bed `BED_SECS`) so a recording with no cut is cut to its length.
2. Run `bun run sfx import <file> <name> [--from s --to s]` (in `apps/animations`). It folds to mono, cuts, trims a one-shot's quiet ends, scales a recording that peaks over -1 dBFS down to it, and prints the cut, the gain and the share under 30 Hz (no filter: judge it by ear and by `sfx compare`). The FLAC lands under the committed `public/<name>/`; the lock records the cut, clipped to the recording, and keeps the sound's generated takes as candidates, its history.
3. Run `bun run sfx check` (a bed's seam is `LoopSeam`; a CC BY file cut or trimmed under `changed: false` is `ChangeUnsaid`), and `bun run check <film> --static` for each film that places a CC BY recording: its `credits.ts` passes `soundCredits(library, sound)` to `creditRoll`, or the check fails `SoundCreditMissing`. A whole-film render writes the line with its pages linked into `<video>.description.txt`.

## Gotchas

- **A trial plays nowhere until it is chosen.** A film names the sound; the swap is the entry's change to `kind: 'code'`, never a second name.
- **What plays now must be in hand.** `sfx compare` and `sfx ab` read the kept takes' files: run `bun run sfx pull` first. A sound with no kept take fails `SoundUnmade`. `sfx compare` refuses a sound with no trial (`CodeTrialMissing`); `sfx ab` writes only its `now` clip.
- **One stream name, one node.** Name a stream for the part it draws (`crack`, `body`), never for its node kind, so two noises never share one.
- **A low drone draws a comb.** The waveform panel draws each column's least and greatest sample, so a wave whose cycle spans about two columns (a D2 drone over 8 s) draws a comb. That is the data, not a fault.
- **An ab clip of a bed has no loop line.** It plays 8 s of each render; the seam is `sfx check`'s.
- **Shape, then filter.** A fast attack spreads power toward 0 Hz, which the loudness never hears and the headroom pays for. A filter after the envelope takes it off; one before the envelope cannot. So `burst` filters its struck noise, and a struck pitch carries a highpass under it: `thump` an octave under, `knock` two.
- **Speed is measured, never gated.** Each family renders a second of sound in under 20 ms, a tone at the app's settings and a one-shot one second long: `bun run test:perf` in `packages/film` (`packages/film/test/perf/presets.perf.test.ts`) logs each. A CI runner runs the film's CPU tests 17 to 35 times slower than the laptop, so no gate test times a render.
