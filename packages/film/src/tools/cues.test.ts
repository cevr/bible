// `film cues --short <id>`: each span's film time and its time in the short,
// then the short's length, on whole frames at the rate its page declares.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { layout } from '../core/layout.ts';
import type { Short } from '../core/schema.ts';
import { resolveShort } from '../core/shorts.ts';
import { shortReport } from './cues.ts';

const draw = () => {};
const placed = Result.getOrThrow(
  layout(
    [
      { id: 'a', say: 'One two {three}three four {five}five six.', draw },
      { id: 'b', say: 'Seven {eight}eight nine ten.', draw },
    ],
    { voice: '', scenes: {} },
  ),
);

const cut: Short = {
  id: 'cut',
  title: 'A cut',
  spans: [
    { scene: 'b', from: { mark: 'eight' }, to: { at: 'speechEnd' } },
    { scene: 'a', from: { at: 'start' }, to: { mark: 'three' } },
  ],
};

describe('shortReport', () => {
  test("prints each span's film time, its time in the short, and the length", () => {
    const lines = shortReport(Result.getOrThrow(resolveShort(placed, cut, 30)));
    expect(lines[0]).toBe('short cut "A cut" at 30 fps');
    expect(lines[1]).toMatch(
      /^ {2}1 b {11}film +\d+\.\d{3}–\d+\.\d{3} {2}short +0\.000–\d+\.\d{3} {2}\(\d+\.\d{2}s\)$/,
    );
    expect(lines[2]).toMatch(/^ {2}2 a {11}film +0\.000–/);
    expect(lines[3]).toMatch(/^length \d+\.\d{2}s$/);
  });

  test('prints the short on the frames it was resolved on', () => {
    const at24 = Result.getOrThrow(resolveShort(placed, cut, 24));
    const lines = shortReport(at24);
    expect(lines[0]).toBe('short cut "A cut" at 24 fps');
    expect(lines[3]).toBe(`length ${at24.duration.toFixed(2)}s`);
  });
});
