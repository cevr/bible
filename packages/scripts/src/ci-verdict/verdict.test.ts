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

/** A job of `steps`, timed from its first step's start to its last step's end. */
const job = (name: string, conclusion: string, steps: ReadonlyArray<ReturnType<typeof step>>) => ({
  name,
  conclusion,
  startedAt: steps[0]?.startedAt ?? '2026-09-30T20:05:14Z',
  completedAt: steps.at(-1)?.completedAt ?? '2026-09-30T20:05:20Z',
  steps,
});

describe("CI's verdict", () => {
  test('a red run names its run, its commit, the jobs that failed and the step each stopped in', () => {
    const jobs: GateJobs = {
      jobs: [
        job('style', 'success', [step('Run bun run guard', 'success')]),
        job('test (film 1/3)', 'failure', [
          step('Run ./.github/actions/setup', 'success'),
          step(
            'Run bun x turbo run test',
            'failure',
            '2026-09-30T18:40:57Z',
            '2026-09-30T18:41:44Z',
          ),
        ]),
        // Run 36769762208: the job's 20 minutes ran out inside the apt install.
        job('test (animations)', 'cancelled', [
          step('Run ./.github/actions/setup', 'success', '2026-09-30T20:04:54Z'),
          step('Install ffmpeg', 'cancelled', '2026-09-30T20:05:14Z', '2026-09-30T20:22:10Z'),
          step('Install Chromium', 'skipped', '2026-09-30T20:22:10Z', '2026-09-30T20:22:10Z'),
        ]),
      ],
    };
    expect(passed(RED)).toBe(false);
    expect(verdictLine(RED, failedJobs(jobs))).toBe(
      'ci failure run=36760052995 sha=2417cadf failed="test (film 1/3) in Run bun x turbo run test: failure after 47 s, test (animations) in Install ffmpeg: cancelled after 1016 s (job 1036 s)" https://github.com/cevr/bible/actions/runs/36760052995',
    );
  });

  // Run 36780178389: the job's clock ran out in Install Chromium, but Install ffmpeg had spent it.
  test('a cancelled job names its time and the step that spent it, not only the one it stopped in', () => {
    const jobs: GateJobs = {
      jobs: [
        job('test (film 2/3)', 'cancelled', [
          step('Set up job', 'success', '2026-09-30T21:33:22Z', '2026-09-30T21:33:23Z'),
          step(
            'Run ./.github/actions/setup',
            'success',
            '2026-09-30T21:34:00Z',
            '2026-09-30T21:34:22Z',
          ),
          step('Install ffmpeg', 'success', '2026-09-30T21:34:22Z', '2026-09-30T21:51:57Z'),
          step('Install Chromium', 'cancelled', '2026-09-30T21:51:59Z', '2026-09-30T21:53:35Z'),
          step('Complete job', 'success', '2026-09-30T21:53:35Z', '2026-09-30T21:53:36Z'),
        ]),
      ],
    };
    expect(failedJobs(jobs)).toEqual([
      'test (film 2/3) in Install Chromium: cancelled after 96 s (job 1214 s; slowest Install ffmpeg 1055 s)',
    ]);
  });

  test('a job that failed before any step names only itself', () => {
    const jobs: GateJobs = { jobs: [job('perf', 'failure', [])] };
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
