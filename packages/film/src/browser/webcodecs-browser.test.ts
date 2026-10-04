// Opening the compare's renders with mediabunny owns every input from the
// moment it is made: a render that will not open, or an opening cut short
// (the Set left while the files still load), disposes every input opened for
// the compare, and with it aborts each request still in flight. Real
// mediabunny inputs over ranged URL sources, on a fetch that answers by hand.

import { describe, expect, it } from 'effect-bun-test';
import { Duration, Effect, Exit, Fiber, Option } from 'effect';
import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';
import { openRenders } from './webcodecs-browser.ts';

/** What a URL answers: bytes that are no video at once, or nothing until its request is aborted. */
type Answer = 'not-video' | 'held';

/** Inputs over a fetch answering each URL as `answers` says, recording each input and each request. */
const handFetched = (answers: Readonly<Record<string, Answer>>) => {
  const inputs: Array<Input> = [];
  const requests: Array<{ readonly url: string; readonly signal: AbortSignal }> = [];
  /** What `url` answers: bytes that are no video, or nothing until `signal` aborts. */
  const answer = (url: string, signal: AbortSignal): Effect.Effect<Response, unknown> => {
    if (answers[url] === 'not-video') {
      const bytes = new Uint8Array(4096);
      return Effect.succeed(
        new Response(bytes, {
          status: 200,
          headers: { 'content-length': String(bytes.length) },
        }),
      );
    }
    return Effect.callback<Response, unknown>((resume) => {
      signal.addEventListener('abort', () => resume(Effect.fail(signal.reason)));
    });
  };
  // mediabunny's `fetchFn` is a promise boundary: the answers are Effects run to it.
  const fetchFn: typeof fetch = Object.assign(
    (url: string | URL | Request, init: RequestInit = {}) => {
      const signal = Option.getOrElse(
        Option.fromNullishOr(init.signal),
        () => new AbortController().signal,
      );
      requests.push({ url: String(url), signal });
      return Effect.runPromise(answer(String(url), signal));
    },
    { preconnect: fetch.preconnect },
  );
  const inputOf = (url: string) => {
    const input = new Input({
      source: new UrlSource(url, { fetchFn }),
      formats: ALL_FORMATS,
    });
    inputs.push(input);
    return input;
  };
  /** Wait until each of `urls` has asked for its bytes. */
  const asked = (urls: ReadonlyArray<string>) =>
    Effect.repeat(Effect.sleep(Duration.millis(5)), {
      until: () => urls.every((u) => requests.some((r) => r.url === u)),
    });
  return { inputs, requests, inputOf, asked };
};

describe("opening the compare's renders", () => {
  it.live(
    'one that is no video fails the opening, and every input is disposed, its requests aborted',
    () =>
      Effect.gen(function* () {
        const fetched = handFetched({
          'https://lab.test/a.mp4': 'held',
          'https://lab.test/b.mp4': 'not-video',
        });
        const exit = yield* Effect.exit(
          openRenders(['https://lab.test/a.mp4', 'https://lab.test/b.mp4'], fetched.inputOf),
        );
        expect(Exit.isFailure(exit)).toBe(true);
        expect(fetched.inputs.length).toBe(2);
        expect(fetched.inputs.map((i) => i.disposed)).toEqual([true, true]);
        expect(
          fetched.requests.filter((r) => r.url.endsWith('a.mp4') && !r.signal.aborted),
        ).toEqual([]);
      }),
  );

  it.live('an opening cut short disposes every input and aborts each request in flight', () =>
    Effect.gen(function* () {
      const urls = ['https://lab.test/a.mp4', 'https://lab.test/b.mp4'];
      const fetched = handFetched({ [urls[0] ?? '']: 'held', [urls[1] ?? '']: 'held' });
      const opening = yield* Effect.forkChild(openRenders(urls, fetched.inputOf));
      yield* fetched.asked(urls);
      yield* Fiber.interrupt(opening);
      expect(fetched.inputs.map((i) => i.disposed)).toEqual([true, true]);
      expect(fetched.requests.length).toBeGreaterThanOrEqual(2);
      expect(fetched.requests.filter((r) => !r.signal.aborted)).toEqual([]);
    }),
  );
});
