// The film's roll (the framework's `creditRoll`, `canvas/credits.test.ts`) names
// each work once and leaves no locator on a line alone.

import { describe, expect, test } from 'bun:test';
import { CREDIT_MEASURE } from '@bible/film/canvas';
import { CREDITS } from '../src/films/righteousness-by-faith/credits.ts';

describe('righteousness-by-faith credits', () => {
  test("the film's roll names each work once and leaves no locator alone on a line", () => {
    const lines = CREDITS.filter((c) => c.kind === 'item').map((c) => c.text);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(CREDIT_MEASURE);
      expect(line).not.toMatch(/^[\d–, ]+$/);
    }
    for (const title of ['Steps to Christ', "Christ's Object Lessons", 'Letter 57, 1895'])
      expect(lines.filter((l) => l.startsWith(title))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('Present Truth'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('Righteousness, '))).toHaveLength(1);
  });
});
