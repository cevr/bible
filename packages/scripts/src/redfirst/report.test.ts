import { describe, expect, test } from 'bun:test';

import {
  caseKey,
  caseSpans,
  casesOf,
  changesOf,
  diffLines,
  newOrChanged,
  reportLines,
  unloaded,
} from './report.js';

// What `bun test --reporter=junit` writes, trimmed to what the report reads.
const JUNIT = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3">
  <testsuite name="src/core/api.test.ts" file="src/core/api.test.ts" tests="3">
    <testsuite name="card anchor" file="src/core/api.test.ts" line="10" tests="3">
      <testcase name="is not old" classname="card anchor" file="src/core/api.test.ts" line="11" assertions="2" />
      <testcase name="names the card&apos;s point" classname="card anchor" file="src/core/api.test.ts" line="20" assertions="1">
        <failure type="AssertionError" />
      </testcase>
      <testcase name="later" classname="card anchor" file="src/core/api.test.ts" line="30">
        <skipped />
      </testcase>
    </testsuite>
  </testsuite>
</testsuites>`;

const FILE = 'packages/film/src/core/api.test.ts';

describe('redfirst', () => {
  test('the cases of a junit report carry their file from the repo root, line, name and verdict', () => {
    expect(casesOf(JUNIT, 'packages/film/')).toEqual([
      { file: FILE, line: 11, name: 'card anchor > is not old', passed: true },
      { file: FILE, line: 20, name: "card anchor > names the card's point", passed: false },
      { file: FILE, line: 30, name: 'card anchor > later', passed: false },
    ]);
  });

  test('the lines a diff added are numbered in the new file', () => {
    const diff = [
      `diff --git a/${FILE} b/${FILE}`,
      `--- a/${FILE}`,
      `+++ b/${FILE}`,
      '@@ -12,0 +13,2 @@ describe',
      "+    expect(cardAnchor('#point-%')).toEqual(Option.none());",
      "+    expect(cardAnchor('#point-%E0%A4%A')).toEqual(Option.none());",
      '@@ -40 +42 @@',
      '-  old',
      '+  new',
    ].join('\n');
    expect([...diffLines(diff).added]).toEqual([13, 14, 42]);
  });

  test('a case is new when the base lacks it and changed when the diff touched its lines', () => {
    const old = { file: FILE, line: 11, name: 'a > old', passed: true };
    const touchedCase = { file: FILE, line: 20, name: 'a > new', passed: true };
    const untouched = { file: FILE, line: 30, name: 'a > untouched', passed: true };
    const head = [old, touchedCase, untouched];
    const base = new Set([caseKey(old), caseKey(untouched)]);
    const spans = [
      { from: 11, to: 15 },
      { from: 20, to: 25 },
      { from: 30, to: 32 },
    ];
    // Line 13 sits in the first case's span: it is changed; line 17 in none.
    expect(
      newOrChanged(
        head,
        base,
        new Map([[FILE, { added: new Set([13]), gaps: new Set<number>(), spans }]]),
      ),
    ).toEqual([old, touchedCase]);
    expect(
      newOrChanged(
        head,
        base,
        new Map([[FILE, { added: new Set([17]), gaps: new Set<number>(), spans }]]),
      ),
    ).toEqual([touchedCase]);
  });

  test('a hunk that only deletes lines touches the case it sits inside, and none between two cases', () => {
    const diff = [
      `diff --git a/${FILE} b/${FILE}`,
      `--- a/${FILE}`,
      `+++ b/${FILE}`,
      '@@ -14 +13,0 @@ describe',
      '-    expect(cardAnchor(lost)).toEqual(Option.none());',
      '@@ -27,4 +25,0 @@',
      "-  test('gone', () => {",
      '-    expect(1).toBe(1);',
      '-  });',
      '-',
    ].join('\n');
    const { added, gaps } = diffLines(diff);
    expect([...added]).toEqual([]);
    // Lines went between new lines 13 and 14, and between 25 and 26.
    expect([...gaps]).toEqual([13, 25]);
    const weakened = { file: FILE, line: 11, name: 'a > weakened', passed: true };
    const before = { file: FILE, line: 20, name: 'a > before the gone case', passed: true };
    const after = { file: FILE, line: 26, name: 'a > after the gone case', passed: true };
    const head = [weakened, before, after];
    const spans = [
      { from: 11, to: 15 },
      { from: 20, to: 25 },
      { from: 26, to: 28 },
    ];
    expect(
      newOrChanged(head, new Set(head.map(caseKey)), new Map([[FILE, { added, gaps, spans }]])),
    ).toEqual([weakened]);
  });

  test("a renamed file is run at its new path and its base's cases read at its old one", () => {
    const status = [
      'M\tpackages/film/src/core/api.test.ts',
      'R087\tpackages/film/src/core/old.test.ts\tpackages/film/src/core/new.test.ts',
      'A\tpackages/film/src/core/added.test.ts',
      'D\tpackages/film/src/core/gone.test.ts',
    ].join('\n');
    expect(changesOf(status)).toEqual([
      {
        status: 'M',
        file: 'packages/film/src/core/api.test.ts',
        from: 'packages/film/src/core/api.test.ts',
      },
      {
        status: 'R',
        file: 'packages/film/src/core/new.test.ts',
        from: 'packages/film/src/core/old.test.ts',
      },
      {
        status: 'A',
        file: 'packages/film/src/core/added.test.ts',
        from: 'packages/film/src/core/added.test.ts',
      },
      {
        status: 'D',
        file: 'packages/film/src/core/gone.test.ts',
        from: 'packages/film/src/core/gone.test.ts',
      },
    ]);
  });

  test("a test.each's span is its title and body, the table left out", () => {
    const text = [
      "describe('old links', () => {", // 1
      '  test.each([', // 2
      "    '/',", // 3
      "    '/films/rbf/export',", // 4
      "  ])('%s is not old', (href) => {", // 5
      '    expect(legacyPlace(href)).toEqual(Option.none());', // 6
      '  });', // 7
      '', // 8
      "  test('every old link lands on a page', () => {", // 9
      '    expect(1).toBe(1);', // 10
      '  });', // 11
      '});', // 12
    ].join('\n');
    expect(caseSpans('a.test.ts', text)).toEqual([
      { from: 5, to: 7 },
      { from: 9, to: 11 },
    ]);
  });

  test('the report names each new or changed case green on the base, then counts', () => {
    const cases = casesOf(JUNIT, 'packages/film/').slice(0, 2);
    expect(
      reportLines('986a10067..bc84613b4', cases, {
        skipped: [
          {
            file: 'packages/film/src/lab/player/media.dom.test.ts',
            why: 'a browser tier: run it by hand',
          },
          { file: 'packages/film/src/core/gone.test.ts', why: 'deleted: its cases are gone' },
        ],
        unloaded: ['packages/film/src/core/segment.test.ts'],
      }),
    ).toEqual([
      'redfirst packages/film/src/lab/player/media.dom.test.ts not run (a browser tier: run it by hand)',
      'redfirst packages/film/src/core/gone.test.ts not run (deleted: its cases are gone)',
      'redfirst packages/film/src/core/segment.test.ts red whole: no case ran on the base',
      `redfirst green on base: ${FILE}:11 card anchor > is not old`,
      'redfirst 986a10067..bc84613b4 cases=2 red=1 green=1',
    ]);
  });

  test('a test file that answered no case is red whole', () => {
    const cases = casesOf(JUNIT, 'packages/film/');
    expect(unloaded([FILE, 'packages/film/src/core/segment.test.ts'], cases)).toEqual([
      'packages/film/src/core/segment.test.ts',
    ]);
  });
});
