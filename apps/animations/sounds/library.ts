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
// sound is CC0 or CC BY, under `public/` (`sfx import`), its licence naming
// its title, author and page: a CC BY one owes a credit line on the roll of
// every film that places it, which `film check` holds the film to. A
// recording's fit (`sfx fit`, `fits/<name>.json`) is its code trial; one the
// owner kept is the entry's code (`keptFit`, imported from its file), which
// keeps the recording's licence, so a CC BY one owes the same line.
//
// The library: 19 generated one-shots, 3 generated beds, 13 code one-shots
// (one kept from a fit), 7 code beds (three kept from fits), 3 recorded
// one-shots and 1 recorded bed. The lock keeps a
// recorded sound's generated takes, if it had any, as candidates, never
// offered again, and the seconds its file was cut from. Prompts are concrete, close and dry: a
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
  keptFit,
  knock,
  notes,
  rain,
  room,
  scatter,
  sizzle,
  thump,
  whoosh,
} from '@bible/film/core';
import dawnFit from './fits/amb.dawn.json' with { type: 'json' };
import hallFit from './fits/amb.hall.json' with { type: 'json' };
import houseFit from './fits/amb.house.json' with { type: 'json' };
import clothFit from './fits/cloth.lift.json' with { type: 'json' };

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

/** A recorded sound's licence, as `defineLibrary` reads it. */
type RecordedLicence = Extract<Entries[keyof Entries], { readonly kind: 'recorded' }>['licence'];

/** A recording cut to a bed (`sfx import`): `BED_SECS` at its smallest loop seam, at every bed's level. */
const recordedBed = (licence: RecordedLicence) =>
  ({ kind: 'recorded', licence, use: 'bed', secs: BED_SECS, level: BED_LEVEL }) as const;

/** A recording cut to a one-shot of `secs` round its loudest moment (`sfx import`). */
const recordedOneShot = (secs: number, licence: RecordedLicence) =>
  ({ kind: 'recorded', licence, use: 'one-shot', secs }) as const;

/** The licence code kept from a recording's fit keeps: the recording's, a CC BY one `changed`. */
type KeptLicence = NonNullable<
  Extract<Entries[keyof Entries], { readonly kind: 'code' }>['licence']
>;

/** A fit file's code and seeds, as `keptFit` reads it. */
type KeptFit = ReturnType<typeof keptFit>;

/** A recording's fit the owner kept (`keptFit`), as a bed: its code and seeds, the recording's licence, every bed's level. */
const keptBed = (fit: KeptFit, licence: KeptLicence) =>
  ({ kind: 'code', ...fit, licence, use: 'bed', level: BED_LEVEL }) as const;

