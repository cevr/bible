// Colours as a film writes them, hex: a colour between two, and its own
// clear shade; a colour that is not `#rgb` or `#rrggbb` is refused, named,
// never turned into a NaN fill a canvas ignores or a stop it refuses. A
// colour's ramp under a key light keeps CRAFT rule 12 for every base and
// every key: measured here by this file's own LCh, not the module's.

import { describe, expect, test } from 'bun:test';
import { rng } from '../core/random.ts';
import { type Hex, type Ramp, type Shading, clearOf, mix, ramp } from './colour.ts';

describe('mix', () => {
  test('a colour between two, rounded per channel, clamped to the two', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mix('#ab8163', '#f3ebdd', 0)).toBe('#ab8163');
    expect(mix('#ab8163', '#f3ebdd', 2)).toBe('#f3ebdd');
    expect(mix('#fff', '#000', 0.25)).toBe('#bfbfbf');
  });
});

describe('clearOf', () => {
  test('the same colour at alpha 0', () => {
    expect(clearOf('#e6b347')).toBe('rgba(230, 179, 71, 0)');
    expect(clearOf('#fb0')).toBe('rgba(255, 187, 0, 0)');
  });
});

describe('a colour that is not hex', () => {
  test.each(['#e6b34780', '#e6b3', '#ggg'] as const)('%p is refused, named', (c) => {
    expect(() => mix(c, '#000000', 0)).toThrow(`colour "${c}"`);
    expect(() => clearOf(c)).toThrow(`colour "${c}"`);
  });

  test('a name or rgb() is not a Hex where it is written, and refused if it gets through', () => {
    // @ts-expect-error a colour name is not hex
    expect(() => mix('gold', '#000000', 0)).toThrow('colour "gold"');
    // @ts-expect-error rgb() is not hex
    expect(() => clearOf('rgb(230, 179, 71)')).toThrow('colour "rgb(230, 179, 71)"');
  });
});

// ─── ramps (CRAFT rule 12) ───────────────────────────────────────────────────

const WHITE = [0.95047, 1, 1.08883] as const;
const channel = (hex: string, i: number) =>
  Number.parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
const fi = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

/** `hex` in CIE LCh (D65). */
const lch = (hex: string) => {
  const [r, g, b] = [0, 1, 2].map((i) => linear(channel(hex, i))) as [number, number, number];
  const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / WHITE[0]);
  const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / WHITE[2]);
  const [A, B] = [500 * (x - y), 200 * (y - z)];
  return {
    L: 116 * y - 16,
    C: Math.hypot(A, B),
    h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
};

/** Whether LCh (L, C, h) is a colour sRGB can show. */
const shows = (L: number, C: number, h: number) => {
  const fy = (L + 16) / 116;
  const [a, b] = [C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
  const [X, Y, Z] = [WHITE[0] * fi(fy + a / 500), fi(fy), WHITE[2] * fi(fy - b / 200)];
  return [
    3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
    -0.969266 * X + 1.8760108 * Y + 0.041556 * Z,
    0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
  ].every((v) => v >= -1e-4 && v <= 1 + 1e-4);
};

/** The most chroma sRGB shows at lightness `L` and hue `h`. */
const most = (L: number, h: number) => {
  let [lo, hi] = [0, 160];
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (shows(L, mid, h)) lo = mid;
    else hi = mid;
  }
  return lo;
};

/** How far apart two hues are, the short way round. */
const apart = (h: number, k: number) => {
  const d = Math.abs(h - k) % 360;
  return d > 180 ? 360 - d : d;
};

/** How far a hex colour's hue can stray by rounding, at chroma `C`: degrees. */
const slack = (C: number) => (Math.atan(1 / Math.max(C, 1)) * 180) / Math.PI;

