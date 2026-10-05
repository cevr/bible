// Opening the compare's renders with mediabunny owns every input from the
// moment it is made: a render that will not open, or an opening cut short
// (the Set left while the files still load), disposes every input opened for
// the compare, and with it aborts each request still in flight. Real
// mediabunny inputs over ranged URL sources, on a fetch that answers by hand.
// The panes stand while the page is hidden, from the moment they are made.
// The engine a compare plays on reads the host: a phone's `Viewport` plays
// `<video>`, and a browser without WebCodecs (bun has none) does too, each
// opening nothing.

import { describe, expect, it } from 'effect-bun-test';
import { BunServices } from '@effect/platform-bun';
import {
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Layer,
  Option,
  Scope,
  Stream,
} from 'effect';
import { ALL_FORMATS, Input, UrlSource } from 'mediabunny';
import { Frames } from './frames.ts';
import { hostOf } from './host.ts';
import { Viewport } from './viewport.ts';
import { compareOn, openRenders, standWhileHidden } from './webcodecs-browser.ts';

/** What a URL answers: a short video, bytes that are no video at once, or nothing until its request is aborted. */
type Answer = 'video' | 'not-video' | 'held';

/** A short H.264 video, whole. */
const VIDEO = `${import.meta.dir}/../tools/fixtures/segment-a.mp4`;

/** `file`'s bytes in `range` (`bytes=a-b`, `b` optional), as a ranged answer. */
const ranged = (file: Blob, range: string) => {
  const [from = 0, to = file.size - 1] = (/bytes=(\d+)-(\d*)/.exec(range) ?? [])
    .slice(1)
    .filter((n) => n !== '')
    .map(Number);
  const end = Math.min(to, file.size - 1);
  return new Response(file.slice(from, end + 1), {
    status: 206,
    headers: {
      'content-range': `bytes ${from}-${end}/${file.size}`,
      'content-length': String(end + 1 - from),
    },
  });
};

/** Inputs over a fetch answering each URL as `answers` says (a video with `video`'s bytes), recording each input and each request. */
const handFetched = (answers: Readonly<Record<string, Answer>>, video: Blob = new Blob()) => {
  const inputs: Array<Input> = [];
  const requests: Array<{ readonly url: string; readonly signal: AbortSignal }> = [];
  /** What `url` answers: the video's bytes in `range`, bytes that are no video, or nothing until `signal` aborts. */
  const answer = (
    url: string,
    range: string,
    signal: AbortSignal,
  ): Effect.Effect<Response, unknown> => {
    if (answers[url] === 'video') return Effect.succeed(ranged(video, range));
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
      const range = new Headers(init.headers).get('range') ?? '';
      return Effect.runPromise(answer(String(url), range, signal));
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
          Effect.scoped(
            openRenders(['https://lab.test/a.mp4', 'https://lab.test/b.mp4'], fetched.inputOf),
          ),
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
      const opening = yield* Effect.forkChild(Effect.scoped(openRenders(urls, fetched.inputOf)));
      yield* fetched.asked(urls);
      yield* Fiber.interrupt(opening);
      expect(fetched.inputs.map((i) => i.disposed)).toEqual([true, true]);
      expect(fetched.requests.length).toBeGreaterThanOrEqual(2);
      expect(fetched.requests.filter((r) => !r.signal.aborted)).toEqual([]);
    }),
  );

  it.live('renders opened but cut short before they are taken are disposed all the same', () =>
    Effect.gen(function* () {
      const urls = ['https://lab.test/a.mp4', 'https://lab.test/b.mp4'];
      const bytes = yield* (yield* FileSystem.FileSystem).readFile(VIDEO);
      const fetched = handFetched(
        { [urls[0] ?? '']: 'video', [urls[1] ?? '']: 'video' },
        new Blob([Uint8Array.from(bytes)]),
      );
      const opened = yield* Deferred.make<void>();
      // The wipe's owner, made before the opening as the Set makes it.
      const owner = yield* Scope.make();
      // Opened, then cut short before the caller keeps them (the Set left as they open).
      const taking = yield* Effect.forkChild(
        openRenders(urls, fetched.inputOf).pipe(
          Effect.andThen(Deferred.done(opened, Exit.void)),
          Effect.andThen(Effect.never),
          Scope.provide(owner),
        ),
      );
      yield* Deferred.await(opened);
      yield* Fiber.interrupt(taking);
      yield* Scope.close(owner, Exit.void);
      expect(fetched.inputs.map((i) => i.disposed)).toEqual([true, true]);
    }).pipe(Effect.provide(BunServices.layer)),
  );
});

/** A page whose shown state is set by hand, saying so as a browser does. */
const pageAt = (state: DocumentVisibilityState) => {
  const events = new EventTarget();
  const page = Object.assign(events, { visibilityState: state });
  const turn = (to: DocumentVisibilityState) => {
    page.visibilityState = to;
    events.dispatchEvent(new Event('visibilitychange'));
  };
  return { page, turn };
};

/** A pane recording what it was told: hide or show. */
const told = () => {
  const said: Array<'hide' | 'show'> = [];
  return { said, hide: () => said.push('hide'), show: () => said.push('show') };
};

describe('the panes while the page is hidden', () => {
  it.effect('panes made while the page is hidden stand at once, and play on once it is shown', () =>
    Effect.sync(() => {
      const { page, turn } = pageAt('hidden');
      const pane = told();
      standWhileHidden([pane], page, new AbortController().signal);
      expect(pane.said).toEqual(['hide']);
      turn('visible');
      expect(pane.said).toEqual(['hide', 'show']);
    }),
  );

  it.effect('panes made on a shown page follow it until they are let go', () =>
    Effect.sync(() => {
      const { page, turn } = pageAt('visible');
      const pane = told();
      const letGo = new AbortController();
      standWhileHidden([pane], page, letGo.signal);
      turn('hidden');
      letGo.abort();
      turn('visible');
      expect(pane.said).toEqual(['hide']);
    }),
  );
});

/** A laptop's window: a fine pointer, so no media query a phone's pointer answers matches. */
const laptop = Layer.succeed(
  Viewport,
  Viewport.of({ matches: () => Effect.succeed(false), changes: () => Stream.empty }),
);

/** The engine a compare of two renders plays on, over a host with `viewport`. */
const engineOver = (viewport: Layer.Layer<Viewport>) =>
  Effect.scoped(
    Effect.map(
      compareOn(hostOf(Layer.merge(Frames.layerClock, viewport)), () => Option.none())([
        'https://lab.test/a.mp4',
        'https://lab.test/b.mp4',
      ]),
      (compare) => ({ engine: compare.engine, panes: compare.panes([]).panes.length }),
    ),
  );

describe('the engine a compare plays on', () => {
  it.effect("a phone's compare plays on <video>, as the host's Viewport says", () =>
    Effect.map(engineOver(Viewport.layerPhone), (got) =>
      expect(got).toEqual({
        engine: { engine: 'video', why: 'a phone plays <video> until one is measured' },
        panes: 0,
      }),
    ),
  );

  it.effect('a browser with no WebCodecs plays a compare on <video>', () =>
    Effect.map(engineOver(laptop), (got) =>
      expect(got).toEqual({
        engine: { engine: 'video', why: 'this browser has no WebCodecs' },
        panes: 0,
      }),
    ),
  );
});
