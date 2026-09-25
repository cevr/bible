// Renderer with fakes: a failure in one page, an interrupt, or a crash closes
// or recovers every resource the render opened. No Chromium, no ffmpeg.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Fiber, Layer, Option, Path } from 'effect';
import { PageCrashed, PageError } from './errors.ts';
import { RenderJob } from './render-plan.ts';
import { Renderer } from './renderer.ts';
import {
  type FakeRenderHost,
  type RenderLedger,
  emptyLedger,
  fakeRenderHost,
  memoryFileSystem,
  testFilm,
} from './testing.ts';

const film = testFilm([{ id: 'a', min: 20 }], { voice: '', scenes: {} });

/** The whole 20 s test film on four pages: 600 frames in 16 chunks. */
const video = RenderJob.Video({
  tag: '',
  captions: true,
  workers: 4,
  from: Option.none(),
  to: Option.none(),
  scale: 1,
  out: Option.none(),
});

const setup = (host: FakeRenderHost = {}) => {
  const ledger = emptyLedger();
  const files = new Map<string, Uint8Array>();
  const layer = Renderer.layer.pipe(
    Layer.provide([fakeRenderHost(ledger, host), memoryFileSystem(files), Path.layer]),
  );
  const render = (job: RenderJob) =>
    Effect.gen(function* () {
      yield* (yield* Renderer).render(film, job);
    }).pipe(Effect.provide(layer));
  return { ledger, files, render };
};

/** Every resource the render opened was closed, and every encoder ended. */
const expectAllClosed = (ledger: RenderLedger) => {
  expect(ledger.server).toEqual({ started: 1, stopped: 1 });
  expect(ledger.browser).toEqual({ launched: 1, closed: 1 });
  expect(ledger.pages.closed).toBe(ledger.pages.opened);
  const { spawned, finished, killed } = ledger.encoders;
  expect(finished + killed).toBe(spawned);
};

describe('Renderer', () => {
  it.live('renders every frame once, joins the segments, and closes everything', () =>
    Effect.gen(function* () {
      const { ledger, files, render } = setup();
      yield* render(video);
      expect([...ledger.frames].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 600 }, (_, i) => i),
      );
      expect(ledger.encoders).toEqual({ spawned: 16, finished: 16, killed: 0 });
      expect(ledger.pages.opened).toBe(4);
      expect(ledger.runs[0]).toContain('concat');
      expect(files.has('/out/test.vtt')).toBe(true);
      expectAllClosed(ledger);
    }),
  );

  it.live(
    'a page error on frame k fails the render and closes every page, encoder and the browser',
    () =>
      Effect.gen(function* () {
        const { ledger, render } = setup({
          frame: (i) =>
            Effect.when(
              Effect.fail(PageError.make({ reason: 'boom' })),
              Effect.sync(() => i === 100),
            ),
        });
        const exit = yield* Effect.exit(render(video));
        expect(Exit.isFailure(exit)).toBe(true);
        expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag))).toEqual(
          Option.some('PageError'),
        );
        // Sibling chunks were mid-encode: their ffmpeg children were killed, not left running.
        expect(ledger.encoders.killed).toBeGreaterThan(1);
        expect(ledger.frames).not.toContain(599);
        expect(ledger.runs).toEqual([]);
        expectAllClosed(ledger);
      }),
  );

  it.live('an interrupt closes every page, encoder, the browser and the server', () =>
    Effect.gen(function* () {
      const { ledger, render } = setup();
      const fiber = yield* Effect.forkChild(render(video));
      yield* Effect.sleep('30 millis');
      expect(ledger.frames.length).toBeGreaterThan(0);
      yield* Fiber.interrupt(fiber);
      expect(ledger.encoders.killed).toBeGreaterThan(0);
      expectAllClosed(ledger);
    }),
  );

  it.live('a crashed page is replaced and its chunk retried once', () =>
    Effect.gen(function* () {
      const crashed = new Set<number>();
      const { ledger, render } = setup({
        // The page drawing frame 200 crashes, once; the retried chunk gets a new page.
        frame: (i, page) =>
          Effect.when(
            Effect.fail(PageCrashed.make({ reason: 'oom' })),
            Effect.sync(() => {
              if (i !== 200 || crashed.size > 0) return false;
              crashed.add(page);
              return true;
            }),
          ),
      });
      yield* render(video);
      expect(crashed.size).toBe(1);
      expect(ledger.pages.opened).toBe(5);
      expect(new Set(ledger.frames).size).toBe(600);
      expect(ledger.encoders.finished).toBe(16);
      expectAllClosed(ledger);
    }),
  );

  it.live('a page that crashes again fails the render', () =>
    Effect.gen(function* () {
      const { ledger, render } = setup({
        frame: (i) =>
          Effect.when(
            Effect.fail(PageCrashed.make({ reason: 'oom' })),
            Effect.sync(() => i === 200),
          ),
      });
      const exit = yield* Effect.exit(render(video));
      expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag))).toEqual(
        Option.some('PageCrashed'),
      );
      expectAllClosed(ledger);
    }),
  );

  it.live('stills and a contact sheet go through the same pages', () =>
    Effect.gen(function* () {
      const { ledger, files, render } = setup();
      yield* render(RenderJob.Stills({ tag: 'g', captions: true, workers: 4, times: [1, 2.5] }));
      expect(files.has('/out/test/g/stills/t0002.50.png')).toBe(true);
      expect(ledger.pages.opened).toBe(2);
      yield* render(
        RenderJob.Contact({
          tag: 'g',
          captions: false,
          workers: 2,
          every: 5,
          from: Option.none(),
          to: Option.none(),
        }),
      );
      expect(files.has('/out/test/g/contact/0003.jpg')).toBe(true);
      expect(ledger.runs.at(-1)?.join(' ')).toContain('tile=6x1');
    }),
  );
});
