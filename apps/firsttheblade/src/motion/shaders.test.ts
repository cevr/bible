import { describe, expect, test } from 'bun:test';

import { FIELD_FRAGMENT, NIGHT_FRAGMENT } from './shaders.ts';

/**
 * The least sway the hero's plants may have: a tip that moves enough to be
 * seen at a glance, as the owner asked ("the movements are too unnoticble",
 * then "A bit more" than 0.012 on ask adf28c17753).
 */
const SWAY_FLOOR = 0.016;

/** The share of the width a plant's tip is pushed by, as the field's shader writes it. */
const pushIn = (source: string) =>
  Array.from(source.matchAll(/float push = .*\* sway \* ([0-9.e-]+) \* u_ramp;/g), (m) =>
    Number(m[1]),
  );

/** The arguments of each call of `name` in a GLSL source, split at the call's own commas. */
const calls = (source: string, name: string) => {
  const found: Array<ReadonlyArray<string>> = [];
  let from = source.indexOf(`${name}(`);
  while (from >= 0) {
    const args: Array<string> = [];
    let depth = 0;
    let arg = '';
    for (const char of source.slice(from + name.length + 1)) {
      if (depth === 0 && (char === ',' || char === ')')) {
        args.push(arg.trim());
        arg = '';
        if (char === ')') break;
        continue;
      }
      if (char === '(') depth++;
      if (char === ')') depth--;
      arg += char;
    }
    found.push(args);
    from = source.indexOf(`${name}(`, from + 1);
  }
  return found;
};

/**
 * Every `smoothstep(a, b, x)` whose edges are both written as numbers and are
 * not in order: GLSL ES 3.00 leaves the result undefined when `a >= b`, so a
 * fall is written `1.0 - smoothstep(b, a, x)`.
 */
const unorderedEdges = (source: string) =>
  calls(source, 'smoothstep').flatMap(([a = '', b = '']) => {
    const low = Number(a);
    const high = Number(b);
    if (a === '' || b === '' || Number.isNaN(low) || Number.isNaN(high) || low < high) return [];
    return [`smoothstep(${a}, ${b}, …)`];
  });

describe('the motion shaders', () => {
  test('write each smoothstep with its lower edge first', () => {
    expect({
      field: unorderedEdges(FIELD_FRAGMENT),
      night: unorderedEdges(NIGHT_FRAGMENT),
    }).toEqual({ field: [], night: [] });
  });

  test('sway the hero’s plants at least as far as the owner asked', () => {
    const pushes = pushIn(FIELD_FRAGMENT);
    expect(pushes.length).toBe(1);
    expect(pushes.every((push) => push >= SWAY_FLOOR)).toBe(true);
  });

  test('a sway below the floor is refused', () => {
    const lowered = FIELD_FRAGMENT.replace(
      /\* sway \* [0-9.e-]+ \* u_ramp/,
      '* sway * 0.012 * u_ramp',
    );
    expect(pushIn(lowered)).toEqual([0.012]);
    expect(pushIn(lowered).every((push) => push >= SWAY_FLOOR)).toBe(false);
  });

  test('a smoothstep that falls from its first edge to its second is refused', () => {
    expect(
      unorderedEdges(
        'float a = smoothstep(0.47, 0.4, uv.y); float b = 1.0 - smoothstep(0.4, 0.47, max(uv.x, 0.2)); float c = smoothstep(0.2, 0.2, l);',
      ),
    ).toEqual(['smoothstep(0.47, 0.4, …)', 'smoothstep(0.2, 0.2, …)']);
  });
});
