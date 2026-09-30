// The film's score, beds and effects.
//
// The score: three options, one film in three musical languages, all warm and
// hopeful, never cinematic-epic: `piano` (felt piano and soft strings),
// `ensemble` (a warm acoustic chamber group) and `ambient` (pads with a
// four-note motif). They share one set of acts, so each turns where the film
// does: the courtroom's question, the title's first statement of the theme,
// the law's measure and our coming up short (a bass pedal swells), 1888's
// message rising, the gifts shown, faith from the word, forgiveness (the low
// end thins), the exchange and the accuser (the climax: the bass pedal at its
// loudest, dark, then dawn), the robe, power, the name, and the landing
// lifting (`thesis`, music alone) into the credits. The generated music
// carries little under 70 Hz on its own, so the swells are asked for by
// instrument (bowed basses, a pedal tone, a soft timpani roll), not by band.
// The mix holds the score about 18.5 dB under the voice wherever anyone
// speaks and lets it rise to about 6 dB under where no one does (the title
// card, the landing, the credits).
//
// Beds sit 17–20 dB under the voice. The parchment (IDEA) has one bed, the
// paper room (`room.paper`); each STORY place has its own air from the
// library. The procedural tones carry the film's one grammar:
//   - a chime each time an icon lights on the row (the library's five
//     variants rotate, so no two lightings in a row ring the same);
//   - a low drone under `exchange`'s one black moment;
//   - a bloom where righteousness is made (`declared`'s `made`) and where
//     it lands true (`name`'s `true`);
//   - a drain as the cold open's stamp drains to a hollow outline.
//
// Generated sounds: everything the picture does by hand (paper, wood, cloth,
// stone, steps) is a one-shot on the cue that draws it; a bed is placed only
// where the picture has a real place to hear: the court's air under both
// courts (`woman`'s temple court, and `accuser` into `robe`'s heavenly one),
// the town's under `centurion` until its row.

import type { Act, Cue, Music, Sound } from '@bible/film/core';

/**
 * The score's acts, one per turn of the film (each 3–120 s, from its scene to
 * the next act's). Styles here are the mood and shape; each option brings its
 * own instruments.
 */
const acts: ReadonlyArray<Act> = [
  {
    from: 'cold',
    name: 'The courtroom',
    styles: ['sparse', 'quiet suspense', 'questioning', 'unresolved', 'soft pulse'],
  },
  {
    from: 'title',
    name: 'The theme, then the measure',
    styles: [
      'begins at once, full and warm: the main theme stated clearly in the first three seconds',
      'then sinks lower and more searching',
      'slow build in the low register',
    ],
  },
  {
    from: 'mirror',
    name: 'Coming up short',
    styles: [
      'heavy',
      'a deep bass pedal tone swelling slowly louder under everything',
      'bowed double basses on the lowest notes',
      'soft low timpani roll',
      'minor',
      'weary',
      'restrained',
    ],
  },
  {
    from: 'message',
    name: 'The message of 1888',
    styles: ['hope dawning', 'gentle forward motion', 'rising', 'major key'],
  },
  {
    from: 'roof',
    name: 'The gifts shown',
    styles: ['warm', 'narrative', 'tender', 'unhurried', 'gentle movement'],
  },
  {
    from: 'spoke',
    name: 'Faith from the word',
    styles: ['light breaking', 'wonder', 'growing', 'hopeful', 'steady'],
  },
  {
    from: 'declared',
    name: 'Forgiveness',
    styles: ['tender', 'intimate', 'grace', 'soft resolution', 'light, no bass'],
  },
  {
    from: 'exchange',
    name: 'The exchange',
    styles: [
      'grief',
      'the climax',
      'a deep bass pedal tone swelling to its loudest under everything',
      'bowed double basses on the lowest notes',
      'soft low timpani roll',
      'darkness and stillness',
      'then light breaking through, slowly',
    ],
  },
  {
    from: 'accuser',
    name: 'The accuser silenced',
    styles: ['tension resolving', 'low strings easing', 'quiet strength', 'warming'],
  },
  {
    from: 'robe',
    name: 'The robe',
    styles: ['warm', 'woven', 'gentle lift', 'gratitude', 'light, little bass'],
  },
  {
    from: 'within',
    name: 'Power within',
    styles: ['steady walking pulse', 'renewal', 'quiet confidence', 'gentle rain'],
  },
  {
    from: 'name',
    name: 'The name',
    styles: ['gathering', 'resolute', 'building gently toward a lift'],
  },
  {
    from: 'thesis',
    name: 'The Lord our righteousness',
    styles: [
      'the landing',
      'the main theme returns in full',
      'lifts',
      'luminous',
      'joyful',
      'warm',
    ],
  },
  {
    from: 'end',
    name: 'Credits',
    styles: ['peaceful', 'the theme once more, softly', 'settling', 'ending on a resolved chord'],
  },
];

