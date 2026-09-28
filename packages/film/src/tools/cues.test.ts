// `film cues --short <id>`: each span's film time and its time in the short,
// then the short's length, on whole frames at the film's rate.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import { layout } from '../core/layout.ts';
import { shortReport } from './cues.ts';

const draw = () => {};
const placed = layout(
  [
    { id: 'a', say: 'One two {three}three four {five}five six.', draw },
    { id: 'b', say: 'Seven {eight}eight nine ten.', draw },
  ],
  { voice: '', scenes: {} },
);

describe('shortReport', () => {
  test("prints each span's film time, its time in the short, and the length", () => {
    const lines = Result.getOrThrow(
      shortReport(
        placed,
        {
          id: 'cut',
          title: 'A cut',
          spans: [
            { scene: 'b', from: { mark: 'eight' }, to: { scene: 'speechEnd' } },
            { scene: 'a', from: { scene: 'start' }, to: { mark: 'three' } },
          ],
        },
        30,
      ),
    );
    expect(lines[0]).toBe('short cut "A cut" at 30 fps');
    expect(lines[1]).toMatch(
      /^ {2}1 b {11}film +\d+\.\d{3}–\d+\.\d{3} {2}short +0\.000–\d+\.\d{3} {2}\(\d+\.\d{2}s\)$/,
    );
    expect(lines[2]).toMatch(/^ {2}2 a {11}film +0\.000–/);
    expect(lines[3]).toMatch(/^length \d+\.\d{2}s$/);
  });

  test('fails naming a mark the scene lacks', () => {
    const r = shortReport(
      placed,
      {
        id: 'cut',
        title: 'A cut',
        spans: [{ scene: 'a', from: { mark: 'x' }, to: { scene: 'end' } }],
      },
      30,
    );
    expect(Result.isFailure(r) && r.failure._tag).toBe('ShortUnknownMark');
  });
});
