// Where a press on a cue's bar grabs it: its body moves the offset, its edges
// set start or end. A bar too short to hold two edges and a body is all body,
// so a short cue can always be moved; alt on it grabs the end instead.

import { describe, expect, test } from 'bun:test';
import { EDGE_PX, dragModeAt } from './lab-edit.ts';

describe('dragModeAt', () => {
  test('a long bar: left edge, body, right edge', () => {
    expect(dragModeAt(2, 100, false)).toBe('start');
    expect(dragModeAt(50, 100, false)).toBe('move');
    expect(dragModeAt(97, 100, false)).toBe('end');
  });

  test('a short bar is all body, wherever it is pressed', () => {
    const width = EDGE_PX * 3 - 1;
    for (const x of [0, width / 2, width - 1]) expect(dragModeAt(x, width, false)).toBe('move');
  });

  test('alt on a short bar grabs its end', () => {
    expect(dragModeAt(EDGE_PX, EDGE_PX * 2, true)).toBe('end');
  });
});
