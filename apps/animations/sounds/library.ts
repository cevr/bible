// This app's sound library: every sound a film may name (`sound.ts` beds and
// effects), shared by all its films. `bun run sfx …` makes, curates, checks
// and syncs it; the tools write `library.lock.json`, nobody edits it.
//
// Generated sounds (ElevenLabs) may never sit in this public repo: their files
// live in the git-ignored `files/` and sync with the store below
// (`sfx pull`/`push`). ElevenLabs makes only the realism code cannot, and
// code makes every simpler sound (the owner's rule), so each generated sound
// says `why` it is generated. A code sound is a graph of nodes, rendered
// from its seeds whenever it is needed, so nothing of it is stored; a
// generated sound's `code` is its code trial, heard beside its takes and
// placed by no film until the owner chooses it in an ask (`sfx audit`,
// `sfx render --trial --sheet`, `sfx compare`, `sfx ab`: the loop in the
// film skill's reference/sound.md). A trial is layered from the families
// `@bible/film/core` exports (a burst, a thump, a knock, a whoosh, …), each a
// shape with a few settings, so a shape is tuned in one place. A recorded
// sound is CC0 only, under `public/` (`sfx import`).
//
// The library: 24 generated one-shots, 7 generated beds, 10 code one-shots,
// 4 code beds and 1 recorded one-shot. Prompts are concrete, close and dry: a
// film's cue places them, the mix sets their level against the voice. How to
// word a prompt and pick its settings, from the trials in sounds/PROMPTING.md.
//
// Influence and candidate count follow the framework's defaults by use
// (one-shot 0.7 × 6, bed 0.3 × 3); a sound names its own only where a trial
// heard better.

import {
  bloom,
  breeze,
  burst,
  chime,
  defineLibrary,
  defineStore,
  drain,
  drone,
  hiss,
  knock,
  notes,
  rain,
  room,
  scatter,
  sizzle,
  thump,
  whoosh,
} from '@bible/film/core';

/** A bed's length when it names none: long enough that its loop point is rarely heard. */
const BED_SECS = 22;

/** Every bed's level against the voice, generated or code. */
const BED_LEVEL = -30;

/** A library's entries, as `defineLibrary` reads them. */
type Entries = Parameters<typeof defineLibrary>[0];

/** A generated sound's code trial, as `defineLibrary` reads it. */
type CodeTrial = NonNullable<
  Extract<Entries[keyof Entries], { readonly kind: 'generated' }>['code']
>;

/** A code trial of `play`, its variants seeds 1–3. */
const trial = (play: CodeTrial['sound']['play']): CodeTrial => ({ sound: { play }, variants: 3 });

/**
 * What a generated sound declares beside its prompt: why it needs
 * ElevenLabs, by name so it is never taken for the prompt, any setting a
 * trial heard better than the default (absent, the default holds), and its
 * code trial, if it has one.
 */
interface Declared {
  readonly why: string;
  readonly influence?: number;
  readonly secs?: number;
  readonly code?: CodeTrial;
}

const oneShot = (prompt: string, secs: number, declared: Declared) =>
  ({ kind: 'generated', prompt, secs, use: 'one-shot', ...declared }) as const;

const bed = (prompt: string, declared: Declared) =>
  ({
    kind: 'generated',
    prompt,
    secs: BED_SECS,
    loop: true,
    use: 'bed',
    level: BED_LEVEL,
    ...declared,
  }) as const;

