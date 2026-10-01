// This app's sound library: every sound a film may name (`sound.ts` beds and
// effects), shared by all its films. `bun run sfx …` makes, curates, checks
// and syncs it; the tools write `library.lock.json`, nobody edits it.
//
// Generated sounds (ElevenLabs) may never sit in this public repo: their files
// live in the git-ignored `files/` and sync with the store below
// (`sfx pull`/`push`); the pre-commit guard refuses them. Procedural sounds are
// recipes, played from their seeds whenever they are needed. A recorded sound
// is CC0 only, under `public/` (`sfx import`).
//
// The first library (audio-design §9): 30 generated one-shots, 9 generated
// beds, 1 recorded one-shot, 6 procedural sounds. Prompts are concrete, close and dry: a film's cue
// places them, the mix sets their level against the voice. How to word a prompt
// and pick its settings, from the trials in sounds/PROMPTING.md.
//
// Influence and candidate count follow the framework's defaults by use
// (one-shot 0.7 × 6, bed 0.3 × 3); a sound names its own only where a trial
// heard better.

import { defineLibrary, defineStore } from '@bible/film/core';

/** Every generated bed's length: long enough that its loop point is rarely heard. */
const BED_SECS = 22;

/** A setting a trial heard better than the default; absent, the default holds. */
interface Tuned {
  readonly influence?: number;
  readonly secs?: number;
}

const oneShot = (prompt: string, secs: number, tuned: Tuned = {}) =>
  ({ kind: 'generated', prompt, secs, use: 'one-shot', ...tuned }) as const;

const bed = (prompt: string, tuned: Tuned = {}) =>
  ({
    kind: 'generated',
    prompt,
    secs: BED_SECS,
    loop: true,
    use: 'bed',
    level: -30,
    ...tuned,
  }) as const;

