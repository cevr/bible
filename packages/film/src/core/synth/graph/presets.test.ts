// The eight recipes' ports (presets.ts), proved by measure against the
// recipes themselves (recipes.ts `synthesize`) on seeds 1–5, read as `film sfx
// compare` reads a sound: the same length, integrated loudness within 1 LU,
// the band balance within 1.5 dB RMS, each recipe's notes and partials at the
// recipe's levels (Goertzel), a one-shot's hit within the sync check's 20 ms,
// and a bed's loop seam heard on no more seeds than the recipe's and never a
// click. Each port is pinned too: its first seed's samples by digest, the
// same on every render. One test a preset and a measure, each short.
//
// The families the library's code sounds are built from are pinned the same
// way, and each is heard to do what its doc says on seeds 1–3, a trial's three
// variants: a burst's power in its band, a thump and a knock with next to no
// rumble, a scatter's landings falling by its step, a whoosh's and a sizzle's
// hit where they say, a hiss held, a breeze looping unheard and a roof's taps
// in their band.

import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { Array as Arr, Result, Schema } from 'effect';
import type { Pcm } from '../../audio.ts';
import { describeSound } from '../analyse.ts';
import { HIT_MOVE, type Profile, distance, medianProfile, profileOf } from '../compare.ts';
import { type Recipe, synthesize } from '../recipes.ts';
import { resolveCode } from '../resolve.ts';
import { type SoundUse, defineLibrary } from '../../sfx.ts';
import { loopSeam, seamHeard } from '../seam.ts';
import { CodeSound, type Node } from './nodes.ts';
import type { ResolvedSound } from './plan.ts';
import {
  breeze,
  burst,
  hiss,
  knock,
  portOf,
  rain,
  scatter,
  sizzle,
  thump,
  whoosh,
} from './presets.ts';
import { renderCode } from './render.ts';

const SEEDS = [1, 2, 3, 4, 5] as const;

/**
 * Each recipe as the measures read it: short, so its test is quick, and long
 * enough that its draws even out (room's air sways at 0.2 Hz, the drone
 * breathes at 0.15 Hz and wind's whistle wanders at 0.8 Hz: shorter, five
 * seeds read a knot or two of each).
 */
const MEASURED = {
  room: { recipe: 'room', secs: 2 },
  bell: { recipe: 'bell', root: 'D5', partials: 'glass', secs: 0.6 },
  drone: { recipe: 'drone', root: 'D2', secs: 2 },
  drain: { recipe: 'drain', from: 'A4', to: 'D3', secs: 1 },
  bloom: { recipe: 'bloom', root: 'D4', secs: 1 },
  notes: { recipe: 'notes', root: 'D5', count: 3, secs: 1 },
  wind: { recipe: 'wind', secs: 3 },
  rain: { recipe: 'rain', secs: 1 },
} as const satisfies { readonly [R in Recipe['recipe']]: Extract<Recipe, { recipe: R }> };

/** How each recipe is heard: the ones made to loop are beds, read around their loop. */
const USE = {
  room: 'bed',
  bell: 'one-shot',
  drone: 'bed',
  drain: 'one-shot',
  bloom: 'one-shot',
  notes: 'one-shot',
  wind: 'one-shot',
  rain: 'bed',
} as const satisfies { readonly [R in Recipe['recipe']]: SoundUse };

/**
 * The beds as their seams are read: four seconds, so a slow sway of level
 * (the drone breathes at 0.15 Hz) is not all a seam can hear.
 */
const LOOPED: ReadonlyArray<Recipe> = [
  { recipe: 'room', secs: 4 },
  { recipe: 'drone', root: 'D2', secs: 4 },
  { recipe: 'rain', secs: 4 },
];

/** Each port's first seed at its measured settings, by the digest of its samples. */
const PINNED = {
  room: '56d2d52380c38159cddaa6e26047d2fc575370936dab386a23eb7e8e3e5a0b9d',
  bell: '7b571ea9a7078df59c03d71babe1c6099e488fff1708416d5e1e1df5dd071dbe',
  drone: '5a88d6d1c23ce6a5791d016a41316a0e76ba5c13c69b6a6965c3a3ea2ac2acb1',
  drain: '932e95671e6ac15783f49d7790459ed06f5ee8b11897506a3195fb44bfe9ebab',
  bloom: '0fbb94b9ff3e707082522dedaa5ef20367f2194f132dfb8c79564c48718f3076',
  notes: '6b0bf8a0ed51553a8aeae7cf793fd539df0b19957564fd3b00eeccf06e2d377f',
  wind: '7a099527d1fc519757cffa98e3e8cddefa88f731124cb826cfb5ec0699efd7fd',
  rain: 'd9ffe903ac19b54464f7bd0262abdbb85cbab6efa8660714a520c80c31384691',
} as const satisfies { readonly [R in Recipe['recipe']]: string };

