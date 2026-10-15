import { describe, expect, test } from 'bun:test';
import { workersFor } from './workers.ts';

describe("the e2e suite's workers", () => {
  test('on a shared machine, the cores free when it starts: at least 2, at most the cores', () => {
    expect(workersFor({ cores: 12, load: 0.4, ci: false })).toBe(11);
    expect(workersFor({ cores: 12, load: 6.1, ci: false })).toBe(5);
    expect(workersFor({ cores: 12, load: 25.6, ci: false })).toBe(2);
    expect(workersFor({ cores: 12, load: 0, ci: false })).toBe(12);
  });

  test("on CI, the runner is the suite's own: at most 8, at most the cores, whatever the load", () => {
    expect(workersFor({ cores: 4, load: 3.9, ci: true })).toBe(4);
    expect(workersFor({ cores: 16, load: 0, ci: true })).toBe(8);
  });
});