/**
 * Why `r` is no CRAFT 12 ramp under `key` at knobs `k`: its shade must be
 * darker, turned toward the key's complement by at least `k.turn` (or onto
 * it), and at least as chromatic as its base and `k.deep`; its light
 * lighter, leaning to the key's hue the same way, and at least `k.warm`
 * chromatic. A near-neutral is held to the same turn: CRAFT 12 asks it to
 * turn toward the complement, not to land on it. Chroma the gamut cannot show
 * at that lightness and hue is excused.
 */
const faults = (r: Ramp, key: Hex, k: Shading): string[] => {
  const [b, s, l] = [lch(r.base), lch(r.shade), lch(r.light)];
  const keyHue = lch(key).h;
  const out: string[] = [];
  const leans = (
    to: number,
    c: { readonly L: number; readonly C: number; readonly h: number },
    what: string,
  ) => {
    // Black and white have no hue to turn: the gamut shows no chroma there.
    if (c.L < 1 || c.L > 99) return;
    const from = apart(b.h, to);
    const want = Math.max(0, from - Math.min(k.turn, from));
    if (apart(c.h, to) > want + slack(c.C))
      out.push(
        `${what} sits ${apart(c.h, to).toFixed(1)}° from hue ${to.toFixed(1)}, wants ${want.toFixed(1)}°`,
      );
  };
  if (b.L > 1 && s.L >= b.L - 0.2) out.push('shade not darker');
  leans((keyHue + 180) % 360, s, 'shade');
  if (s.C < Math.min(Math.max(b.C, k.deep), most(s.L, s.h)) - 1)
    out.push(`shade chroma ${s.C.toFixed(1)} under its base's ${b.C.toFixed(1)} or ${k.deep}`);
  if (b.L < 99 && l.L <= b.L + 0.2) out.push('light not lighter');
  leans(keyHue, l, 'light');
  if (l.C < Math.min(k.warm, most(l.L, l.h)) - 1) out.push(`light grey: chroma ${l.C.toFixed(1)}`);
  return out;
};

/** A colour of LCh (L, C, h), its chroma lowered as far as sRGB needs. */
const hexOf = (L: number, C: number, h: number): Hex => {
  const c = Math.min(C, most(L, h));
  const fy = (L + 16) / 116;
  const [a, b] = [c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  const [X, Y, Z] = [WHITE[0] * fi(fy + a / 500), fi(fy), WHITE[2] * fi(fy - b / 200)];
  const gamma = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  const byte = (v: number) =>
    Math.round(Math.max(0, Math.min(1, gamma(v))) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${byte(3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z)}${byte(-0.969266 * X + 1.8760108 * Y + 0.041556 * Z)}${byte(0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z)}`;
};

/** The house look's knobs (`style/house.ts` `shading`, fitted to K1). */
const FILM: Shading = {
  turn: 20,
  dark: 0.22,
  lift: 0.4,
  deep: 13.5,
  neutral: 0.65,
  warm: 8.5,
  fade: 0.6,
};

/** Knobs from gentle to strong (the second at CRAFT 12's floors), and the paper-cut look's. */
const KNOBS: ReadonlyArray<Shading> = [
  { turn: 25, dark: 0.16, lift: 0.45, deep: 14, neutral: 0.7, warm: 7, fade: 0.6 },
  { turn: 10, dark: 0.1, lift: 0.1, deep: 6, neutral: 0, warm: 6, fade: 0.9 },
  { turn: 60, dark: 0.1, lift: 0.7, deep: 25, neutral: 1, warm: 12, fade: 0.3 },
  FILM,
];

/** Key lights round the wheel, pale and stronger, and a cool night and a warm cream. */
const KEYS: ReadonlyArray<Hex> = [
  ...Array.from({ length: 12 }, (_, i) => hexOf(88, 14, i * 30)),
  ...Array.from({ length: 12 }, (_, i) => hexOf(80, 30, i * 30 + 15)),
  '#9fb4d8',
  '#f3e9c8',
];

/** Bases across the gamut, seeded, with the greys and the ends. */
const BASES: ReadonlyArray<Hex> = (() => {
  const r = rng(1218);
  const byte = () =>
    Math.floor(r() * 256)
      .toString(16)
      .padStart(2, '0');
  return [
    '#000000',
    '#ffffff',
    '#808080',
    '#b7b2a8',
    '#ce0914',
    ...Array.from({ length: 400 }, (): Hex => `#${byte()}${byte()}${byte()}`),
  ];
})();

