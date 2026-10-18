import { describe, expect, test } from 'bun:test';
import { judge } from './budget.js';

const quiet = 3.2;
const cores = 12;

describe("the tests' time budget, each workspace alone", () => {
  test('workspaces each under budget pass, printing each time with the load before it', () => {
    const judged = judge({
      workspaces: [
        { name: '@bible/core', ms: 4_200, load: quiet, exitCode: 0 },
        { name: '@bible/film', ms: 6_100, load: 3.5, exitCode: 0 },
      ],
      cores,
    });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report).toEqual([
      '',
      'test:budget: each workspace alone, under 10.0 s (on 12 cores)',
      '    6.1 s  @bible/film  (load 3.5)',
      '    4.2 s  @bible/core  (load 3.2)',
    ]);
  });

  test('one workspace over budget on a machine at or below its cores fails, naming it alone', () => {
    for (const load of [quiet, cores]) {
      const judged = judge({
        workspaces: [
          { name: '@bible/core', ms: 4_200, load, exitCode: 0 },
          { name: '@bible/film', ms: 12_300, load, exitCode: 0 },
        ],
        cores,
      });
      expect(judged.code).toBe(1);
      expect(judged.failure[0]).toBe('test:budget: over budget: @bible/film 12.3 s.');
    }
  });

  test('workspaces whose times sum past the budget, each under it, pass: the run states no total', () => {
    const judged = judge({
      workspaces: [
        { name: '@bible/core', ms: 6_000, load: quiet, exitCode: 0 },
        { name: '@bible/film', ms: 9_400, load: quiet, exitCode: 0 },
        { name: '@bible/scripts', ms: 8_800, load: quiet, exitCode: 0 },
      ],
      cores,
    });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report.filter((line) => /total|bun run test|24\.2/.test(line))).toEqual([]);
  });

  test('a workspace timed on a machine busier than its cores is not measured, over budget or not; the rest are judged', () => {
    const judged = judge({
      workspaces: [
        { name: '@bible/core', ms: 4_200, load: quiet, exitCode: 0 },
        { name: '@bible/film', ms: 14_000, load: 14.6, exitCode: 0 },
      ],
      cores,
    });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report).toContain('   14.0 s  @bible/film  not measured (load 14.6 on 12 cores)');
    expect(judged.report.at(-1)).toBe(
      'test:budget: not measured: @bible/film; measure it again on a quiet machine.',
    );

    const busyAndSlow = judge({
      workspaces: [
        { name: '@bible/core', ms: 11_000, load: quiet, exitCode: 0 },
        { name: '@bible/film', ms: 14_000, load: 14.6, exitCode: 0 },
      ],
      cores,
    });
    expect(busyAndSlow.code).toBe(1);
    expect(busyAndSlow.failure[0]).toBe('test:budget: over budget: @bible/core 11.0 s.');
  });

  test('a workspace whose tests fail fails the run at any load, named with its exit code', () => {
    for (const load of [quiet, 14.6]) {
      const judged = judge({
        workspaces: [
          { name: '@bible/core', ms: 4_200, load: quiet, exitCode: 0 },
          { name: '@bible/cli', ms: 2_400, load, exitCode: 1 },
        ],
        cores,
      });
      expect(judged.code).toBe(1);
      expect(judged.failure).toContain('test:budget: tests failed: @bible/cli (exit 1).');
    }
  });
});