export const library = defineLibrary({
  // Beds -------------------------------------------------------------------
  'room.paper': {
    kind: 'procedural',
    recipe: { recipe: 'room', secs: 8 },
    variants: 1,
    use: 'bed',
    level: -36,
    duck: false,
  },
  'tone.low': {
    kind: 'procedural',
    recipe: { recipe: 'drone', root: 'D2', secs: 8 },
    variants: 1,
    use: 'bed',
    level: -24,
    duck: false,
  },
  // From the trials: "quiet … faint … very soft" gave near-silent room tone.
  // The model hears a crowd when the crowd is the subject and the room its
  // colour; at 0.6 a crowd holds steady enough to loop.
  'amb.court': bed(
    'murmur of a crowd of people waiting in a large stone hall, many indistinct voices at a distance, soft echo, steady',
    { influence: 0.6 },
  ),
  'amb.hall': bed(
    'a crowded wooden meeting hall in 1888, a low murmuring audience, benches creaking, no clear words',
    { influence: 0.6 },
  ),
  'amb.house': bed(
    'a small packed house, many people close together, soft shuffling and low murmur, no clear words',
    { influence: 0.6 },
  ),
  // From the trials: "quiet … far away" gave low rumble. Voices first.
  'amb.town': bed(
    'people talking in a busy village market street heard from across the square, many indistinct voices, footsteps, a donkey cart, daytime, steady',
    { influence: 0.6 },
  ),
  // From the trials: birds named first and close; "leaves rustling" alone
  // turned to wind boom.
  'amb.garden': bed('songbirds chirping in a garden, light leaf rustle, crisp, close', {
    influence: 0.6,
  }),
  // From the trials: an even, constant wind loops; "wide" and "empty" gave
  // gusts, and 30 s evens the level out between the ends.
  'amb.desert': bed('a soft steady wind blowing over sand, constant and even, no gusts, dry', {
    secs: 30,
  }),
  'amb.roof': bed('rooftop wind over a sleeping city at night, faint distant town sounds, soft'),
  // From the trials: "first quiet birdsong … still air" came in gaps and failed
  // the seam; ask for song that never stops.
  'amb.dawn': bed('early morning birdsong in the distance, soft and continuous, even, calm', {
    influence: 0.6,
  }),
  'amb.rain': bed('steady soft rain on a tiled roof and ground, even, no thunder'),

  // One-shots --------------------------------------------------------------
  'paper.stack': oneShot(
    'a stack of paper documents dropped flat onto a wooden desk, close, dry',
    1.5,
  ),
  // From the trials: "sound block … short room" came out at −41 to −56 LUFS,
  // starting on its peak. At 0.9 the knock is loud and clean; padded to 1.6 s
  // it lands 20–30 ms in instead of on sample 0.
  'wood.gavel': {
    ...oneShot(
      'a judge bangs a wooden gavel once on a hardwood block, loud sharp knock, close, dry',
      1.6,
      { influence: 0.9 },
    ),
    level: -8,
  },
  'stamp.press': oneShot(
    'a rubber stamp pressed hard onto paper on a wooden desk, one thump, close',
    1,
  ),
  'paper.slide': oneShot(
    'a sheet of thick paper sliding across a wooden desk, soft and short, close, dry room',
    1,
  ),
  'paper.flip': oneShot('a single page flipped over quickly, crisp paper, close', 0.8),
  // From the trials: "murmuring then rising in surprise" gave a dense wall; one
  // shape the model holds is a murmur that grows.
  'crowd.swell': oneShot(
    'a crowd murmur growing louder, many people talking at once indoors, rising excitement, no clear words',
    3,
    { influence: 0.5 },
  ),
  'roof.tiles': oneShot(
    'clay roof tiles lifted and scraped aside, a few pieces clinking, outdoors',
    1.5,
  ),
  'wings.pass': oneShot('a single bird flying past close, wing flaps, no calls', 1.5),
  // From the trials: "unfurling … in the wind" was sub-30 Hz rumble at
  // every influence; a flag's flutter named as crisp fabric has none.
  'cloth.banner': oneShot(
    'a cloth flag flapping and snapping once, crisp fabric flutter, close, dry',
    1.5,
  ),
  // From the trials: "as something is lowered" gave a thin ratchet; the
  // load and one long creak give a fuller one.
  'rope.creak': oneShot(
    'a thick hemp rope stretching under a heavy load, one slow long creak, close, dry',
    2,
  ),
  // From the trials: "soft" made the quietest family; name the crackle. Held
  // to 1.2 s the rustle is dense.
  'mat.roll': oneShot(
    'a dry straw mat rolled up on a wooden floor, reeds crackling and rustling, close',
    1.2,
    { influence: 0.5 },
  ),
  'steps.dirt': oneShot('a few slow footsteps in sandals on a dirt path, outdoors, close', 2.5),
  'dust.writing': oneShot('a finger writing slowly in dust on a stone floor, soft scratching', 2),
  'stones.dust': oneShot(
    'a few stones dropped one by one into dust on the ground, dull thuds',
    1.5,
  ),
  // From the trials: "measuring tape" is a steel tape to the model, whatever the
  // cloth; describe the ribbon, not the tool. At 1.5 s it ticked; held to
  // 0.8 s it is a cloth swish.
  'tape.measure': oneShot(
    'a long soft fabric ribbon pulled quickly through fingers and flicked straight, light cloth flutter, close, dry',
    0.8,
    { influence: 0.5 },
  ),
  'tablet.set': oneShot('a heavy stone tablet set down on stone, one low knock, close', 1),
  // From the trials: a count in the prompt is not heard; give each stitch its
  // sound and room. "needle and thread" alone is a sewing machine; at 0.9 the
  // described action gives two punches.
  'needle.thread': oneShot(
    'hand sewing thick canvas, a needle punches through and the thread is pulled tight, twice, close, dry, quiet room',
    2,
    { influence: 0.9 },
  ),
  'leaves.rustle': oneShot('a handful of fig leaves rustling as they are gathered, close', 2),
  'glass.scrub': oneShot('a cloth scrubbing a mirror in small circles, squeaky, close', 1.5),
  'paper.tear': oneShot('a sheet of paper torn in one quick rip, close, dry', 1),
  'paper.whoosh': oneShot(
    'a paper cutout swept quickly through the air past the listener, soft whoosh',
    1,
  ),
  // Every take (three prompts, influence 0.5 and 0.7) is a low thud under the
  // cloth; at 0.5 one came with the least of it.
  'cloth.lift': oneShot(
    'a heavy linen robe lifted from a surface, soft cloth movement, close',
    1.2,
    { influence: 0.5 },
  ),
  'stone.roll': oneShot(
    'a large round stone rolled slowly aside in a stone groove, deep rumble',
    3,
  ),
  // From the trials: a stain has no sound; a sizzle does. The bare noun
  // phrase is louder and dies away; "faint steady" gave a flat hiss.
  'stain.hiss': oneShot('water sizzle on hot metal', 1.5, { influence: 0.5 }),
  // Recorded: every generated take (8 over two rolls) was one boomy hit, never
  // steps. Two steps (2.25–4.75 s) of the recording's HQ preview.
  'steps.stone': {
    kind: 'recorded',
    licence: {
      id: 'CC0-1.0',
      author: 'LordFluffeh',
      source: 'https://freesound.org/people/LordFluffeh/sounds/478545/',
    },
    use: 'one-shot',
  },
  'loom.weave': oneShot('a wooden hand loom, the shuttle passed and the beater pressed twice', 2.5),
  'cloth.settle': oneShot(
    'a robe settling onto shoulders, soft cloth falling into place, close',
    1.2,
  ),
  'coins.clatter': oneShot(
    'a handful of old coins sliding and clattering onto a wooden table',
    1.5,
  ),
  'snake.hiss': oneShot('a snake hissing low in the sand, close, dry', 2),
  'pole.creak': oneShot('a tall wooden pole raised upright and creaking as it settles', 2),
  'book.close': oneShot('an old leather-bound book closed firmly, one soft thump, close', 1),
  'tone.drain': {
    kind: 'procedural',
    recipe: { recipe: 'drain', from: 'D4', to: 'A2', secs: 1.5 },
    variants: 1,
    use: 'one-shot',
    level: -16,
  },
  'tone.chime': {
    kind: 'procedural',
    recipe: { recipe: 'bell', root: 'D5', partials: 'glass', secs: 1.5 },
    variants: 5,
    use: 'one-shot',
    level: -18,
  },
  'tone.bloom': {
    kind: 'procedural',
    recipe: { recipe: 'bloom', root: 'D4', secs: 2.5 },
    variants: 2,
    use: 'one-shot',
    level: -16,
  },
  'tone.notes': {
    kind: 'procedural',
    recipe: { recipe: 'notes', root: 'D5', count: 4, secs: 1.5 },
    variants: 3,
    use: 'one-shot',
    level: -16,
  },
});

/**
 * Where the private media is kept off the repo: the library's `files/`, the
 * films' scores (`scores/<film>/`) and review renders (`renders/`). Never a
 * folder under `~/film-media`: the renders index (`film-media`, run every
 * minute) deletes every file there it did not mirror itself, and it emptied
 * the first library's store that way.
 *
 * The owner chose a private R2 bucket (`film-store`, declared in
 * `../alchemy.run.ts`). Until it is deployed this stays the folder; the move
 * is this line becoming `defineStore({ kind: 'r2', bucket: 'film-store' })`,
 * then `bun run store:keys` and `bun run sfx push --from ~/film-sounds`
 * (README, "The private store").
 */
export const store = defineStore({ kind: 'folder', folder: '~/film-sounds' });