/** A recipe's port as the library resolves it: the code trial of a procedural sound. */
const portSound = (recipe: Recipe): ResolvedSound => {
  const library = defineLibrary({
    'tone.port': { kind: 'procedural', recipe, variants: 5, use: 'one-shot' },
  });
  return Result.getOrThrow(resolveCode(library)).trials.get('tone.port')!.sound;
};

/** A recipe's renders on the seeds, and its port's. */
interface Renders {
  readonly recipe: Arr.NonEmptyReadonlyArray<Pcm>;
  readonly port: Arr.NonEmptyReadonlyArray<Pcm>;
}

/** Each recipe's renders, made once, when a test first reads them. */
const rendered = new Map<Recipe, Renders>();
const rendersOf = (recipe: Recipe): Renders => {
  const had = rendered.get(recipe);
  if (had !== undefined) return had;
  const sound = portSound(recipe);
  const made: Renders = {
    recipe: Arr.map(SEEDS, (seed) => synthesize(recipe, seed)),
    port: Arr.map(SEEDS, (seed) => renderCode(sound, seed)),
  };
  rendered.set(recipe, made);
  return made;
};

const digest = (pcm: Pcm): string => {
  const hash = createHash('sha256');
  for (const plane of pcm.channels)
    hash.update(new Uint8Array(plane.buffer, plane.byteOffset, plane.byteLength));
  return hash.digest('hex');
};

const median = (values: ReadonlyArray<number>): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
};

/** A MIDI note's frequency, on A4 = 440 Hz. */
const midiHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** The major pentatonic scale's steps above its root. */
const PENTATONIC = [0, 2, 4, 7, 9] as const;

/** The first `count` degrees of the pentatonic scale on `root` (a MIDI note), as MIDI notes. */
const degrees = (root: number, count: number): ReadonlyArray<number> =>
  Array.from({ length: count }, (_, k) => root + 12 * Math.floor(k / 5) + (PENTATONIC[k % 5] ?? 0));

/**
 * The share of `pcm`'s energy at `hz` in dB (Goertzel over the first
 * channel): −3 dB for a steady sine alone, lower as other sound shares it.
 */
const levelAt = (pcm: Pcm, hz: number): number => {
  const x = pcm.channels[0] ?? new Float32Array(0);
  const c = 2 * Math.cos((2 * Math.PI * hz) / pcm.rate);
  let s1 = 0;
  let s2 = 0;
  let energy = 0;
  for (const v of x) {
    const s0 = v + c * s1 - s2;
    s2 = s1;
    s1 = s0;
    energy += v * v;
  }
  const power = s1 * s1 + s2 * s2 - c * s1 * s2;
  return 10 * Math.log10(Math.max(power / (x.length * energy), 1e-30));
};

/** The median over the seeds of each side's level at `hz`. */
const levelsAt = (renders: Renders, hz: number) => ({
  recipe: median(renders.recipe.map((pcm) => levelAt(pcm, hz))),
  port: median(renders.port.map((pcm) => levelAt(pcm, hz))),
});

/** What every port shares with its recipe: its length, its loudness and, but for a melody, its band balance. */
const measuresAsItsRecipe = (recipe: Recipe, balanced: boolean) => {
  const renders = rendersOf(recipe);
  for (const [port, synth] of Arr.zip(renders.port, renders.recipe))
    expect(port.frames).toBe(synth.frames);
  const profiled = (pcm: Pcm) => profileOf(pcm, USE[recipe.recipe]);
  const recipeProfile = medianProfile(Arr.map(renders.recipe, profiled));
  const portProfile = medianProfile(Arr.map(renders.port, profiled));
  expect(Math.abs(portProfile.integrated - recipeProfile.integrated)).toBeLessThanOrEqual(1);
  const apart = distance(recipeProfile, portProfile);
  if (balanced) expect(apart.balance).toBeLessThanOrEqual(1.5);
  return { renders, apart };
};

