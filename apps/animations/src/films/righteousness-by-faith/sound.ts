// The film's beds and effects. No score yet: the landing (`name`'s held
// breath, `thesis`) and the credits (`end`) are left for it, so they stay
// quiet until it is made.
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
// where the picture has a real place to hear. Not placed yet (low confidence
// in the p4-sfx audition, `montages/sfx/index.md`), each waiting on a new
// prompt or a CC0 recording:
//   TODO tape.measure: `word`'s tape drop (every take is a steel tape).
//   TODO crowd.swell: `message`'s crowd turning on `answer` (no murmur-then-rise).
//   TODO needle.thread: `mirror`'s sewing on `fig` (no take has two stitches).
//   TODO amb.court: the courts of `woman`, `accuser` and `robe` (near-silent rumble).
//   TODO amb.town: `centurion`'s street (rumble, no town).

import type { Cue, Sound } from '@bible/film/core';

/** The paper room's level under the voice (dB). */
const PAPER = -19;
/** Every place's air under the voice (dB). */
const AIR = -20;

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
  beds: [
    // IDEA: the parchment page.
    { sound: 'room.paper', level: PAPER, from: start('cold'), to: start('mirror', 0.4) },
    { sound: 'room.paper', level: PAPER, from: mark('message', 'three'), to: start('roof', 0.4) },
    { sound: 'room.paper', level: PAPER, from: start('spoke'), to: cue('spoke', 'plunge') },
    { sound: 'room.paper', level: PAPER, from: start('look'), to: cue('look', 'toDesert') },
    { sound: 'room.paper', level: PAPER, from: cue('look', 'toIcons'), to: start('exchange', 0.4) },
    { sound: 'room.paper', level: PAPER, from: cue('robe', 'toIcons'), to: mark('daily', 'will') },

    // STORY: each place's own air.
    { sound: 'amb.garden', level: AIR, from: start('mirror'), to: mark('mirror', 'mirror') },
    { sound: 'amb.hall', level: AIR, from: cue('message', 'window'), to: mark('message', 'three') },
    { sound: 'amb.house', level: AIR, from: start('roof'), to: start('woman', 0.4) },
    { sound: 'amb.dawn', level: AIR, from: mark('spoke', 'spake'), to: start('centurion', 0.4) },
    { sound: 'amb.desert', level: AIR, from: cue('look', 'toDesert'), to: cue('look', 'toIcons') },
    { sound: 'amb.dawn', level: AIR, from: cue('exchange', 'dawn'), to: mark('exchange', 'up') },
    { sound: 'amb.dawn', level: AIR, from: mark('daily', 'will'), to: start('rain', 0.4) },
    { sound: 'amb.rain', level: AIR, from: start('rain'), to: start('name', 0.6) },

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
    evidence: { sound: 'paper.stack', at: [ends('cold', 'drop', -0.3)] },
    gavel: { sound: 'wood.gavel', at: [ends('cold', 'gavel'), ends('name', 'gavel')] },
    stamp: { sound: 'stamp.press', at: [ends('cold', 'stamp'), ends('name', 'stamp')] },
    flip: { sound: 'paper.flip', at: [cue('word', 'flip', 0.2), cue('spoke', 'bookOpen')] },
    tablets: { sound: 'tablet.set', at: [ends('word', 'drop', -0.1)] },
    tear: { sound: 'paper.tear', at: [cue('word', 'cardOut')] },
    book: { sound: 'book.close', at: [cue('within', 'book')] },

    // ── The garden ─────────────────────────────────────────────────────────
    leaves: { sound: 'leaves.rustle', at: [cue('mirror', 'leaves')] },
    scrub: { sound: 'glass.scrub', at: [cue('mirror', 'scrub')] },

    // ── The hall ───────────────────────────────────────────────────────────
    banner: { sound: 'cloth.banner', at: [mark('message', 'banner'), cue('rain', 'fly')] },
    wings: { sound: 'wings.pass', at: [cue('message', 'fly')] },

    // ── Capernaum ──────────────────────────────────────────────────────────
    tiles: { sound: 'roof.tiles', at: [cue('roof', 'tiles')] },
    rope: { sound: 'rope.creak', at: [cue('roof', 'lower')] },
    mat: { sound: 'mat.roll', at: [cue('roof', 'roll')] },
    steps: {
      sound: 'steps.dirt',
      at: [cue('roof', 'walk'), cue('woman', 'walkOut'), cue('look', 'approach')],
    },

    // ── The temple court ───────────────────────────────────────────────────
    writing: { sound: 'dust.writing', at: [cue('woman', 'writing')] },
    stones: { sound: 'stones.dust', at: [cue('woman', 'drop')] },

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
    cloth: {
      sound: 'cloth.lift',
      at: [cue('exchange', 'lift'), cue('robe', 'lift')],
    },
    stone: { sound: 'stone.roll', at: [cue('exchange', 'dawn')] },

    // ── The heavenly court ─────────────────────────────────────────────────
    stain: { sound: 'stain.hiss', at: [cue('accuser', 'flare')] },
    loom: { sound: 'loom.weave', at: [cue('robe', 'weave')] },
    settle: { sound: 'cloth.settle', at: [cue('robe', 'settle')] },
    hall: { sound: 'steps.stone', at: [cue('accuser', 'enter')] },
  },
};