describe('ramp', () => {
  test('every base under every key keeps CRAFT 12: shades turn to the complement, lights lean to the light, none grey', () => {
    const wrong: string[] = [];
    for (const k of KNOBS)
      for (const key of KEYS)
        for (const base of BASES) {
          const r = ramp(base, key, k);
          const why = faults(r, key, k);
          if (why.length > 0)
            wrong.push(`${base} under ${key} (turn ${k.turn}): ${why.join('; ')}`);
        }
    expect(wrong.slice(0, 10)).toEqual([]);
  });

  test('the base passes through, and the same base, key and knobs give the same ramp', () => {
    const k = KNOBS[0] as Shading;
    expect(ramp('#94ad7f', '#f3e9c8', k).base).toBe('#94ad7f');
    expect(ramp('#94ad7f', '#f3e9c8', k)).toEqual(ramp('#94ad7f', '#f3e9c8', k));
  });

  test('a grey shades to the complement and lights to the key, never staying grey', () => {
    const k = KNOBS[0] as Shading;
    const r = ramp('#808080', '#f3e9c8', k);
    const key = lch('#f3e9c8').h;
    expect(apart(lch(r.shade).h, (key + 180) % 360)).toBeLessThan(slack(k.deep));
    expect(lch(r.shade).C).toBeGreaterThan(k.deep - 1);
    expect(apart(lch(r.light).h, key)).toBeLessThan(slack(k.warm));
    expect(lch(r.light).C).toBeGreaterThan(k.warm - 1);
  });

  test('a near-neutral’s shade turns past `turn` by `neutral` of the rest: 1 onto the complement, less short of it', () => {
    const key: Hex = '#f3e9c8';
    const complement = (lch(key).h + 180) % 360;
    const paper = '#b7b2a8';
    const from = apart(lch(paper).h, complement);
    const shortOf = (neutral: number) =>
      apart(lch(ramp(paper, key, { ...FILM, neutral }).shade).h, complement);
    expect(shortOf(1)).toBeLessThan(slack(FILM.deep));
    expect(shortOf(0.6)).toBeGreaterThan(10);
    expect(shortOf(0)).toBeGreaterThan(shortOf(0.6));
    expect(shortOf(0)).toBeLessThan(from - FILM.turn);
    // A hueless grey has no hue to stop at: all the way, whatever the share.
    const grey = lch(ramp('#808080', key, { ...FILM, neutral: 0 }).shade);
    expect(apart(grey.h, complement)).toBeLessThan(slack(FILM.deep));
  });

  test('a cool paper’s light leans toward a warm key without crossing to it through green', () => {
    // The slate of the accused's legs: past the light's floor, so it keeps its own hue near enough.
    const k = KNOBS[0] as Shading;
    const light = lch(ramp('#58667a', '#f3e9c8', k).light);
    expect(apart(light.h, lch('#58667a').h)).toBeLessThan(90);
    expect(apart(light.h, 150)).toBeGreaterThan(45);
  });

  test('a light with no hue has no complement to shade toward', () => {
    expect(() => ramp('#94ad7f', '#e6e6e6', KNOBS[0] as Shading)).toThrow('#e6e6e6');
  });

  test('K1’s lavender crease on the figure paper is a CRAFT 12 shade: short of the complement, turned past `turn`', () => {
    // K1's hand-drawn crease (r3) on the people's paper, under the court's pale-gold key.
    const key: Hex = '#f3e9c8';
    const [paper, lavender] = ['#b7b2a8', '#9a92ab'] as const;
    const [b, s] = [lch(paper), lch(lavender)];
    const complement = (lch(key).h + 180) % 360;
    // CRAFT 12's words: darker, more chromatic, turned toward the complement by more than `turn`.
    expect(s.L).toBeLessThan(b.L);
    expect(s.C).toBeGreaterThan(b.C);
    expect(apart(s.h, complement)).toBeLessThan(apart(b.h, complement) - FILM.turn);
    // ...and the check says the same: CRAFT 12 asks a near-neutral to turn, not to land on the complement.
    expect(faults({ ...ramp(paper, key, FILM), shade: lavender }, key, FILM)).toEqual([]);
  });

  // The rule's negative controls: what CRAFT 12 forbids fails the same check.
  describe('what CRAFT 12 forbids fails the check', () => {
    const k = KNOBS[0] as Shading;
    const key: Hex = '#f3e9c8';
    const sage = ramp('#94ad7f', key, k);
    const base = lch('#94ad7f');
    test.each([
      ['a grey light', { ...sage, light: '#bfbfbe' }, 'light grey'],
      [
        'a near-grey light (r3’s robe core)',
        { ...ramp('#3c3952', key, k), light: '#999397' },
        'light grey',
      ],
      ['the base dimmed', { ...sage, shade: hexOf(base.L * 0.84, base.C, base.h) }, 'shade sits'],
      [
        'a shade turned away',
        { ...sage, shade: hexOf(base.L * 0.84, base.C, base.h - 30) },
        'shade sits',
      ],
      ['a grey shade', { ...sage, shade: '#5c5c5c' }, 'shade chroma'],
      [
        'a near-neutral’s shade barely turned',
        { ...ramp('#b7b2a8', key, k), shade: hexOf(62, 14.4, lch('#b7b2a8').h - 5) },
        'shade sits',
      ],
      ['a light turned away', { ...sage, light: hexOf(82, 16, base.h + 30) }, 'light sits'],
    ] as const)('%s', (_, r, fault) => {
      expect(faults(r, key, k).join('; ')).toContain(fault);
    });
  });
});

