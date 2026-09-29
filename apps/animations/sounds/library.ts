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
// The first library (audio-design §9): 31 generated one-shots, 9 generated
// beds, 6 procedural sounds. Prompts are concrete, close and dry: a film's cue
// places them, the mix sets their level against the voice.

import { defineLibrary } from '@bible/film/core';

/** A one-shot's prompt influence: follow the prompt closely, vary a little between candidates. */
const CLOSE = 0.5;
/** A bed's: the model's own air, a loop. */
const AIR = 0.3;
/** Every generated bed's length: long enough that its loop point is rarely heard. */
const BED_SECS = 22;

const oneShot = (prompt: string, secs: number) =>
  ({ kind: 'generated', prompt, secs, influence: CLOSE, use: 'one-shot' }) as const;

const bed = (prompt: string) =>
  ({
    kind: 'generated',
    prompt,
    secs: BED_SECS,
    influence: AIR,
    loop: true,
    use: 'bed',
    level: -30,
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
  'amb.court': bed(
    'quiet large stone courtroom interior, distant faint murmur, very soft, no clear voices, steady',
  ),
  'amb.hall': bed(
    'a crowded wooden meeting hall in 1888, a low murmuring audience, benches creaking, no clear words',
  ),
  'amb.house': bed(
    'a small packed house, many people close together, soft shuffling and low murmur, no clear words',
  ),
  'amb.town': bed(
    'a quiet ancient town street by day, distant voices, far footsteps, a cart far away, no clear words',
  ),
  'amb.garden': bed('a still garden, soft breeze in leaves, a few distant birds, gentle and calm'),
  'amb.desert': bed('open desert, dry wind over sand, empty and wide, no birds'),
  'amb.roof': bed('rooftop wind over a sleeping city at night, faint distant town sounds, soft'),
  'amb.dawn': bed('early dawn outdoors, first quiet birdsong, cool still air, very calm'),
  'amb.rain': bed('steady soft rain on a tiled roof and ground, even, no thunder'),

  // One-shots --------------------------------------------------------------
  'paper.stack': oneShot(
    'a stack of paper documents dropped flat onto a wooden desk, close, dry',
    1.5,
  ),
  'wood.gavel': {
    ...oneShot('a single wooden gavel strike on a sound block, close, short room, one hit', 1.2),
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
  'crowd.swell': oneShot('a crowd in a hall murmuring then rising in surprise, no clear words', 3),
  'roof.tiles': oneShot(
    'clay roof tiles lifted and scraped aside, a few pieces clinking, outdoors',
    1.5,
  ),
  'wings.pass': oneShot('a single bird flying past close, wing flaps, no calls', 1.5),
  'cloth.banner': oneShot('a cloth banner unfurling and snapping once in the wind', 1.5),
  'rope.creak': oneShot('thick rope creaking under weight as something is lowered, slow', 2),
  'mat.roll': oneShot('a woven reed sleeping mat rolled up and tied, close, soft', 1.5),
  'steps.dirt': oneShot('a few slow footsteps in sandals on a dirt path, outdoors, close', 2.5),
  'dust.writing': oneShot('a finger writing slowly in dust on a stone floor, soft scratching', 2),
  'stones.dust': oneShot(
    'a few stones dropped one by one into dust on the ground, dull thuds',
    1.5,
  ),
  'tape.measure': oneShot('a cloth measuring tape pulled out and let go, soft flutter', 1.5),
  'tablet.set': oneShot('a heavy stone tablet set down on stone, one low knock, close', 1),
  'needle.thread': oneShot(
    'a needle pulling thread through thick cloth, two slow stitches, close',
    1.5,
  ),
  'leaves.rustle': oneShot('a handful of fig leaves rustling as they are gathered, close', 2),
  'glass.scrub': oneShot('a cloth scrubbing a mirror in small circles, squeaky, close', 1.5),
  'paper.tear': oneShot('a sheet of paper torn in one quick rip, close, dry', 1),
  'paper.whoosh': oneShot(
    'a paper cutout swept quickly through the air past the listener, soft whoosh',
    1,
  ),
  'cloth.lift': oneShot(
    'a heavy linen robe lifted from a surface, soft cloth movement, close',
    1.2,
  ),
  'stone.roll': oneShot(
    'a large round stone rolled slowly aside in a stone groove, deep rumble',
    3,
  ),
  'stain.hiss': oneShot('a dark stain spreading with a faint burning hiss, subtle, close', 1.5),
  'steps.stone': oneShot(
    'slow heavy footsteps on a stone floor in a large room, echoing softly',
    2.5,
  ),
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

/** Where the private `files/` are kept off the repo. */
export const store = {
  folder: '~/film-media/sounds',
  remote: {
    todo: "the owner's choice (audio-design §8): a private Git repo such as cevr/bible-sounds, or a private R2 bucket keyed by sha256",
  },
};
