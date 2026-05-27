import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression: the <main> element's ref must defer setScrollEl by one animation
// frame. Without the defer, BookFeed's virtualizer attaches its ResizeObserver
// to a 0×0 element, caches the zero rect, and renders an empty <For> loop —
// the "blank reader on refresh" bug.
//
// We don't have jsdom in this suite (component tests run via SSR which skips
// refs and effects), so this is a source-shape assertion. It's strong enough
// to catch the regression: any reordering that drops the rAF wrapper will
// trip it. If the ref shape changes legitimately (e.g., switches to a
// different deferral mechanism), update this test alongside the change.

const source = readFileSync(resolve(__dirname, '../src/components/reader-pane.tsx'), 'utf-8');

describe('ReaderPane scrollEl ref', () => {
  it('wraps setScrollEl in requestAnimationFrame', () => {
    const refMatch = source.match(/ref=\{\(el\) => \{([\s\S]*?)\}\}/);
    expect(refMatch, 'expected a ref={(el) => {...}} on <main>').not.toBeNull();
    const refBody = refMatch![1]!;
    expect(refBody).toMatch(/requestAnimationFrame\(\s*\(\s*\)\s*=>\s*\{[\s\S]*setScrollEl\(el\)/);
  });

  it('does not call setScrollEl synchronously outside the rAF callback', () => {
    const refMatch = source.match(/ref=\{\(el\) => \{([\s\S]*?)\}\}/);
    const refBody = refMatch![1]!;
    // Strip the rAF callback body; what remains must not call setScrollEl.
    const withoutRaf = refBody.replace(
      /requestAnimationFrame\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*;?/g,
      '',
    );
    expect(withoutRaf).not.toMatch(/setScrollEl\(/);
  });
});