export const library = defineLibrary({
  // Beds -------------------------------------------------------------------
  // The paper room's air: 8 s a loop.
  'room.paper': {
    kind: 'code',
    sound: { play: room({ secs: 8 }) },
    variants: 1,
    use: 'bed',
    level: -36,
    duck: false,
  },
  // A low D with its octave, twelfth and fifth, breathing slowly: 8 s a loop.
  'tone.low': {
    kind: 'code',
    sound: { play: drone({ root: 'D2', secs: 8 }) },
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
    {
      why: 'Many voices at a distance in a stone hall: speech, which code cannot make.',
      influence: 0.6,
    },
  ),
  'amb.hall': bed(
    'a crowded wooden meeting hall in 1888, a low murmuring audience, benches creaking, no clear words',
    {
      why: 'An audience murmuring and benches creaking: speech, which code cannot make.',
      influence: 0.6,
    },
  ),
  'amb.house': bed(
    'a small packed house, many people close together, soft shuffling and low murmur, no clear words',
    {
      why: 'People close together, shuffling and murmuring: speech, which code cannot make.',
      influence: 0.6,
    },
  ),
  // From the trials: "quiet … far away" gave low rumble. Voices first.
  'amb.town': bed(
    'people talking in a busy village market street heard from across the square, many indistinct voices, footsteps, a donkey cart, daytime, steady',
    {
      why: 'Voices, steps and a donkey cart across a market: life far off, which code cannot make.',
      influence: 0.6,
    },
  ),
  // From the trials: birds named first and close; "leaves rustling" alone
  // turned to wind boom.
  'amb.garden': bed('songbirds chirping in a garden, light leaf rustle, crisp, close', {
    why: 'Songbirds close by: birdsong, which code cannot make.',
    influence: 0.6,
  }),
  // A steady breeze over sand, 30 s a loop.
  'amb.desert': {
    kind: 'code',
    sound: { play: breeze({ secs: 30, hz: 550 }) },
    variants: 3,
    use: 'bed',
    level: BED_LEVEL,
  },
  'amb.roof': bed('rooftop wind over a sleeping city at night, faint distant town sounds, soft', {
    why: 'Faint town sounds under the wind: life far off, which code cannot make.',
  }),
  // From the trials: "first quiet birdsong … still air" came in gaps and failed
  // the seam; ask for song that never stops.
  'amb.dawn': bed('early morning birdsong in the distance, soft and continuous, even, calm', {
    why: 'Birds singing far off: birdsong, which code cannot make.',
    influence: 0.6,
  }),
  // Soft rain on the ground, ten taps a second on the roof's tiles.
  'amb.rain': {
    kind: 'code',
    sound: { play: rain({ secs: BED_SECS, hiss: 900, taps: 10 }) },
    variants: 3,
    use: 'bed',
    level: BED_LEVEL,
  },

  // One-shots --------------------------------------------------------------
  'paper.stack': oneShot(
    'a stack of paper documents dropped flat onto a wooden desk, close, dry',
    1.5,
    { why: 'A stack of sheets landing on wood: a handled texture, which code cannot make.' },
  ),
  // A wooden knock 25 ms in, over a faint thump: loud.
  'wood.gavel': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Layer',
        of: [
          { node: knock({ material: 'wood', hz: 480, secs: 0.3 }), at: 0.025 },
          { node: thump({ hz: 90, octaves: 1, drop: 0.02, decay: 0.4 }), at: 0.025, db: -16 },
        ],
      },
    },
    variants: 3,
    use: 'one-shot',
    level: -8,
  },
  // A bright crack of contact over the rubber's body, the thud faint under them.
  'stamp.press': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Layer',
        of: [
          { node: burst({ color: 'white', low: 300, high: 16000, attack: 0.0003, decay: 0.06 }) },
          {
            node: burst({ color: 'pink', low: 500, high: 2000, attack: 0.0005, decay: 0.03 }),
            db: 3,
          },
          { node: thump({ hz: 90, octaves: 0.5, drop: 0.01, decay: 0.12 }), db: -14 },
        ],
      },
    },
    variants: 3,
    use: 'one-shot',
  },
  'paper.slide': oneShot(
    'a sheet of thick paper sliding across a wooden desk, soft and short, close, dry room',
    1,
    { why: 'Thick paper sliding on wood: a handled texture, which code cannot make.' },
  ),
  'paper.flip': oneShot('a single page flipped over quickly, crisp paper, close', 0.8, {
    why: 'A crisp page flipped: a handled texture, which code cannot make.',
  }),
  // From the trials: "murmuring then rising in surprise" gave a dense wall; one
  // shape the model holds is a murmur that grows.
  'crowd.swell': oneShot(
    'a crowd murmur growing louder, many people talking at once indoors, rising excitement, no clear words',
    3,
    { why: 'A crowd talking louder and louder: speech, which code cannot make.', influence: 0.5 },
  ),
  'roof.tiles': oneShot(
    'clay roof tiles lifted and scraped aside, a few pieces clinking, outdoors',
    1.5,
    { why: 'Clay tiles scraped and clinking: a handled texture, which code cannot make.' },
  ),
  'wings.pass': oneShot('a single bird flying past close, wing flaps, no calls', 1.5, {
    why: 'A bird’s wings flapping past: a creature, which code cannot make.',
  }),
  // From the trials: "unfurling … in the wind" was sub-30 Hz rumble at
  // every influence; a flag's flutter named as crisp fabric has none.
  'cloth.banner': oneShot(
    'a cloth flag flapping and snapping once, crisp fabric flutter, close, dry',
    1.5,
    { why: 'A flag flapping and snapping: a handled texture, which code cannot make.' },
  ),
  // From the trials: "as something is lowered" gave a thin ratchet; the
  // load and one long creak give a fuller one.
  'rope.creak': oneShot(
    'a thick hemp rope stretching under a heavy load, one slow long creak, close, dry',
    2,
    {
      why: 'Generated until a code version is tried: a creak is a stick-slip texture code may make.',
    },
  ),
  // From the trials: "soft" made the quietest family; name the crackle. Held
  // to 1.2 s the rustle is dense.
  'mat.roll': oneShot(
    'a dry straw mat rolled up on a wooden floor, reeds crackling and rustling, close',
    1.2,
    {
      why: 'Reeds crackling as a mat rolls: a handled texture, which code cannot make.',
      influence: 0.5,
    },
  ),
  'steps.dirt': oneShot('a few slow footsteps in sandals on a dirt path, outdoors, close', 2.5, {
    why: 'Sandals on a dirt path: steps, which code cannot make.',
  }),
  'dust.writing': oneShot('a finger writing slowly in dust on a stone floor, soft scratching', 2, {
    why: 'A finger scratching in dust: a handled texture, which code cannot make.',
  }),
  // Four stones landing in dust one after another, each 6 dB quieter.
  'stones.dust': {
    kind: 'code',
    sound: {
      play: scatter({
        count: 4,
        first: 0.025,
        every: 0.17,
        fall: 6,
        material: 'stone',
        hz: 600,
        secs: 1,
      }),
    },
    variants: 3,
    use: 'one-shot',
  },
  // From the trials: "measuring tape" is a steel tape to the model, whatever the
  // cloth; describe the ribbon, not the tool. At 1.5 s it ticked; held to
  // 0.8 s it is a cloth swish.
  'tape.measure': oneShot(
    'a long soft fabric ribbon pulled quickly through fingers and flicked straight, light cloth flutter, close, dry',
    0.8,
    {
      why: 'A ribbon pulled through fingers: a handled texture, which code cannot make.',
      influence: 0.5,
    },
  ),
  // A low stone knock over a thump.
  'tablet.set': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Layer',
        of: [
          { node: knock({ material: 'stone', hz: 165, secs: 0.4 }) },
          { node: thump({ hz: 88, octaves: 1, drop: 0.015, decay: 0.3 }), db: -5 },
        ],
      },
    },
    variants: 3,
    use: 'one-shot',
  },
  // From the trials: a count in the prompt is not heard; give each stitch its
  // sound and room. "needle and thread" alone is a sewing machine; at 0.9 the
  // described action gives two punches.
  'needle.thread': oneShot(
    'hand sewing thick canvas, a needle punches through and the thread is pulled tight, twice, close, dry, quiet room',
    2,
    {
      why: 'A needle through canvas and thread pulled tight: a handled texture, which code cannot make.',
      influence: 0.9,
    },
  ),
  'leaves.rustle': oneShot('a handful of fig leaves rustling as they are gathered, close', 2, {
    why: 'Fig leaves gathered in a hand: a handled texture, which code cannot make.',
  }),
  'glass.scrub': oneShot('a cloth scrubbing a mirror in small circles, squeaky, close', 1.5, {
    why: 'A cloth squeaking on a mirror: a handled texture, which code cannot make.',
  }),
  'paper.tear': oneShot('a sheet of paper torn in one quick rip, close, dry', 1, {
    why: 'Paper torn in one rip: a handled texture, which code cannot make.',
  }),
  // Placed by its onset: the pass lands 0.37 s after it.
  'paper.whoosh': {
    kind: 'code',
    sound: { play: whoosh({ onset: 0.03, hit: 0.4, fall: 0.22, low: 1200, high: 6000, q: 0.5 }) },
    variants: 3,
    use: 'one-shot',
  },
  // Every take (three prompts, influence 0.5 and 0.7) is a low thud under the
  // cloth; at 0.5 one came with the least of it.
  'cloth.lift': oneShot(
    'a heavy linen robe lifted from a surface, soft cloth movement, close',
    1.2,
    { why: 'A linen robe lifted: a handled texture, which code cannot make.', influence: 0.5 },
  ),
  'stone.roll': oneShot(
    'a large round stone rolled slowly aside in a stone groove, deep rumble',
    3,
    {
      why: 'Generated until a code version is tried: a rolled stone’s rumble is a texture code may make.',
    },
  ),
  // A stain's sound is a sizzle: a flash of steam, then steam and a low boil
  // that crackle and fall away.
  'stain.hiss': {
    kind: 'code',
    sound: { play: sizzle({ flash: 0.02, crackle: 120, secs: 1.6 }) },
    variants: 3,
    use: 'one-shot',
  },
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
  'loom.weave': oneShot(
    'a wooden hand loom, the shuttle passed and the beater pressed twice',
    2.5,
    { why: 'A shuttle passed and a beater pressed: a handled texture, which code cannot make.' },
  ),
  'cloth.settle': oneShot(
    'a robe settling onto shoulders, soft cloth falling into place, close',
    1.2,
    { why: 'A robe falling into place: a handled texture, which code cannot make.' },
  ),
  'coins.clatter': oneShot(
    'a handful of old coins sliding and clattering onto a wooden table',
    1.5,
    { why: 'Coins sliding and clattering on wood: a handled texture, which code cannot make.' },
  ),
  'snake.hiss': oneShot('a snake hissing low in the sand, close, dry', 2, {
    why: 'Generated until a code version is heard beside it: a hiss is a texture code makes.',
    // Loudest from about 0.4 to 1 s, as the take is: a swell, no single hit.
    code: trial(hiss({ hz: 8500, q: 1.2, rise: 0.45, hold: 0.95, secs: 1.8 })),
  }),
  'pole.creak': oneShot('a tall wooden pole raised upright and creaking as it settles', 2, {
    why: 'Generated until a code version is tried: a creak is a stick-slip texture code may make.',
  }),
  'book.close': oneShot('an old leather-bound book closed firmly, one soft thump, close', 1, {
    why: 'Generated until a code version is heard beside it: a thump and a puff of air are shapes code makes.',
    // Two thumps, the cover's and the table's, a puff of air and a faint slap of leather.
    code: trial({
      _tag: 'Layer',
      of: [
        { node: thump({ hz: 130, octaves: 1, drop: 0.02, decay: 0.3 }), at: 0.015 },
        { node: thump({ hz: 60, octaves: 1, drop: 0.03, decay: 0.35 }), at: 0.015, db: -12 },
        {
          node: burst({ color: 'pink', low: 150, high: 1500, attack: 0.002, decay: 0.15 }),
          at: 0.015,
        },
        {
          node: burst({ color: 'white', low: 3000, high: 12000, attack: 0.002, decay: 0.08 }),
          at: 0.015,
          db: -14,
        },
      ],
    }),
  }),
  'tone.drain': {
    kind: 'code',
    sound: { play: drain({ from: 'D4', to: 'A2', secs: 1.5 }) },
    variants: 1,
    use: 'one-shot',
    level: -16,
  },
  // Variant n rings degree n − 1 of D's major pentatonic scale.
  'tone.chime': {
    kind: 'code',
    sound: { play: chime({ root: 'D5', partials: 'glass', secs: 1.5 }) },
    variants: 5,
    use: 'one-shot',
    level: -18,
  },
  'tone.bloom': {
    kind: 'code',
    sound: { play: bloom({ root: 'D4', secs: 2.5 }) },
    variants: 2,
    use: 'one-shot',
    level: -16,
  },
  'tone.notes': {
    kind: 'code',
    sound: { play: notes({ root: 'D5', count: 4, secs: 1.5 }) },
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