describe('each port is pinned', () => {
  for (const recipe of Object.values(MEASURED))
    test(`${recipe.recipe}: decodes as a code sound, and renders byte for byte as pinned`, () => {
      const sound = { play: portOf(recipe) };
      expect(Schema.decodeSync(CodeSound)(sound)).toEqual(sound);
      const once = digest(Arr.headNonEmpty(rendersOf(recipe).port));
      expect(digest(renderCode(portSound(recipe), 1))).toBe(once);
      expect(once).toBe(PINNED[recipe.recipe]);
    });
});

describe('each port measures as its recipe on seeds 1–5', () => {
  test('room: its length, loudness and band balance', () => {
    measuresAsItsRecipe(MEASURED.room, true);
  });

  test('bell: each seed strikes its own degree, each partial at the recipe’s level, the hit on time', () => {
    const { renders, apart } = measuresAsItsRecipe(MEASURED.bell, true);
    const scale = degrees(74, 5);
    /** The degree whose note is the loudest in `pcm`. */
    const loudest = (pcm: Pcm) => {
      const levels = scale.map((midi) => levelAt(pcm, midiHz(midi)));
      return levels.indexOf(Math.max(...levels));
    };
    for (const [seed, [port, synth]] of Arr.zip(SEEDS, Arr.zip(renders.port, renders.recipe))) {
      // Variant n rings degree n − 1.
      expect(loudest(port)).toBe(seed - 1);
      expect(loudest(synth)).toBe(seed - 1);
      const struck = midiHz(scale[seed - 1] ?? 0);
      for (const ratio of [1, 2, 3.01, 4.18])
        expect(
          Math.abs(levelAt(port, struck * ratio) - levelAt(synth, struck * ratio)),
        ).toBeLessThanOrEqual(1.5);
    }
    expect(Math.abs(apart.hit)).toBeLessThanOrEqual(0.02);
  });

  test('drone: its four voices at the recipe’s levels', () => {
    const { renders } = measuresAsItsRecipe(MEASURED.drone, true);
    for (const ratio of [1, 2, 3, 1.5]) {
      const { recipe, port } = levelsAt(renders, midiHz(38) * ratio);
      expect(Math.abs(port - recipe)).toBeLessThanOrEqual(1.5);
    }
  });

  test('drain: its band balance, and its hit on time', () => {
    const { apart } = measuresAsItsRecipe(MEASURED.drain, true);
    expect(Math.abs(apart.hit)).toBeLessThanOrEqual(0.02);
  });

  test('bloom: its chord’s notes at the recipe’s levels', () => {
    const { renders } = measuresAsItsRecipe(MEASURED.bloom, true);
    // The root, third and fifth (D4, F#4, A4). The octave shares its
    // frequency with the root's second partial, so its level rides on two
    // random phases in both and is read by the balance alone.
    for (const midi of [62, 66, 69]) {
      const { recipe, port } = levelsAt(renders, midiHz(midi));
      expect(Math.abs(port - recipe)).toBeLessThanOrEqual(1.5);
    }
  });

  test('notes: every plink on the scale, 20 dB over any note off it', () => {
    // A melody drawn anew each seed, in both: its band balance is the
    // melody's, so it is read by the scale its plinks keep to.
    const { renders } = measuresAsItsRecipe(MEASURED.notes, false);
    const on = degrees(74, 10);
    const off = Array.from({ length: 24 }, (_, k) => 74 + k).filter((m) => !on.includes(m));
    const gap = (pcm: Pcm) =>
      Math.max(...on.map((m) => levelAt(pcm, midiHz(m)))) -
      Math.max(...off.map((m) => levelAt(pcm, midiHz(m))));
    for (const pcm of [...renders.port, ...renders.recipe]) expect(gap(pcm)).toBeGreaterThan(20);
  });

  test('wind: its length, loudness and band balance', () => {
    measuresAsItsRecipe(MEASURED.wind, true);
  });

  test('rain: its length, loudness and band balance', () => {
    measuresAsItsRecipe(MEASURED.rain, true);
  });
});

describe('each bed’s port loops as its recipe', () => {
  for (const recipe of LOOPED)
    test(`${recipe.recipe}: its seam heard on no more seeds than the recipe's, and never a click`, () => {
      const sound = portSound(recipe);
      const port = SEEDS.map((seed) => loopSeam(renderCode(sound, seed)));
      const heard = (seams: ReadonlyArray<ReturnType<typeof loopSeam>>) =>
        seams.filter(seamHeard).length;
      expect(heard(port)).toBeLessThanOrEqual(
        heard(SEEDS.map((seed) => loopSeam(synthesize(recipe, seed)))),
      );
      for (const seam of port) expect(seamHeard({ db: 0, click: seam.click })).toBe(false);
    });
});

