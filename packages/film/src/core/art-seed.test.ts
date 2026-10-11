import { describe, expect, test } from 'bun:test';
import { Array as Arr, Option } from 'effect';
import { type ArtAxis, type ArtDeck, artBrief, conflicts, drawBatch } from './art-seed.ts';

// What the looks study relies on: a seed draws the same look forever (one
// draw is pinned), a draw never holds an incompatible pair, it keeps its
// distance from the existing looks and its batch-mates, a batch shares the
// balanced axis out evenly, and adding an option leaves the seeds it does not
// win as they were.

type ArtOption = ArtAxis['options'][number];
type Picks = Readonly<Record<string, string>>;

const option = (id: string, more: Partial<ArtOption> = {}): ArtOption => ({
  id,
  name: id,
  look: `${id} look.`,
  asks: `${id} asks.`,
  cost: '2d',
  ...more,
});

const DECK: ArtDeck = {
  version: 1,
  axes: [
    { id: 'dimension', name: 'Dimension', weight: 1, options: [option('2d'), option('3d')] },
    {
      id: 'medium',
      name: 'Medium',
      weight: 3,
      options: [
        option('paper', { excludes: ['dimension/3d'], profile: true }),
        option('ink', { excludes: ['dimension/3d'] }),
        option('glass'),
        option('clay', { excludes: ['dimension/2d'], cost: 'webgl' }),
        option('wood', { excludes: ['dimension/2d'], cost: 'webgl' }),
        option('puppet', { excludes: ['dimension/3d'], requires: ['light/screen'] }),
        option('chalk', { excludes: ['dimension/3d'] }),
        option('voxel', { excludes: ['dimension/2d'], cost: 'webgl' }),
      ],
    },
    {
      id: 'light',
      name: 'Light',
      weight: 1,
      options: [option('day'), option('dawn'), option('screen', { excludes: ['dimension/3d'] })],
    },
    {
      id: 'palette',
      name: 'Palette',
      weight: 2,
      options: [option('earth'), option('dawn'), option('stone'), option('chalk')],
    },
    {
      id: 'motion',
      name: 'Motion',
      weight: 1,
      options: [option('push'), option('twos', { excludes: ['dimension/3d'] }), option('orbit')],
    },
  ],
  existing: [
    {
      name: 'cutpaper',
      picks: { dimension: '2d', medium: 'paper', light: 'day', palette: 'earth', motion: 'push' },
    },
  ],
  minDistance: 0.4,
  distinct: ['medium'],
  balance: 'dimension',
  nameAxes: ['medium', 'palette'],
  rules: ['Keep the colour script.'],
};

/** The look `seed` draws on its own: a batch of one, when the seed itself holds. */
const drawn = (deck: ArtDeck, seed: number) =>
  Option.filter(Arr.head(drawBatch(deck, seed, 1).draws), (d) => d.seed === seed);

/** The test's own measure: the weighted share of the axes both looks name that differ. */
const apart = (a: Picks, b: Picks): number => {
  const both = DECK.axes.filter((axis) => axis.id in a && axis.id in b);
  const total = both.reduce((sum, axis) => sum + axis.weight, 0);
  const differ = both
    .filter((axis) => a[axis.id] !== b[axis.id])
    .reduce((sum, axis) => sum + axis.weight, 0);
  return differ / total;
};

const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919);

const draws = SEEDS.flatMap((seed) => Option.toArray(drawn(DECK, seed)));