/** A recording's fit the owner kept (`keptFit`), as a one-shot: its code and seeds, the recording's licence. */
const keptOneShot = (fit: KeptFit, licence: KeptLicence) =>
  ({ kind: 'code', ...fit, licence, use: 'one-shot' }) as const;

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
  // An audience murmuring in a hall: the code kept from the fit of a cut of
  // the recording's HQ preview.
  'amb.hall': keptBed(keptFit(hallFit), {
    id: 'CC-BY-4.0',
    title: 'M Murmer long loop.wav',
    author: 'Processaurus',
    authorUrl: 'https://freesound.org/people/Processaurus',
    source: 'https://freesound.org/people/Processaurus/sounds/440098',
    openverse: 'f7e999a4-bb3d-4dae-9e77-8a53a9d27e48',
    changed: true,
  }),
  // People murmuring close together indoors: the code kept from the fit of a
  // cut of the recording's HQ preview.
  'amb.house': keptBed(keptFit(houseFit), {
    id: 'CC0-1.0',
    title: 'G28-10-Indoor Crowd Murmur - Constant.wav',
    author: 'craigsmith',
    authorUrl: 'https://freesound.org/people/craigsmith',
    source: 'https://freesound.org/people/craigsmith/sounds/438369',
    openverse: '9783c4b5-b89a-4cc8-ab1f-b8dc4f6259d3',
    changed: true,
  }),
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
  // A city's hum at night, cut from the recording's HQ preview.
  'amb.roof': recordedBed({
    id: 'CC-BY-4.0',
    title: 'city night hum 04 160927_0989.wav',
    author: 'klankbeeld',
    authorUrl: 'https://freesound.org/people/klankbeeld',
    source: 'https://freesound.org/people/klankbeeld/sounds/440621',
    openverse: '3bdb3b4b-c840-4fba-8033-48477bf14dee',
    changed: true,
  }),
  // Birds singing at dawn: the code kept from the fit of a cut of the
  // recording's HQ preview.
  'amb.dawn': keptBed(keptFit(dawnFit), {
    id: 'CC0-1.0',
    title: 'dawn chorus.wav',
    author: 'squashy555',
    authorUrl: 'https://freesound.org/people/squashy555',
    source: 'https://freesound.org/people/squashy555/sounds/269244',
    openverse: '1a9c8792-3710-46c8-ae7c-6a0551d7f9a5',
    changed: true,
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
  // A pigeon's wings flapping once, from the recording's HQ preview.
  'wings.pass': recordedOneShot(1.5, {
    id: 'CC0-1.0',
    title: 'short pigeon wing flap',
    author: 'zouzmusic',
    authorUrl: 'https://freesound.org/people/zouzmusic',
    source: 'https://freesound.org/people/zouzmusic/sounds/414671',
    openverse: 'cc46e8c4-cdd8-4927-9296-f5454a42b188',
    changed: true,
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
  // A needle through fabric and the thread pulled, cut from the recording's HQ
  // preview.
  'needle.thread': recordedOneShot(2, {
    id: 'CC0-1.0',
    title: 'Sewing/stitching up some fabric',
    author: 'pfranzen',
    authorUrl: 'https://freesound.org/people/pfranzen',
    source: 'https://freesound.org/people/pfranzen/sounds/188178',
    openverse: '4afaf220-c6f2-45ec-8ad0-2e92cce81db2',
    changed: true,
  }),
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
  // Clothing moved once: the code kept from the fit of a cut of the
  // recording's HQ preview.
  'cloth.lift': keptOneShot(keptFit(clothFit), {
    id: 'CC0-1.0',
    title: 'clothing movement',
    author: 'Kodack',
    authorUrl: 'https://freesound.org/people/Kodack',
    source: 'https://freesound.org/people/Kodack/sounds/256310',
    openverse: '8b10b111-9719-47fe-8cd5-be53fb96db26',
    changed: true,
  }),
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
  // steps. Two steps, cut from the recording's HQ preview.
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
  // Up evenly over 0.4 s, held to 1.3 s, then falling evenly in dB to its
  // end, as the take swells, holds and dies away: no single hit. A low
  // breath behind it, as the take has.
  'snake.hiss': {
    kind: 'code',
    sound: {
      play: hiss({ hz: 8500, q: 1.2, top: 11000, breath: -24, rise: 0.4, hold: 1.3, secs: 2 }),
    },
    variants: 3,
    use: 'one-shot',
  },
  'pole.creak': oneShot('a tall wooden pole raised upright and creaking as it settles', 2, {
    why: 'Generated until a code version is tried: a creak is a stick-slip texture code may make.',
  }),
  // The cover's thump and the table's low one under it, the air pushed out
  // in a dark puff, the leather's slap and the pages' breath, in a small
  // room: the take's balance, without the rumble under 30 Hz it carries.
  // The room dies away for half a second, to about 65 dB under the peak,
  // where the take ends.
  'book.close': {
    kind: 'code',
    sound: {
      play: {
        _tag: 'Reverb',
        size: 0.5,
        damp: 3000,
        wet: 0.2,
        tail: 0.5,
        of: {
          _tag: 'Layer',
          of: [
            { node: thump({ hz: 120, octaves: 1, drop: 0.02, decay: 0.25 }), at: 0.015 },
            { node: thump({ hz: 36, octaves: 1, drop: 0.03, decay: 0.45 }), at: 0.015, db: -15 },
            {
              node: burst({ color: 'pink', low: 200, high: 600, attack: 0.002, decay: 0.12 }),
              at: 0.015,
              db: -6,
            },
            {
              node: burst({ color: 'pink', low: 1100, high: 2400, attack: 0.001, decay: 0.04 }),
              at: 0.015,
              db: -3,
            },
            {
              node: burst({ color: 'white', low: 3000, high: 12000, attack: 0.002, decay: 0.08 }),
              at: 0.015,
              db: -14,
            },
          ],
        },
      },
    },
    variants: 3,
    use: 'one-shot',
  },
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