/** The seeds a family is heard on: a code trial's three variants. */
const TRIAL_SEEDS = [1, 2, 3] as const;

/** Each family at settings like the library's sounds, and how it is heard. */
const FAMILIES = {
  burst: {
    play: burst({ color: 'pink', low: 500, high: 2000, attack: 0.0005, decay: 0.05 }),
    use: 'one-shot',
  },
  thump: { play: thump({ hz: 100, octaves: 1, drop: 0.02, decay: 0.3 }), use: 'one-shot' },
  'knock of wood': { play: knock({ material: 'wood', hz: 480, secs: 0.3 }), use: 'one-shot' },
  'knock of stone': { play: knock({ material: 'stone', hz: 165, secs: 0.4 }), use: 'one-shot' },
  scatter: {
    play: scatter({
      count: 3,
      first: 0.05,
      every: 0.2,
      fall: 6,
      material: 'stone',
      hz: 600,
      secs: 0.8,
    }),
    use: 'one-shot',
  },
  whoosh: {
    play: whoosh({ onset: 0.05, hit: 0.4, fall: 0.2, low: 1200, high: 6000, q: 0.5 }),
    use: 'one-shot',
  },
  hiss: { play: hiss({ hz: 8500, q: 1.2, rise: 0.3, hold: 0.8, secs: 1.2 }), use: 'one-shot' },
  sizzle: { play: sizzle({ flash: 0.05, crackle: 120, secs: 1 }), use: 'one-shot' },
  breeze: { play: breeze({ secs: 4, hz: 550 }), use: 'bed' },
  'rain on a roof': { play: rain({ secs: 1, hiss: 900, taps: 10 }), use: 'bed' },
} as const satisfies Readonly<Record<string, { readonly play: Node; readonly use: SoundUse }>>;

type Family = keyof typeof FAMILIES;

/** Each family's first seed at its settings above, by the digest of its samples. */
const FAMILY_PINNED = {
  burst: 'b58430ad21faf696b8f63689b69ee9ac9e355735cf33e8bc25fdcf88ae873669',
  thump: 'd28c58f3f28648ebf154e83fd390b5ad60948574e463aef5a3730eb9cc11a3fa',
  'knock of wood': '68afd0577e6bd709cd7271a459df3062e6d9c2507851f64dc2649e6c4597156f',
  'knock of stone': 'e9a34544a67ceec5583da449577500b707fff06cb794b4990db961e53d3ef41b',
  scatter: '8aa2f325d58d1dad59e92441f3e8962485ddd03950558e462967eaef436239aa',
  whoosh: '9bf2214547f868339e0858c59a4db894114ee5d6764a35295447f16b13ccf8e9',
  hiss: '8043c59bf54af3f095ffb7e47fc1ef2110d4c248e6ca0c8ff54b3a69d865b160',
  sizzle: '4ae478da5b1af5a52c63fa5c04c6423ab0564b7d942d220be80fc98350847faf',
  breeze: 'a6d700a5a95b6d6f06d540068a1d503e3ec11a51331f5bb08f405a363ea15d80',
  'rain on a roof': 'b6e06e739d1e84568a7d09bd0296bf4035705d57055f7e352f87e99856d096d6',
} as const satisfies Readonly<Record<Family, string>>;

/** `play` as the library resolves a code sound heard as `use`. */
const codeSound = (play: Node, use: SoundUse): ResolvedSound => {
  const library = defineLibrary({
    'family.trial': { kind: 'code', sound: { play }, variants: 3, use },
  });
  return Result.getOrThrow(resolveCode(library)).code.get('family.trial')!;
};

/** Each family's renders on the trial seeds, made once, when a test first reads them. */
const familyRendered = new Map<Family, Arr.NonEmptyReadonlyArray<Pcm>>();
const familyRenders = (family: Family): Arr.NonEmptyReadonlyArray<Pcm> => {
  const had = familyRendered.get(family);
  if (had !== undefined) return had;
  const { play, use } = FAMILIES[family];
  const sound = codeSound(play, use);
  const made = Arr.map(TRIAL_SEEDS, (seed) => renderCode(sound, seed));
  familyRendered.set(family, made);
  return made;
};

