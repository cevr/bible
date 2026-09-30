// A film's page reads its narration where the tools write it, by the film's
// id; a film with no timings yet is laid out on estimates, as the tools lay
// it out, and a timings file the page cannot fetch or read fails, naming it.

import { describe, expect, test } from 'bun:test';
import { type Fetch, NO_TAKES, loadNarrated, narrationUrls } from './narrated.ts';

const TIMINGS = JSON.stringify({ voice: 'v', scenes: {} });

/** A fetch that answers every URL with `status` and `body`, and notes what it was asked. */
const answering = (status: number, body = '') => {
  const asked: string[] = [];
  const get: Fetch = (url) => {
    asked.push(url);
    return Promise.resolve({ ok: status < 400, status, text: () => Promise.resolve(body) });
  };
  return { get, asked };
};

describe('loadNarrated', () => {
  test("reads the film's timings by its id, and names its master beside them", async () => {
    const { get, asked } = answering(200, TIMINGS);
    const narrated = await loadNarrated('rbf', get);
    expect(asked).toEqual(['/films/rbf/narration/timings.json']);
    expect(narrated).toEqual({
      timings: { voice: 'v', scenes: {} },
      audio: narrationUrls('rbf').audio,
    });
  });

  test('a film with no timings file yet is laid out on estimates, as the tools read it', async () => {
    expect((await loadNarrated('rbf', answering(404).get)).timings).toEqual(NO_TAKES);
  });

  test.each([
    ['a server error', answering(500).get],
    ['a file that is not timings', answering(200, '{"voice": 3}').get],
    ['a fetch that fails', (() => Promise.reject(new TypeError('offline'))) satisfies Fetch],
  ])('%s fails, naming the film and the file, never estimates', async (_, get) => {
    await expect(loadNarrated('rbf', get)).rejects.toMatchObject({
      _tag: 'NarrationUnreadable',
      film: 'rbf',
      url: '/films/rbf/narration/timings.json',
    });
  });
});
