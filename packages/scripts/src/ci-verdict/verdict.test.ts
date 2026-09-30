import { describe, expect, test } from 'bun:test';

import { type GateRun, failedJobs, passed, verdictLine } from './verdict.js';

const RED: GateRun = {
  databaseId: 36760052995,
  status: 'completed',
  conclusion: 'failure',
  headSha: '2417cadf6a89e7aa470af188f7c8e4a6d2b9701d',
  url: 'https://github.com/cevr/bible/actions/runs/36760052995',
};

describe("CI's verdict", () => {
  test('a red run names its run, its commit and the jobs that failed', () => {
    const jobs = {
      jobs: [
        { name: 'style', conclusion: 'success' },
        { name: 'test (film 1/3)', conclusion: 'failure' },
        { name: 'test (animations)', conclusion: 'cancelled' },
      ],
    };
    expect(passed(RED)).toBe(false);
    expect(verdictLine(RED, failedJobs(jobs))).toBe(
      'ci failure run=36760052995 sha=2417cadf failed="test (film 1/3), test (animations)" https://github.com/cevr/bible/actions/runs/36760052995',
    );
  });

  test('a green run passes; a run still going has not, and says so', () => {
    const green = { ...RED, conclusion: 'success' };
    expect(passed(green)).toBe(true);
    expect(verdictLine(green, [])).toBe(
      'ci success run=36760052995 sha=2417cadf https://github.com/cevr/bible/actions/runs/36760052995',
    );
    const going = { ...RED, status: 'in_progress', conclusion: '' };
    expect(passed(going)).toBe(false);
    expect(verdictLine(going, [])).toStartWith('ci in_progress run=');
  });

  test('a cancelled run has not passed', () => {
    expect(passed({ ...RED, conclusion: 'cancelled' })).toBe(false);
  });
});