/** The centre of `Profile.bands`' k-th band: the base-ten third octaves, 1000·10^((k − 15)/10) Hz. */
const centre = (k: number): number => 1000 * 10 ** ((k - 15) / 10);

/**
 * The most rumble a family may make: 1e-4 of its power below 30 Hz, what the
 * cleanest takes hold (amb.rain and paper.whoosh; wood.gavel's holds 1.2e-3).
 */
const RUMBLE = 1e-4;

/** Each band's level in dB under the loudest band (0 for the loudest). */
const underLoudest = (profile: Profile): ReadonlyArray<number> => {
  const loudest = Math.max(...profile.bands);
  return profile.bands.map((share) => 10 * Math.log10(loudest / Math.max(share, 1e-30)));
};

/** The centre of the loudest band. */
const loudestBand = (profile: Profile): number =>
  centre(profile.bands.indexOf(Math.max(...profile.bands)));

/** How far under the loudest band the quietest-standing band centred where `where` holds lies: the least of their levels under it. */
const leastUnder = (profile: Profile, where: (hz: number) => boolean): number =>
  Math.min(...underLoudest(profile).filter((_, k) => where(centre(k))));

/** `pcm`'s mean power from `from` to `to` seconds over every channel, in dB. */
const powerDb = (pcm: Pcm, from: number, to: number): number => {
  const start = Math.max(0, Math.floor(from * pcm.rate));
  const end = Math.min(pcm.frames, Math.floor(to * pcm.rate));
  let sum = 0;
  for (const plane of pcm.channels) for (let i = start; i < end; i++) sum += (plane[i] ?? 0) ** 2;
  return 10 * Math.log10(Math.max(sum / (pcm.channels.length * Math.max(1, end - start)), 1e-30));
};

/** The loudest 20 ms of `pcm` that starts between `from` and `to` seconds, read a millisecond apart: its start and its power in dB. */
const loudest20ms = (pcm: Pcm, from: number, to: number) => {
  let best = { at: from, db: -Infinity };
  for (let at = Math.max(0, from); at < to; at += 0.001) {
    const db = powerDb(pcm, at, at + 0.02);
    if (db > best.db) best = { at, db };
  }
  return best;
};

describe('each family is pinned', () => {
  for (const family of Object.keys(FAMILIES) as ReadonlyArray<Family>)
    test(`${family}: decodes as a code sound, and renders byte for byte as pinned`, () => {
      const { play, use } = FAMILIES[family];
      const sound = { play };
      expect(Schema.decodeSync(CodeSound)(sound)).toEqual(sound);
      const once = digest(Arr.headNonEmpty(familyRenders(family)));
      expect(digest(renderCode(codeSound(play, use), 1))).toBe(once);
      expect(once).toBe(FAMILY_PINNED[family]);
    });
});

