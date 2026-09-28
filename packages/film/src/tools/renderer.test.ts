// Renderer with fakes: a failure in one page, an interrupt, or a crash closes
// or recovers every resource the render opened. No Chromium, no encoder.

import { describe, expect, it } from 'effect-bun-test';
import { Effect, Exit, Fiber, Layer, Option, Path } from 'effect';
import type { ExportInfo } from '../core/schema.ts';
import { EncoderMissing, MediaFailed, PageCrashed, PageError } from './errors.ts';
import type { LoadedFilm } from './film-repo.ts';
import { Cut, HARDWARE_WORKERS, RenderJob, SOFTWARE_WORKERS } from './render-plan.ts';
import { Cores, Renderer } from './renderer.ts';
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
  workers: Option.some(4),
  from: Option.none(),
  to: Option.none(),
  scale: 1,
  out: Option.none(),
  share: false,
  cut: Cut.Whole(),
});

const setup = (
  host: FakeRenderHost = {},
  files = new Map<string, Uint8Array>(),
  rendered: LoadedFilm = film,
  folders = new Set<string>(),
) => {
  const ledger = emptyLedger();
  const layer = Renderer.layer.pipe(
    Layer.provide([fakeRenderHost(ledger, host), memoryFileSystem(files, folders), Path.layer]),
  );
  const render = (job: RenderJob) =>
    Effect.gen(function* () {
      yield* (yield* Renderer).render(rendered, job);
    }).pipe(Effect.provide(layer));
  return { ledger, files, folders, render };
};