describe('art seed', () => {
  test('a seed draws the same look, forever', () => {
    for (const seed of SEEDS.slice(0, 40)) expect(drawn(DECK, seed)).toEqual(drawn(DECK, seed));
    expect(Option.getOrThrow(drawn(DECK, 20261011))).toEqual({
      seed: 20261011,
      attempt: 0,
      picks: { dimension: '2d', medium: 'ink', light: 'screen', palette: 'earth', motion: 'twos' },
      name: 'ink-earth',
    });
  });

  test('another seed draws other looks', () => {
    expect(draws.length).toBeGreaterThan(SEEDS.length * 0.9);
    expect(new Set(draws.map((d) => d.name)).size).toBeGreaterThan(15);
    for (const d of draws) expect(d.name).toBe(`${d.picks['medium']}-${d.picks['palette']}`);
  });

  test('a draw holds no incompatible pair and never picks a profile option', () => {
    for (const d of draws) {
      expect(conflicts(DECK, d.picks)).toEqual([]);
      expect(d.picks['medium']).not.toBe('paper');
      if (d.picks['dimension'] === '3d') {
        expect(['glass', 'clay', 'wood', 'voxel'].some((m) => m === d.picks['medium'])).toBe(true);
        expect(d.picks['motion']).not.toBe('twos');
      }
      if (d.picks['medium'] === 'puppet') expect(d.picks['light']).toBe('screen');
    }
    expect(draws.some((d) => d.picks['dimension'] === '3d')).toBe(true);
    expect(draws.some((d) => d.picks['medium'] === 'puppet')).toBe(true);
  });

  test('conflicts names excluded, unmet and unknown picks', () => {
    expect(conflicts(DECK, { dimension: '3d', medium: 'ink' })).toEqual([
      ['dimension/3d', 'medium/ink'],
    ]);
    expect(conflicts(DECK, { medium: 'puppet', light: 'day' })).toEqual([
      ['medium/puppet', 'light/day'],
    ]);
    expect(conflicts(DECK, { medium: 'marble' })).toEqual([['medium/marble', 'medium/marble']]);
    for (const look of DECK.existing) expect(conflicts(DECK, look.picks)).toEqual([]);
  });

  test('a draw keeps its distance from the existing looks', () => {
    for (const d of draws)
      for (const existing of DECK.existing)
        expect(apart(d.picks, existing.picks)).toBeGreaterThanOrEqual(0.4);
  });

  test('a brief names the nearest existing look by its weighted share of differing axes', () => {
    const picks = {
      dimension: '2d',
      medium: 'chalk',
      light: 'day',
      palette: 'earth',
      motion: 'push',
    };
    const brief = artBrief(DECK, { seed: 7, attempt: 0, picks, name: 'chalk-earth' }, 'seed-look');
    // Only the medium (weight 3 of 8) differs from cutpaper: 37.5%.
    expect(brief).toContain('`cutpaper`, 38% apart');
    expect(brief).toContain('Seed `7`');
    expect(brief).toContain('`seed-look --seed 7`');
    expect(brief).toContain('- **Medium: chalk.** chalk asks.');
    expect(brief).toContain('- Keep the colour script.');
  });

  test('a batch keeps its draws apart and shares the dimension out evenly', () => {
    const batch = drawBatch(DECK, 20261011, 4);
    expect(batch.draws.length).toBe(4);
    const mediums = batch.draws.map((d) => d.picks['medium']);
    expect(new Set(mediums).size).toBe(4);
    for (const [i, a] of batch.draws.entries())
      for (const b of batch.draws.slice(i + 1))
        expect(apart(a.picks, b.picks)).toBeGreaterThanOrEqual(0.4);
    expect(batch.draws.filter((d) => d.picks['dimension'] === '3d').length).toBe(2);
    for (const d of batch.draws) expect(drawn(DECK, d.seed)).toEqual(Option.some(d));
    expect(batch.draws.length + batch.skipped.length).toBe(
      Math.max(...batch.draws.map((d) => d.seed), ...batch.skipped.map((s) => s.seed)) -
        20261011 +
        1,
    );
  });

  test('an option added to an axis changes only the draws it wins', () => {
    const grown: ArtDeck = {
      ...DECK,
      axes: DECK.axes.map((axis) => {
        if (axis.id !== 'palette') return axis;
        return { ...axis, options: [...axis.options, option('sepia')] };
      }),
    };
    // A first attempt the new option did not win is the attempt it was before.
    const kept = SEEDS.flatMap((seed) =>
      Option.toArray(
        Option.filter(drawn(grown, seed), (d) => d.attempt === 0 && d.picks['palette'] !== 'sepia'),
      ),
    );
    expect(kept.length).toBeGreaterThan(SEEDS.length / 2);
    for (const d of kept) expect(drawn(DECK, d.seed)).toEqual(Option.some(d));
  });
});
