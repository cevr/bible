// Renderer with fakes: a failure in one page, an interrupt, or a crash closes
// or recovers every resource the render opened. No Chromium, no encoder.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Fiber, Layer, Option, Path } from 'effect';
import type { ExportInfo } from '../core/schema.ts';
import { EncoderMissing, PageCrashed, PageError } from './errors.ts';
import { RenderJob } from './render-plan.ts';
import { Renderer } from './renderer.ts';
import {
  type FakeRenderHost,
  type RenderLedger,
  emptyLedger,
  fakeRenderHost,
  memoryFileSystem,
  testExportInfo,
  testFilm,
  text,
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
  share: false,
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

/** Every resource the render opened was closed, and every chunk's encode ended. */
const expectAllClosed = (ledger: RenderLedger) => {
  expect(ledger.server).toEqual({ started: 1, stopped: 1 });
  expect(ledger.browser).toEqual({ launched: 1, closed: 1 });
  expect(ledger.pages.closed).toBe(ledger.pages.opened);
  const { spawned, finished, killed } = ledger.encoders;
  expect(finished + killed).toBe(spawned);
};

describe('Renderer', () => {
  it.live('renders every frame once, joins the segments in order, and closes everything', () =>
    Effect.gen(function* () {
      const { ledger, files, render } = setup();
      yield* render(video);
      expect([...ledger.frames].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 600 }, (_, i) => i),
      );
      expect(ledger.encoders).toEqual({ spawned: 16, finished: 16, killed: 0 });
      expect(ledger.pages.opened).toBe(4);
      const [join] = ledger.joins;
      expect(join?.out).toBe('/out/test.mp4');
      expect(join?.frames).toBe(600);
      // Sixteen chunks of 38 frames (the last 30), each placed where its first frame plays.
      expect(join?.segments.map((s) => s.at)).toEqual(
        Array.from({ length: 16 }, (_, k) => (k * 38) / 30),
      );
      expect(files.get(join?.segments[1]?.file ?? '')).toEqual(text('mp4 38-76'));
      expect(join?.audio).toEqual(Option.none());
      expect(files.has('/out/test.vtt')).toBe(true);
      expectAllClosed(ledger);
    }),
  );

  it.live('a share copy encodes in the same pass and joins beside the film', () =>
    Effect.gen(function* () {
      const { ledger, files, render } = setup();
      yield* render({ ...video, share: true });
      expect(ledger.encoders.spawned).toBe(16);
      expect(ledger.joins.map((j) => j.out)).toEqual(['/out/test.mp4', '/out/test.share.mp4']);
      const [, share] = ledger.joins;
      expect(files.get(share?.segments[1]?.file ?? '')).toEqual(text('share 38-76'));
      expect(share?.segments.map((s) => s.at)).toEqual(ledger.joins[0]?.segments.map((s) => s.at));
    }),
  );

  it.live('a video needing more encoders than the machine runs fails before a page opens', () =>
    Effect.gen(function* () {
      const { ledger, render } = setup();
      // Eight pages with a share copy are sixteen encoders: the hardware encoder hangs at sixteen.
      const exit = yield* Effect.exit(render({ ...video, workers: 8, share: true }));
      expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e.message))).toEqual(
        Option.some(
          '8 pages with a share copy need 16 encoders at once, over the 14 a render may run; use --workers 7 or fewer, or --no-share',
        ),
      );
      expect(ledger.pages.opened).toBe(0);
    }),
  );

  it.live('a browser that cannot encode the film fails before a frame is drawn', () =>
    Effect.gen(function* () {
      const { ledger, render } = setup({
        encoder: Effect.fail(EncoderMissing.make({ reason: 'no H.264' })),
      });
      const exit = yield* Effect.exit(render(video));
      expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag))).toEqual(
        Option.some('EncoderMissing'),
      );
      expect(ledger.frames).toEqual([]);
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
        // Sibling chunks were mid-encode: they were cut off, not left running.
        expect(ledger.encoders.killed).toBeGreaterThan(1);
        expect(ledger.frames).not.toContain(599);
        expect(ledger.joins).toEqual([]);
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
      // One page tiles every fifth second's frame into the sheet.
      expect(files.has('/out/test/g/contact.jpg')).toBe(true);
      expect(ledger.contacts).toEqual([[0, 150, 300, 450]]);
    }),
  );

  it.live('a look-book is one page composing one sheet, written beside the stills', () =>
    Effect.gen(function* () {
      const { ledger, files, render } = setup();
      yield* render(RenderJob.LookBook({ tag: '', captions: false, workers: 4 }));
      expect(files.has('/out/test/lookbook.jpg')).toBe(true);
      expect(ledger.pages.opened).toBe(1);
      expect(ledger.lookbooks.composed).toBe(1);
      expectAllClosed(ledger);
    }),
  );

  describe('with the mixed track', () => {
    const info: ExportInfo = { ...testExportInfo, audio: '/films/test/narration/full.wav' };
    const MASTER = '/films/test/narration/full.wav';
    const tagOf = (exit: Exit.Exit<void, { readonly _tag: string }>) =>
      Exit.findErrorOption(exit).pipe(Option.map((e) => e._tag));

    it.live('joins the master under the film when it covers it', () =>
      Effect.gen(function* () {
        const { ledger, files, render } = setup({ info });
        files.set(MASTER, text('pcm'));
        yield* render(video);
        expect(ledger.aac).toEqual([20 * 44100]);
        expect(Option.isSome(ledger.joins[0]?.audio ?? Option.none())).toBe(true);
        expectAllClosed(ledger);
      }),
    );

    it.live('a range takes the master under that range only', () =>
      Effect.gen(function* () {
        const { ledger, files, render } = setup({ info });
        files.set(MASTER, text('pcm'));
        yield* render({ ...video, from: Option.some(2), to: Option.some(5) });
        const [join] = ledger.joins;
        expect(join?.frames).toBe(90);
        expect(join?.segments[0]?.at).toBe(0);
        expect(ledger.aac).toEqual([3 * 44100]);
      }),
    );

    it.live('a share copy joins the same track: it is encoded once', () =>
      Effect.gen(function* () {
        const { ledger, files, render } = setup({ info });
        files.set(MASTER, text('pcm'));
        yield* render({ ...video, share: true });
        expect(ledger.aac).toEqual([20 * 44100]);
        const [master, share] = ledger.joins.map((j) => Option.getOrThrow(j.audio));
        expect(share).toBe(master);
      }),
    );

    it.live('a master shorter than the film fails before a frame is drawn', () =>
      Effect.gen(function* () {
        // An interrupted mix left 12 s of a 20 s film.
        const { ledger, files, render } = setup({ info, master: 12 });
        files.set(MASTER, text('pcm'));
        const exit = yield* Effect.exit(render(video));
        expect(tagOf(exit)).toEqual(Option.some('AudioStale'));
        expect(ledger.frames).toEqual([]);
        expect(ledger.joins).toEqual([]);
      }),
    );

    it.live('no master fails before a frame is drawn', () =>
      Effect.gen(function* () {
        const { ledger, render } = setup({ info });
        const exit = yield* Effect.exit(render(video));
        expect(tagOf(exit)).toEqual(Option.some('AudioMissing'));
        expect(ledger.frames).toEqual([]);
      }),
    );
  });
});
