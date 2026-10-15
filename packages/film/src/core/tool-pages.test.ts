// A tool's answer within its budget: a check's findings a page at a time,
// errors first, each page under 8,000 characters of JSON, and a page asked of
// a report whose findings changed since started again, saying so; a film's
// cue lines whole, a line longer than an answer read on by its column across
// calls; a journal's newest entries that fit, the rest counted with the file.

import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import type { CheckLine } from './schema.ts';
import {
  CheckPage,
  CuesPage,
  JournalPage,
  checkPage,
  cuesPage,
  journalPage,
} from './tool-pages.ts';

/** A page asked for, from an answer's `next`. */
type CheckAt = Parameters<typeof checkPage>[1];
type CuesAt = Parameters<typeof cuesPage>[2];

const checkJson = Schema.encodeSync(Schema.fromJsonString(CheckPage));
const cuesJson = Schema.encodeSync(Schema.fromJsonString(CuesPage));
const journalJson = Schema.encodeSync(Schema.fromJsonString(JournalPage));

/** A finding's level by its place: errors and warnings in turn. */
const LEVELS = ['error', 'warning'] as const;

/** A finding of scene `roof` at film second `index`. */
const finding = (index: number, level: CheckLine['level'], message: string): CheckLine => ({
  level,
  tag: `Finding${index}`,
  message,
  address: { part: { _tag: 'Scenes', ids: ['roof'] }, time: index },
});

describe('checkPage', () => {
  test('24 long findings come a page at a time, errors first, each page under 8,000 characters', () => {
    // Quotes, which JSON escapes: a page is measured as it is sent.
    const lines = Array.from({ length: 24 }, (_, index) =>
      finding(index, LEVELS[index % 2] ?? 'error', `"${'q"'.repeat(600)}"`),
    );
    const tags: Array<string> = [];
    let at: CheckAt = {};
    for (let page = 0; page < 30; page += 1) {
      const answer = checkPage(lines, at);
      expect(checkJson(answer).length).toBeLessThanOrEqual(8_000);
      expect([answer.errors, answer.warnings]).toEqual([12, 12]);
      expect(answer.restarted).toBeUndefined();
      expect(answer.findings.every((found) => found.where === 'scenes:roof')).toBe(true);
      tags.push(...answer.findings.map((found) => found.tag));
      const next = Option.fromUndefinedOr(answer.next);
      if (Option.isNone(next)) break;
      at = next.value;
    }
    expect(tags).toHaveLength(24);
    expect(new Set(tags).size).toBe(24);
    // Errors first, in the order the check printed them.
    expect(tags.slice(0, 3)).toEqual(['Finding0', 'Finding2', 'Finding4']);
    expect(tags.at(-1)).toBe('Finding23');
  });

  test('a page asked of a report whose findings changed starts again from the first, and says so', () => {
    const before = Array.from({ length: 30 }, (_, index) =>
      finding(index, 'error', 'm'.repeat(370)),
    );
    const first = checkPage(before, {});
    expect(first.restarted).toBeUndefined();
    const count = first.findings.length;
    expect(count).toBeGreaterThan(2);
    expect(count).toBeLessThan(30);
    expect(first.next?.from).toBe(count);
    const next = first.next ?? { from: 0, report: '' };

    // Findings 0 and 1 are fixed before the next page is asked: the old place
    // would now skip the two findings after the page, still there.
    const after = before.slice(2);
    const second = checkPage(after, next);
    expect(second.restarted).toContain('changed');
    expect(second.from).toBe(0);
    const tags = second.findings.map((found) => found.tag);
    expect(tags[0]).toBe('Finding2');
    expect(tags).toContain(`Finding${count}`);
    expect(tags).toContain(`Finding${count + 1}`);

    // A finding reworded in place changes the report too, its count the same.
    const reworded = [
      ...before.slice(0, 3),
      { ...finding(3, 'error', 'reworded') },
      ...before.slice(4),
    ];
    expect(checkPage(reworded, next).restarted).toContain('changed');

    // The same report pages on from where it stopped.
    const same = checkPage(before, next);
    expect(same.restarted).toBeUndefined();
    expect(same.from).toBe(count);
    expect(same.findings[0]?.tag).toBe(`Finding${count}`);

    // A later page asked with no report could skip findings: it starts again.
    expect(checkPage(before, { from: count }).restarted).toContain('changed');
  });

  test("a finding's words and place are cut to 400 characters, saying so; one with no address is the film's", () => {
    const answer = checkPage(
      [{ level: 'warning', tag: 'MasterStale', message: 'w'.repeat(1_000) }],
      {},
    );
    expect(answer.findings[0]).toEqual({
      level: 'warning',
      tag: 'MasterStale',
      where: 'film',
      message: `${'w'.repeat(400)}… (600 more characters)`,
    });
    expect(answer.next).toBeUndefined();
  });
});