/** A render whose joins keep, by file, the bytes each segment held when it was joined. */
const joinedBytes = () => {
  const files = new Map<string, Uint8Array>();
  const joined = new Map<string, Uint8Array>();
  const run = setup(
    {
      join: (film) =>
        Effect.sync(() => {
          for (const s of film.segments)
            Option.map(Option.fromNullishOr(files.get(s.file)), (bytes) =>
              joined.set(s.file, bytes),
            );
        }),
    },
    files,
  );
  return { ...run, joined };
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
      const { ledger, files, joined, render } = joinedBytes();
      yield* render(video);
      expect([...ledger.frames].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 600 }, (_, i) => i),
      );
      expect(ledger.encoders).toEqual({ spawned: 16, finished: 16, killed: 0 });
      // The page that chose the encoder, then the four the chunks are drawn on.
      expect(ledger.pages.opened).toBe(5);
      const [join] = ledger.joins;
      expect(join?.out).toBe('/out/test.mp4');
      expect(join?.frames).toBe(600);
      // Sixteen chunks of 38 frames (the last 30), each placed where its first frame plays.
      expect(join?.segments.map((s) => s.at)).toEqual(
        Array.from({ length: 16 }, (_, k) => (k * 38) / 30),
      );
      expect(joined.get(join?.segments[1]?.file ?? '')).toEqual(text('mp4 38-76'));
      expect(join?.audio).toEqual(Option.none());
      expect(files.has('/out/test.vtt')).toBe(true);
      expectAllClosed(ledger);
    }),
  );

  it.live('a share copy encodes in the same pass and joins beside the film', () =>
    Effect.gen(function* () {
      const { ledger, joined, render } = joinedBytes();
      yield* render({ ...video, share: true });
      expect(ledger.encoders.spawned).toBe(16);
      expect(ledger.joins.map((j) => j.out)).toEqual(['/out/test.mp4', '/out/test.share.mp4']);
      const [, share] = ledger.joins;
      expect(joined.get(share?.segments[1]?.file ?? '')).toEqual(text('share 38-76'));
      expect(share?.segments.map((s) => s.at)).toEqual(ledger.joins[0]?.segments.map((s) => s.at));
    }),
  );

  it.live('the segments go once the film is joined, and stay when the join fails', () =>
    Effect.gen(function* () {
      const segments = (files: Map<string, Uint8Array>) =>
        [...files.keys()].filter((f) => f.includes('/segments/') || f.includes('/share/'));
      const done = setup();
      yield* done.render({ ...video, share: true });
      expect(done.ledger.joins.length).toBe(2);
      expect(segments(done.files)).toEqual([]);

      const failed = setup({
        join: () => Effect.fail(MediaFailed.make({ op: 'join', file: 'x', reason: 'no' })),
      });
      const exit = yield* Effect.exit(failed.render({ ...video, share: true }));
      expect(Exit.isFailure(exit)).toBe(true);
      expect(segments(failed.files).length).toBe(32);
    }),
  );

  it.live('a video makes nothing under out/<film>, tagged or not, and keeps what is there', () =>
    Effect.gen(function* () {
      const bare = setup();
      yield* bare.render({ ...video, tag: 'bench', share: true });
      const under = (p: string) => p === '/out/test' || p.startsWith('/out/test/');
      expect([...bare.folders, ...bare.files.keys()].filter(under)).toEqual([]);
      // Its own segments folder goes too, once joined.
      expect([...bare.folders].filter((f) => f.startsWith('/tmp/film-segments-'))).toEqual([]);
      expect(bare.ledger.joins[0]?.out).toBe('/out/test.mp4');
      expect(bare.files.has('/out/test.vtt')).toBe(true);

      const files = new Map([['/out/test/look/stills/t0001.00.png', text('png')]]);
      const kept = setup({}, files);
      yield* kept.render({ ...video, tag: 'look' });
      expect([...kept.files.keys()].filter((f) => f.startsWith('/out/test/look/'))).toEqual([
        '/out/test/look/stills/t0001.00.png',
      ]);
    }),
  );

  it.live('a video needing more encoders than its encoder runs fails before the pool opens', () =>
    Effect.gen(function* () {
      const { ledger, render } = setup();
      // Eight pages with a share copy are sixteen encoders: the hardware encoder hangs at sixteen.
      const exit = yield* Effect.exit(
        render({ ...video, workers: Option.some(8), share: true }).pipe(
          Effect.provideService(Cores, 64),
        ),
      );
      expect(Exit.findErrorOption(exit).pipe(Option.map((e) => e.message))).toEqual(
        Option.some(
          '8 pages with a share copy need 16 encoders at once, over the 14 hardware encoders a render may run; use --workers 7 or fewer, or --no-share',
        ),
      );
      // Only the page that chose the encoder opened, and nothing was drawn.
      expect(ledger.pages.opened).toBe(1);
      expect(ledger.frames).toEqual([]);
      expectAllClosed(ledger);
    }),
  );

  it.live('on the hardware encoder a render left to the default opens its six pages', () =>
    Effect.gen(function* () {
      const { ledger, render } = setup();
      yield* render({ ...video, workers: Option.none(), share: true }).pipe(
        Effect.provideService(Cores, 16),
      );
      expect(ledger.pages.opened).toBe(1 + HARDWARE_WORKERS);
      expect(new Set(ledger.encodedBy)).toEqual(new Set(['Hardware']));
    }),
  );

  it.live(
    'with no hardware encoder every chunk is encoded in software, on the software default pages',
    () =>
      Effect.gen(function* () {
        const { ledger, render } = setup({ encoder: Effect.succeed({ _tag: 'Software' }) });
        yield* render({ ...video, workers: Option.none(), share: true }).pipe(
          Effect.provideService(Cores, 16),
        );
        expect(ledger.pages.opened).toBe(1 + SOFTWARE_WORKERS);
        expect(ledger.encodedBy.length).toBe(ledger.encoders.spawned);
        expect(new Set(ledger.encodedBy)).toEqual(new Set(['Software']));
        expectAllClosed(ledger);

        // One a core: nine pages with share copies are too many for 16 cores.
        const over = setup({ encoder: Effect.succeed({ _tag: 'Software' }) });
        const error = yield* Effect.flip(
          over
            .render({ ...video, workers: Option.some(9), share: true })
            .pipe(Effect.provideService(Cores, 16)),
        );
        expect(error.message).toBe(
          '9 pages with a share copy need 18 encoders at once, over the 16 software encoders a render may run; use --workers 8 or fewer, or --no-share',
        );
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
      expect(ledger.pages.opened).toBe(6);
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
      yield* render(
        RenderJob.Stills({
          tag: 'g',
          captions: true,
          workers: 4,
          times: [1, 2.5],
          cut: Cut.Whole(),
        }),
      );
      expect(files.has('/out/test/g/stills/t0002.50.png')).toBe(true);
      expect(ledger.pages.opened).toBe(2);
      yield* render(
        RenderJob.Contact({
          tag: 'g',
          captions: false,
          every: 5,
          from: Option.none(),
          to: Option.none(),
          cut: Cut.Whole(),
        }),
      );
      // One page tiles every fifth second's frame into the sheet.
      expect(files.has('/out/test/g/contact.jpg')).toBe(true);
      expect(ledger.contacts).toEqual([[0, 150, 300, 450]]);
    }),
  );

  it.live('a contact sheet over a range past the film shows each frame once', () =>
    Effect.gen(function* () {
      const { ledger, render } = setup();
      const sheet = (from: number, to: number) =>
        render(
          RenderJob.Contact({
            tag: 'g',
            captions: false,
            every: 1,
            from: Option.some(from),
            to: Option.some(to),
            cut: Cut.Whole(),
          }),
        );
      yield* sheet(-5, 2);
      yield* sheet(18, 25);
      expect(ledger.contacts).toEqual([
        [0, 30],
        [540, 570],
      ]);
      // Wholly past the film: nothing to show, as with a video.
      const error = yield* Effect.flip(sheet(25, 30));
      expect(error._tag).toBe('RangeEmpty');
    }),
  );

  it.live('a look-book is one page composing one sheet, written beside the stills', () =>
    Effect.gen(function* () {
      const { ledger, files, render } = setup();
      yield* render(RenderJob.LookBook({ tag: '', captions: false }));
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

    it.live('a page failure stops the track encode with the render', () =>
      Effect.gen(function* () {
        const { ledger, files, render } = setup({
          info,
          aac: Effect.sleep('10 seconds'),
          frame: (i) =>
            Effect.when(
              Effect.fail(PageError.make({ reason: 'boom' })),
              Effect.sync(() => i === 100),
            ),
        });
        files.set(MASTER, text('pcm'));
        const exit = yield* Effect.exit(render(video));
        expect(tagOf(exit)).toEqual(Option.some('PageError'));
        expect(ledger.aacInterrupted.count).toBe(1);
      }),
    );

    it.live('a failed track encode fails the render before every frame is drawn', () =>
      Effect.gen(function* () {
        const { ledger, files, render } = setup({
          info,
          aac: Effect.fail(MediaFailed.make({ op: 'encode', file: 'the track', reason: 'no' })),
          frame: () => Effect.sleep('5 millis'),
        });
        files.set(MASTER, text('pcm'));
        const exit = yield* Effect.exit(render(video));
        expect(tagOf(exit)).toEqual(Option.some('MediaFailed'));
        expect(ledger.frames.length).toBeLessThan(600);
        expectAllClosed(ledger);
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

  describe('a short', () => {
    /** A 15 s film of three silent scenes; the short plays c, then a: 10 s. */
    const three = testFilm(
      [
        { id: 'a', min: 4 },
        { id: 'b', min: 5 },
        { id: 'c', min: 6 },
      ],
      { voice: '', scenes: {} },
    );
    const short = Cut.Short({
      short: {
        id: 'cut',
        title: 'A cut',
        spans: [
          { scene: 'c', from: { scene: 'start' }, to: { scene: 'end' } },
          { scene: 'a', from: { scene: 'start' }, to: { scene: 'end' } },
        ],
      },
    });
    /** The short's page: 9:16 at the film's density, 10 s. */
    const page: ExportInfo = { width: 1920, height: 3414, fps: 30, duration: 10, frames: 300 };
    const MASTER = '/films/test/narration/full.wav';

    it.live(
      'renders its page to out/<film>/shorts/<id>.mp4 at 1080×1920, with its spans of the track',
      () =>
        Effect.gen(function* () {
          const files = new Map<string, Uint8Array>([[MASTER, text('pcm')]]);
          const { ledger, render } = setup({ info: page, master: 15 }, files, three);
          yield* render({ ...video, cut: short });
          expect(ledger.urls[0]).toBe('http://preview.test/?film=test%2Fshorts%2Fcut&export');
          const [join] = ledger.joins;
          expect(join?.out).toBe('/out/test/shorts/cut.mp4');
          expect(join?.frames).toBe(300);
          // The track is the film's c then a: 6 s and 4 s, cut from the 15 s master.
          expect(ledger.aac).toEqual([10 * 44100]);
          expect(files.has('/out/test/shorts/cut.vtt')).toBe(true);
          expectAllClosed(ledger);
        }),
    );

    it.live("a short's stills land in its own folder", () =>
      Effect.gen(function* () {
        const files = new Map<string, Uint8Array>([[MASTER, text('pcm')]]);
        const { render } = setup({ info: page, master: 15 }, files, three);
        yield* render(
          RenderJob.Stills({ tag: 'g', captions: true, workers: 1, times: [1], cut: short }),
        );
        expect(files.has('/out/test/shorts/cut/g/stills/t0001.00.png')).toBe(true);
      }),
    );

    it.live('a short whose span names a mark the scene lacks fails naming it', () =>
      Effect.gen(function* () {
        const { render } = setup({ info: page }, new Map(), three);
        const broken = Cut.Short({
          short: {
            id: 'cut',
            title: 'x',
            spans: [{ scene: 'a', from: { mark: 'nope' }, to: { scene: 'end' } }],
          },
        });
        const error = yield* Effect.flip(render({ ...video, cut: broken }));
        expect(error._tag).toBe('ShortUnknownMark');
      }),
    );
  });
});