/** What no option may do: sing, speak, or turn into a trailer. */
const avoid = [
  'vocals',
  'choir',
  'lyrics',
  'spoken word',
  'epic trailer',
  'cinematic braams',
  'heavy drums',
  'EDM',
  'distortion',
];

const option = (styles: ReadonlyArray<string>, extra: ReadonlyArray<string> = []): Music => ({
  model: 'music_v2_5',
  styles: ['instrumental', 'film score', 'warm', 'hopeful', ...styles],
  avoid: [...avoid, ...extra],
  acts,
});

/**
 * The paper room's level (dB against the voice). Room tone is broadband and
 * never ducks, so it reads louder than its loudness says: −25 measures about
 * 19 dB under the voice while it speaks.
 */
const PAPER = -25;

const cue = (scene: string, name: string, offset = 0): Cue => ({ scene, cue: name, offset });
const ends = (scene: string, name: string, offset = 0): Cue => ({
  scene,
  cue: name,
  edge: 'end',
  offset,
});
const mark = (scene: string, name: string, offset = 0): Cue => ({ scene, mark: name, offset });
const start = (scene: string, offset = 0): Cue => ({ scene, offset });

export const sound: Sound = {
  score: {
    play: 'piano',
    // Integrated against the voice bus. Measured while the voice speaks (400 ms
    // windows), −18.5 here played about 17.4 dB under; −19.5 plays about 18.4.
    under: -19.5,
    alone: -6,
    options: {
      piano: option(
        ['felt piano', 'soft string ensemble', 'intimate', 'slow tempo', 'gentle suspensions'],
        ['synth', 'electronic beats'],
      ),
      ensemble: option(
        [
          'warm acoustic chamber ensemble',
          'nylon-string guitar',
          'cello',
          'clarinet',
          'upright bass',
          'soft hand percussion',
          'folk',
        ],
        ['electric guitar', 'synth'],
      ),
      ambient: option(
        [
          'ambient',
          'warm evolving pads',
          'a simple recurring four-note motif on celesta and soft Rhodes',
          'slow',
          'spacious',
        ],
        ['beats', 'drums'],
      ),
    },
  },
  beds: [
    // IDEA: the parchment page.
    { sound: 'room.paper', level: PAPER, from: start('cold'), to: start('mirror', 0.4) },
    { sound: 'room.paper', level: PAPER, from: mark('message', 'three'), to: start('roof', 0.4) },
    { sound: 'room.paper', level: PAPER, from: cue('woman', 'toIdea'), to: cue('spoke', 'plunge') },
    {
      sound: 'room.paper',
      level: PAPER,
      from: cue('centurion', 'toIcons'),
      to: cue('look', 'toDesert'),
    },
    { sound: 'room.paper', level: PAPER, from: cue('look', 'toIcons'), to: start('exchange', 0.4) },
    { sound: 'room.paper', level: PAPER, from: cue('robe', 'toIcons'), to: mark('daily', 'will') },

    // STORY: each place's own air. Each level is set so the bed measures
    // about 19 dB under the voice while it speaks (the stems, 400 ms windows,
    // ducked as the mix plays it): a sparse take (the garden's birds, the
    // dawn's) sits higher than a dense one (a crowd).
    { sound: 'amb.garden', level: -6, from: start('mirror'), to: mark('mirror', 'mirror') },
    { sound: 'amb.hall', level: -17, from: cue('message', 'window'), to: mark('message', 'three') },
    { sound: 'amb.house', level: -15, from: start('roof'), to: start('woman', 0.4) },
    { sound: 'amb.court', level: -16, from: start('woman'), to: cue('woman', 'toIdea') },
    { sound: 'amb.dawn', level: -3, from: mark('spoke', 'spake'), to: start('centurion', 0.4) },
    { sound: 'amb.town', level: -15, from: start('centurion'), to: cue('centurion', 'toIcons') },
    { sound: 'amb.desert', level: -15, from: cue('look', 'toDesert'), to: cue('look', 'toIcons') },
    { sound: 'amb.dawn', level: -16, from: cue('exchange', 'dawn'), to: mark('exchange', 'up') },
    { sound: 'amb.court', level: -17, from: start('accuser'), to: cue('robe', 'toIcons') },
    { sound: 'amb.dawn', level: -8, from: mark('daily', 'will'), to: start('rain', 0.4) },
    { sound: 'amb.rain', level: -12, from: start('rain'), to: start('name', 0.6) },

    // The one black moment: the drone under the silhouette, until dawn.
    { sound: 'tone.low', level: -22, from: cue('exchange', 'dark'), to: cue('exchange', 'dawn') },
  ],
  effects: {
    // ── The tones ──────────────────────────────────────────────────────────
    lit: {
      sound: 'tone.chime',
      at: [
        cue('message', 'faith'),
        cue('message', 'forgiveness'),
        cue('message', 'power'),
        cue('roof', 'oneLit'),
        cue('roof', 'twoLit'),
        cue('roof', 'threeLit'),
        cue('woman', 'oneLit'),
        cue('woman', 'twoLit'),
        cue('woman', 'threeLit'),
        cue('spoke', 'lead'),
        cue('centurion', 'faithLit'),
        cue('look', 'iconGlow'),
        cue('declared', 'robeLit'),
        cue('robe', 'iconGlow'),
        cue('within', 'heartLit'),
      ],
    },
    drain: { sound: 'tone.drain', at: [cue('cold', 'drain')] },
    bloom: { sound: 'tone.bloom', at: [cue('declared', 'bloom'), mark('name', 'true')] },

    // ── Paper, wood and stone on the parchment ─────────────────────────────
    // A level named here is where `check`'s EffectHot (each effect's loudest
    // 50 ms against the voice around it) found the library's too hot.
    evidence: { sound: 'paper.stack', at: [ends('cold', 'drop', -0.3)] },
    gavel: {
      sound: 'wood.gavel',
      level: -16,
      at: [ends('cold', 'gavel'), ends('name', 'gavel')],
    },
    stamp: {
      sound: 'stamp.press',
      level: -13,
      at: [ends('cold', 'stamp'), ends('name', 'stamp')],
    },
    flip: {
      sound: 'paper.flip',
      level: -14,
      at: [cue('word', 'flip', 0.2), cue('spoke', 'bookOpen')],
    },
    tablets: { sound: 'tablet.set', level: -15, at: [ends('word', 'drop', -0.1)] },
    tear: { sound: 'paper.tear', at: [cue('word', 'cardOut')] },
    tape: { sound: 'tape.measure', at: [cue('word', 'tape')] },
    book: { sound: 'book.close', level: -18, at: [cue('within', 'book')] },

    // ── The garden ─────────────────────────────────────────────────────────
    leaves: { sound: 'leaves.rustle', at: [cue('mirror', 'leaves')] },
    scrub: { sound: 'glass.scrub', at: [cue('mirror', 'scrub')] },
    needle: { sound: 'needle.thread', level: -14, at: [ends('mirror', 'toSew')] },

    // ── The hall ───────────────────────────────────────────────────────────
    banner: {
      sound: 'cloth.banner',
      level: -17,
      at: [mark('message', 'banner'), cue('rain', 'fly')],
    },
    crowd: { sound: 'crowd.swell', at: [cue('message', 'turn', -0.3)] },
    wings: { sound: 'wings.pass', level: -17, at: [cue('message', 'fly')] },

    // ── Capernaum ──────────────────────────────────────────────────────────
    tiles: { sound: 'roof.tiles', at: [cue('roof', 'tiles')] },
    rope: { sound: 'rope.creak', at: [cue('roof', 'lower')] },
    mat: { sound: 'mat.roll', at: [cue('roof', 'roll')] },
    steps: {
      sound: 'steps.dirt',
      level: -15,
      at: [cue('roof', 'walk'), cue('woman', 'walkOut'), cue('look', 'approach')],
    },

    // ── The temple court ───────────────────────────────────────────────────
    writing: { sound: 'dust.writing', at: [cue('woman', 'writing')] },
    stones: { sound: 'stones.dust', level: -13, at: [cue('woman', 'drop')] },

    // ── The word flies ─────────────────────────────────────────────────────
    whoosh: {
      sound: 'paper.whoosh',
      at: [cue('spoke', 'flight'), cue('centurion', 'fly'), cue('declared', 'speak')],
    },

    // ── The desert ─────────────────────────────────────────────────────────
    coins: { sound: 'coins.clatter', at: [cue('look', 'slide')] },
    snakes: { sound: 'snake.hiss', at: [mark('look', 'desert')] },
    pole: { sound: 'pole.creak', at: [cue('look', 'rise')] },

    // ── The cross and the tomb ─────────────────────────────────────────────
    // The lift's take opens on a soft thud 12 dB over its body (every
    // candidate made has one, 12–20 dB); held under the voice, the body
    // plays quietly under the words.
    cloth: {
      sound: 'cloth.lift',
      level: -19,
      at: [cue('exchange', 'lift'), cue('robe', 'lift')],
    },
    stone: { sound: 'stone.roll', level: -12, at: [cue('exchange', 'dawn')] },

    // ── The heavenly court ─────────────────────────────────────────────────
    stain: { sound: 'stain.hiss', at: [cue('accuser', 'flare')] },
    loom: { sound: 'loom.weave', level: -19, at: [cue('robe', 'weave')] },
    settle: { sound: 'cloth.settle', level: -19, at: [cue('robe', 'settle')] },
    hall: { sound: 'steps.stone', level: -15, at: [cue('accuser', 'enter')] },
  },
};
