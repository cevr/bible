// The command surfaces' stylesheet: a rule that places a thing by another's
// edge (`anchor()`, `anchor-size()`) stands inside `@supports (anchor-name: …)`,
// so a browser without anchor positioning drops the whole rule and keeps the
// thing where the unanchored rules put it, not at `bottom: auto`.

import { describe, expect, test } from 'bun:test';
import { COMMAND_CSS } from './style.ts';

/** The declarations that call `anchor(` or `anchor-size(` outside every `@supports` block. */
const unguarded = (source: string): ReadonlyArray<string> => {
  const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
  const found: Array<string> = [];
  const preludes: Array<string> = [];
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      preludes.push(css.slice(start, i).trim());
      start = i + 1;
    } else if (c === '}') {
      const body = css.slice(start, i);
      if (/\banchor(?:-size)?\(/.test(body) && !preludes.some((p) => p.startsWith('@supports')))
        found.push(`${preludes.at(-1) ?? ''} { ${body.trim()} }`);
      preludes.pop();
      start = i + 1;
    }
  }
  return found;
};

describe('the command surfaces stylesheet', () => {
  test('places nothing by an anchor outside @supports', () => {
    expect(unguarded(COMMAND_CSS)).toEqual([]);
  });

  test('finds an anchored rule outside @supports (the control)', () => {
    const css = '@media (max-width: 1px) { .a { bottom: calc(anchor(top) + 1px); } }';
    expect(unguarded(css)).toHaveLength(1);
    expect(
      unguarded(
        '@supports (anchor-name: --a) { @media (max-width: 1px) { .a { bottom: anchor(top); } } }',
      ),
    ).toEqual([]);
  });
});