describe('each family does what its doc says, on seeds 1–3', () => {
  test('burst: its power in its band, the bands two octaves out at least 18 dB under its loudest', () => {
    for (const pcm of familyRenders('burst')) {
      const profile = profileOf(pcm, 'one-shot');
      expect(loudestBand(profile)).toBeGreaterThanOrEqual(500);
      expect(loudestBand(profile)).toBeLessThanOrEqual(2000);
      expect(leastUnder(profile, (hz) => hz <= 500 / 4 || hz >= 2000 * 4)).toBeGreaterThanOrEqual(
        18,
      );
    }
  });

  test('thump: loudest between its pitch and the octave it falls from, next to no rumble', () => {
    for (const pcm of familyRenders('thump')) {
      const profile = profileOf(pcm, 'one-shot');
      expect(loudestBand(profile)).toBeGreaterThanOrEqual(100);
      expect(loudestBand(profile)).toBeLessThanOrEqual(200);
      expect(leastUnder(profile, (hz) => hz <= 100 / 2)).toBeGreaterThanOrEqual(25);
      expect(profile.rumble).toBeLessThan(RUMBLE);
    }
  });

  test('knock: next to no rumble in wood or stone, nothing two octaves under its pitch, and wood loudest at its pitch', () => {
    for (const [family, hz] of [
      ['knock of wood', 480],
      ['knock of stone', 165],
    ] as const)
      for (const pcm of familyRenders(family)) {
        const profile = profileOf(pcm, 'one-shot');
        expect(profile.rumble).toBeLessThan(RUMBLE);
        expect(leastUnder(profile, (band) => band <= hz / 4)).toBeGreaterThanOrEqual(25);
        if (family === 'knock of wood') expect(loudestBand(profile)).toBeCloseTo(501.2, 0);
      }
  });

  test('scatter: each landing about `every` after the last and, by the median, `fall` dB under it', () => {
    const { count, first, every, fall } = { count: 3, first: 0.05, every: 0.2, fall: 6 };
    const falls: Array<number> = [];
    for (const pcm of familyRenders('scatter')) {
      const landings = Array.from({ length: count }, (_, k) => {
        const mean = first + k * every;
        return { mean, ...loudest20ms(pcm, mean - every / 2, mean + every / 2) };
      });
      for (const { mean, at } of landings)
        expect(Math.abs(at - mean)).toBeLessThanOrEqual(every / 3 + 0.01);
      for (const [before, after] of Arr.zip(landings, landings.slice(1)))
        falls.push(before.db - after.db);
    }
    expect(Math.abs(median(falls) - fall)).toBeLessThanOrEqual(1.5);
  });

  test('whoosh: its onset and its hit where it says, within the sync check’s 20 ms', () => {
    for (const pcm of familyRenders('whoosh')) {
      const described = describeSound(pcm);
      expect(Math.abs(described.onset - 0.05)).toBeLessThanOrEqual(HIT_MOVE);
      expect(Math.abs(described.hit - 0.4)).toBeLessThanOrEqual(HIT_MOVE);
    }
  });

  test('hiss: held within 1.5 dB from its rise to its hold, its first and last 50 ms 20 dB under that', () => {
    for (const pcm of familyRenders('hiss')) {
      const held = Array.from({ length: 10 }, (_, k) =>
        powerDb(pcm, 0.3 + k * 0.05, 0.35 + k * 0.05),
      );
      const top = Math.max(...held);
      expect(top - Math.min(...held)).toBeLessThanOrEqual(1.5);
      expect(top - powerDb(pcm, 0, 0.05)).toBeGreaterThanOrEqual(20);
      expect(top - powerDb(pcm, 1.15, 1.2)).toBeGreaterThanOrEqual(20);
    }
  });

  test('sizzle: its hit at its flash, then falling evenly, about 4.5 dB a tenth of a second', () => {
    for (const pcm of familyRenders('sizzle')) {
      expect(Math.abs(describeSound(pcm).hit - 0.05)).toBeLessThanOrEqual(HIT_MOVE);
      // The flash is gone by 0.17 s: the tenths from 0.2 s are the body's alone.
      const tenths = Array.from({ length: 8 }, (_, k) =>
        powerDb(pcm, 0.2 + k * 0.1, 0.3 + k * 0.1),
      );
      for (const [before, after] of Arr.zip(tenths, tenths.slice(1)))
        expect(Math.abs(before - after - 4.5)).toBeLessThanOrEqual(1);
    }
  });

  test('breeze: its seam unheard, three quarters of it within an octave of its band, no rumble and no hiss', () => {
    const renders = familyRenders('breeze');
    for (const pcm of renders) expect(seamHeard(loopSeam(pcm))).toBe(false);
    const profile = profileOf(Arr.headNonEmpty(renders), 'bed');
    const near = profile.bands.reduce(
      (sum, share, k) => sum + (centre(k) >= 550 / 2 && centre(k) <= 550 * 2 ? share : 0),
      0,
    );
    expect(near).toBeGreaterThanOrEqual(0.7);
    expect(profile.rumble).toBeLessThan(RUMBLE);
    expect(leastUnder(profile, (hz) => hz >= 4000)).toBeGreaterThanOrEqual(30);
  });

  test('rain on a roof: its taps ring between 1.2 and 3.2 kHz, over the same rain without them', () => {
    const bare = codeSound(rain({ secs: 1, hiss: 900 }), 'bed');
    for (const [seed, roofed] of Arr.zip(TRIAL_SEEDS, familyRenders('rain on a roof'))) {
      const without = renderCode(bare, seed);
      expect(roofed.frames).toBe(without.frames);
      // The rain under the taps draws the same numbers either way, so what
      // the roof adds is the taps alone.
      const taps: Pcm = {
        ...roofed,
        channels: roofed.channels.map((plane, c) => {
          const under = without.channels[c] ?? new Float32Array(0);
          return plane.map((v, i) => v - (under[i] ?? 0));
        }),
      };
      const band = loudestBand(profileOf(taps, 'bed'));
      expect(band).toBeGreaterThanOrEqual(1200);
      expect(band).toBeLessThanOrEqual(3200);
    }
  });
});