/** A scene's line as `film cues` prints it: its placement, then each mark at its second into the scene. */
const sceneLine = (id: string, marks: number) =>
  `${id.padEnd(11)} start=   0.00 dur=  9.00 speech=0.00–8.00 ${Array.from(
    { length: marks },
    (_, index) => `mark${index}@${(index / 100).toFixed(2)}`,
  ).join(' ')}`;

/**
 * Every page of `lines` read on from the first, asked with `scope`, as an
 * agent reads them: joined back into lines, with each answer's `next`.
 */
const readAll = (lines: ReadonlyArray<string>, scope: CuesAt = {}) => {
  const read: Array<string> = [];
  const rests: Array<string> = [];
  const cursors: Array<CuesAt> = [];
  let at: CuesAt = scope;
  for (let call = 0; call < 20; call += 1) {
    const answer = cuesPage(lines, Option.none(), at);
    expect(cuesJson(answer).length).toBeLessThanOrEqual(8_000);
    rests.push(...Option.toArray(Option.fromUndefinedOr(answer.rest)));
    const [first = '', ...after] = answer.lines;
    // An answer that starts inside a line goes on with that line.
    if (answer.column > 1) read.push(`${read.pop() ?? ''}${first}`, ...after);
    else read.push(first, ...after);
    const next = Option.fromUndefinedOr(answer.next);
    if (Option.isNone(next)) return { read, rests, cursors };
    cursors.push(next.value);
    at = next.value;
  }
  return { read, rests, cursors };
};

describe('cuesPage', () => {
  test('a scene of 80 marks comes whole, in one answer', () => {
    const eighty = sceneLine('roof', 80);
    expect(eighty.length).toBeGreaterThan(1_000);
    const answer = cuesPage([eighty], Option.none(), {});
    expect(answer).toEqual({ from: 1, column: 1, total: 1, lines: [eighty] });
  });

  test('a line longer than one answer comes back whole across calls, and the lines after it', () => {
    const lines = [sceneLine('gate', 3), sceneLine('roof', 900), sceneLine('end', 2)];
    const { read, rests } = readAll(lines);
    expect(read).toEqual(lines);
    expect(rests.some((rest) => rest.includes('line 2 goes on past this answer'))).toBe(true);
  });

  test("one scene's line read on: each cursor names the scene asked, so reading on stays in its line", () => {
    const roof = sceneLine('roof', 900);
    const { read, cursors } = readAll([roof], { scene: 'roof' });
    expect(read).toEqual([roof]);
    expect(cursors.length).toBeGreaterThan(0);
    expect(cursors.map((cursor) => cursor.scene)).toEqual(cursors.map(() => 'roof'));
  });

  test('never cuts between the two halves of one character', () => {
    // A face (two UTF-16 units) at every place a cut could land.
    const faces = `roof ${'🙂'.repeat(9_000)}`;
    const { read } = readAll([faces]);
    expect(read).toEqual([faces]);
  });

  test('many lines come a page at a time; `late` is said on each', () => {
    const lines = Array.from({ length: 300 }, (_, index) => sceneLine(`s${index}`, 2));
    const late = Option.some('1 cue ends after its scene');
    const first = cuesPage(lines, late, {});
    expect(first.late).toBe('1 cue ends after its scene');
    expect(first.rest).toContain('more lines left out to fit');
    expect(first.next).toEqual({ from: first.lines.length + 1, column: 1 });
    expect(cuesPage(lines, late, first.next ?? {}).late).toBe('1 cue ends after its scene');
    expect(readAll(lines).read).toEqual(lines);
  });
});

describe('journalPage', () => {
  test('the newest entries that fit, each cut to 800 characters, the rest counted with the file', () => {
    const file = '/films/f/journal.md';
    const entry = (index: number) =>
      `2026-10-14T00:00:${String(index).padStart(2, '0')}Z scene=roof ${'x'.repeat(900)}`;
    const lines = Array.from({ length: 40 }, (_, index) => entry(index));
    const answer = journalPage(file, lines, 5);
    expect(journalJson(answer).length).toBeLessThanOrEqual(8_000);
    expect(answer.lines.at(-1)).toBe(
      `${entry(39).slice(0, 800)}… (${entry(39).length - 800} more characters)`,
    );
    const shown = answer.lines.length;
    expect(shown).toBeLessThan(40);
    expect(answer.earlier).toBe(
      `${5 + 40 - shown} earlier entries not shown: ${file} holds them all`,
    );
    // Few and short: every one, and nothing said of earlier ones.
    expect(journalPage(file, ['a', 'b'], 0)).toEqual({ file, lines: ['a', 'b'] });
    expect(journalPage(file, ['a', 'b'], 3).earlier).toBe(
      `3 earlier entries not shown: ${file} holds them all`,
    );
  });
});
