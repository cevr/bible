import { describe, expect, test } from 'bun:test';

import { type GateJobs, type GateRun, failedJobs, passed, verdictLine } from './verdict.js';

const RED: GateRun = {
  databaseId: 36760052995,
  status: 'completed',
  conclusion: 'failure',
  headSha: '2417cadf6a89e7aa470af188f7c8e4a6d2b9701d',
  url: 'https://github.com/cevr/bible/actions/runs/36760052995',
};

const step = (
  name: string,
  conclusion: string,
  startedAt = '2026-09-30T20:05:14Z',
  completedAt = '2026-09-30T20:05:20Z',
) => ({ name, conclusion, startedAt, completedAt });

describe("CI's verdict", () => {
  test('a red run names its run, its commit, the jobs that failed and the step each stopped in', () => {
    const jobs: GateJobs = {
      jobs: [
        { name: 'style', conclusion: 'success', steps: [step('Run bun run guard', 'success')] },
        {
          name: 'test (film 1/3)',
          conclusion: 'failure',
          steps: [
            step('Run ./.github/actions/setup', 'success'),
            step(
              'Run bun x turbo run test',
              'failure',
              '2026-09-30T18:40:57Z',
              '2026-09-30T18:41:44Z',
            ),
          ],
        },
        // Run 36769762208: the job's 20 minutes ran out inside the apt install.
        {
          name: 'test (animations)',
          conclusion: 'cancelled',
          steps: [
            step('Run ./.github/actions/setup', 'success'),
            step('Install ffmpeg', 'cancelled', '2026-09-30T20:05:14Z', '2026-09-30T20:22:10Z'),
            step('Install Chromium', 'skipped'),
          ],
        },
      ],
    };
    expect(passed(RED)).toBe(false);
    expect(verdictLine(RED, failedJobs(jobs))).toBe(
      'ci failure run=36760052995 sha=2417cadf failed="test (film 1/3) in Run bun x turbo run test: failure after 47 s, test (animations) in Install ffmpeg: cancelled after 1016 s" https://github.com/cevr/bible/actions/runs/36760052995',
    );
  });

  test('a job that failed before any step names only itself', () => {
    const jobs: GateJobs = { jobs: [{ name: 'perf', conclusion: 'failure', steps: [] }] };
    expect(verdictLine(RED, failedJobs(jobs))).toContain('failed="perf"');
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
