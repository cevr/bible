import { describe, expect, test } from 'bun:test';
import { judge } from './budget.js';

const quick = [
  { name: '@bible/core#test', ms: 4_200 },
  { name: '@bible/film#test', ms: 6_100 },
];
const slow = [
  { name: '@bible/core#test', ms: 4_200 },
  { name: '@bible/film#test', ms: 12_300 },
];

describe("the tests' time budget", () => {
  test('a run under budget passes, printing each time with the load and the cores', () => {
    const judged = judge({ tasks: quick, wall: 7_000, load: 3.2, cores: 12 });
    expect(judged.code).toBe(0);
    expect(judged.failure).toEqual([]);
    expect(judged.report).toEqual([
      '',
      'test:budget: under 10.0 s each (load average 3.2 before it, on 12 cores)',
      '    6.1 s  @bible/film#test',
      '    4.2 s  @bible/core#test',
      '    7.0 s  bun run test',
    ]);
  });

  test('a run over budget on a machine at or below its cores fails, naming what ran over', () => {
    for (const load of [3.2, 12]) {
      const judged = judge({ tasks: slow, wall: 13_000, load, cores: 12 });
      expect(judged.code).toBe(1);
      expect(judged.failure[0]).toBe(
        'test:budget: over budget: @bible/film#test 12.3 s, bun run test 13.0 s.',
      );
    }
  });

  test('a machine busier than its cores measures nothing: the run says so and passes, over budget or not', () => {
    for (const tasks of [quick, slow]) {
      const judged = judge({ tasks, wall: 13_000, load: 14.6, cores: 12 });
      expect(judged.code).toBe(0);
      expect(judged.failure).toEqual([]);
      expect(judged.report.at(-1)).toBe('test:budget: not measured (load 14.6 on 12 cores)');
    }
  });
});