// ─── CRAFT 12's floors: no knob lowers them ──────────────────────────────────

describe('knobs under CRAFT 12’s floors', () => {
  // The knobs are the look's tuning surface; tuned to grey, no ramp may derive.
  const grey: Shading = { turn: 0, dark: 0.2, lift: 0.4, deep: 0, neutral: 1, warm: 0, fade: 0.6 };

  test('are refused, each named: an unturned shade and a grey light never derive', () => {
    expect(() => ramp('#b7b2a8', '#f3e9c8', grey)).toThrow(/turn 0.*deep 0.*warm 0/);
  });

  test.each([
    ['a shade that does not turn', { turn: 5 }, 'turn 5'],
    ['a grey shade', { deep: 3 }, 'deep 3'],
    ['a grey light', { warm: 3.3 }, 'warm 3.3'],
    ['a shade no darker', { dark: 0 }, 'dark 0'],
    ['a light no lighter', { lift: 0 }, 'lift 0'],
    // Just under each floor, so the floors' own values are pinned.
    ['a turn just under the floor', { turn: 9.9 }, 'turn 9.9'],
    ['a shade’s chroma just under the floor', { deep: 5.9 }, 'deep 5.9'],
    ['a light’s chroma just under the floor', { warm: 5.9 }, 'warm 5.9'],
    ['a darkening just under the floor', { dark: 0.09 }, 'dark 0.09'],
    ['a lift just under the floor', { lift: 0.09 }, 'lift 0.09'],
    ['a shade near black', { dark: 0.95 }, 'dark 0.95'],
    ['a darkening just over the top', { dark: 0.61 }, 'dark 0.61'],
    ['an endless chroma', { deep: Number.POSITIVE_INFINITY }, 'deep Infinity not a finite number'],
    ['a light of no number', { warm: Number.NaN }, 'warm NaN not a finite number'],
  ] as const)('%s is refused', (_, knob, named) => {
    expect(() => ramp('#94ad7f', '#f3e9c8', { ...FILM, ...knob })).toThrow(named);
  });
});
