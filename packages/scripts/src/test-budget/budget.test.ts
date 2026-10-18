import { describe, expect, test } from 'bun:test';
import { judge } from './budget.js';

const quiet = { one: 3.2, five: 2.8 };
const busy = { one: 14.6, five: 9.1 };
const cores = 12;

describe("the tests' time budget, each workspace alone", () => {
  test('workspaces each under budget pass, printing each time with the load and the cores', () => {
    const judged = judge({
      workspaces: [
        { name: '@bible/core', ms: 4_200, exitCode: 0 },
        { name: '@bible/film', ms: 6_100, exitCode: 0 },
      ],
      load: quiet,
      cores,
    });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report).toEqual([
      '',
      'test:budget: each workspace alone, under 10.0 s (load average 3.2 over 1 min and 2.8 over 5 min before them, on 12 cores)',
      '    6.1 s  @bible/film',
      '    4.2 s  @bible/core',
    ]);
  });

  test('one workspace over budget on a machine at or below its cores fails, naming it alone', () => {
    for (const load of [quiet, { one: cores, five: cores }]) {
      const judged = judge({
        workspaces: [
          { name: '@bible/core', ms: 4_200, exitCode: 0 },
          { name: '@bible/film', ms: 12_300, exitCode: 0 },
        ],
        load,
        cores,
      });
      expect(judged.code).toBe(1);
      expect(judged.failure[0]).toBe('test:budget: over budget: @bible/film 12.3 s.');
    }
  });

  test('a workspace at exactly 10,000 ms is over budget: the budget is under 10 s', () => {
    const judged = judge({
      workspaces: [
        { name: '@bible/core', ms: 9_999, exitCode: 0 },
        { name: '@bible/film', ms: 10_000, exitCode: 0 },
      ],
      load: quiet,
      cores,
    });
    expect(judged.code).toBe(1);
    expect(judged.failure[0]).toBe('test:budget: over budget: @bible/film 10.0 s.');
  });

  test('workspaces whose times sum past the budget, each under it, pass: the run states no total', () => {
    const judged = judge({
      workspaces: [
        { name: '@bible/core', ms: 6_000, exitCode: 0 },
        { name: '@bible/film', ms: 9_400, exitCode: 0 },
        { name: '@bible/scripts', ms: 8_800, exitCode: 0 },
      ],
      load: quiet,
      cores,
    });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report.filter((line) => /total|bun run test|24\.2/.test(line))).toEqual([]);
  });

  test('a machine busier than its cores measures nothing: the run says so and passes, over budget or not', () => {
    for (const ms of [4_200, 14_000]) {
      const judged = judge({
        workspaces: [{ name: '@bible/film', ms, exitCode: 0 }],
        load: busy,
        cores,
      });
      expect(judged.code).toBe(0);
      expect(judged.failure).toEqual([]);
      expect(judged.report.at(-1)).toBe(
        'test:budget: not measured (load average 14.6 over 1 min and 9.1 over 5 min, on 12 cores)',
      );
    }
  });

  test('a lull in a busy period measures nothing: the 5-minute average above the cores holds the run', () => {
    const judged = judge({
      workspaces: [{ name: '@bible/film', ms: 11_300, exitCode: 0 }],
      load: { one: 4.9, five: 19.1 },
      cores,
    });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report.at(-1)).toBe(
      'test:budget: not measured (load average 4.9 over 1 min and 19.1 over 5 min, on 12 cores)',
    );
  });

  test('a workspace whose tests fail fails the run at any load, named with its exit code', () => {
    for (const load of [quiet, busy]) {
      const judged = judge({
        workspaces: [
          { name: '@bible/core', ms: 4_200, exitCode: 0 },
          { name: '@bible/cli', ms: 2_400, exitCode: 1 },
        ],
        load,
        cores,
      });
      expect(judged.code).toBe(1);
      expect(judged.failure).toEqual(['test:budget: tests failed: @bible/cli (exit 1).']);
    }
  });
});
