import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { type Address, resolveAddress } from '../core/address.ts';
import { layout } from '../core/layout.ts';
import {
  Cut,
  DRAW_WORKERS,
  HARDWARE_WORKERS,
  MAX_CHUNK_FRAMES,
  MAX_HARDWARE_ENCODERS,
  MIN_CHUNK_FRAMES,
  SOFTWARE_WORKERS,
  contactTimes,
  renderPaths,
  cutPage,
  encoderLimits,
  flagConflicts,
  jobOf,
  frameSpan,
  planChunks,
  stillName,
  videoEncoders,
  videoWorkers,
} from './render-plan.ts';
import { testExportInfo } from './testing.ts';

/** A film of three scenes, 4, 5 and 6 s, and one short over its first. */
const cutShort = {
  id: 'cut',
  title: 'A cut',
  spans: [{ scene: 'a', from: { at: 'start' }, to: { at: 'end' } }],
} as const;
const threeScenes = {
  name: 'f',
  placed: Result.getOrThrow(
    layout(
      [
        { id: 'a', min: 4 },
        { id: 'b', min: 5 },
        { id: 'c', min: 6 },
      ],
      { voice: '', scenes: {} },
    ),
  ),
  look: Option.none(),
  shorts: [cutShort],
};
/** `address` resolved against the three-scene film. */
const scoped = (address: Address) => Result.getOrThrow(resolveAddress(threeScenes, address));
const bc = scoped({ _tag: 'Scenes', ids: ['b', 'c'] });

const flags = {
  variant: 'main',
  captions: true,
  workers: Option.none(),
  stills: Option.none(),
  contact: Option.none(),
  scope: scoped({ _tag: 'Film' }),
  from: Option.none(),
  to: Option.none(),
  scale: Option.none(),
  out: Option.none(),
  share: Option.none(),
  encoder: Option.none(),
} as const;

const conflict = (over: Partial<Parameters<typeof jobOf>[0]>) =>
  Result.match(jobOf({ ...flags, ...over }), {
    onSuccess: () => 'none',
    onFailure: (e) => `${e.flag} ${e.rule} ${e.other}`,
  });

describe('jobOf', () => {
  test('a flag the job would ignore fails as FlagsConflict', () => {
    expect(conflict({ stills: Option.some([3]), scope: bc })).toBe('stills excludes scene');
    expect(conflict({ stills: Option.some([3]), contact: Option.some(5) })).toBe(
      'stills excludes contact',
    );
    expect(conflict({ scope: bc, from: Option.some(2) })).toBe('scene excludes from');
    expect(conflict({ contact: Option.some(5), share: Option.some(false) })).toBe(
      'contact excludes share',
    );
    expect(conflict({ stills: Option.some([3]), scale: Option.some(0.5) })).toBe(
      'stills excludes scale',
    );
  });

  test("a video's stretch is not the film's render: --from/--to need --out", () => {
    expect(conflict({ from: Option.some(2) })).toBe('from needs out');
    expect(conflict({ to: Option.some(4) })).toBe('to needs out');
    expect(conflict({ from: Option.some(2), out: Option.some('/tmp/x.mp4') })).toBe('none');
    // A contact sheet takes a range and records it; it writes no clip to overwrite.
    expect(conflict({ contact: Option.some(5), from: Option.some(2) })).toBe('none');
  });

  test('a video takes its range, scale and share; defaults when not given', () => {
    const job = Result.getOrThrow(
      jobOf({
        ...flags,
        from: Option.some(2),
        to: Option.some(4),
        out: Option.some('/tmp/stretch.mp4'),
        share: Option.some(false),
      }),
    );
    expect(job._tag).toBe('Video');
    expect(job).toMatchObject({ scale: 1, share: false, from: Option.some(2) });
    expect(Result.getOrThrow(jobOf(flags))).toMatchObject({ _tag: 'Video', share: true });
  });

  test('an address of scenes or an act sets the range of a contact sheet', () => {
    const job = Result.getOrThrow(jobOf({ ...flags, contact: Option.some(5), scope: bc }));
    expect(job).toMatchObject({
      _tag: 'Contact',
      every: 5,
      from: Option.some(4),
      to: Option.some(15),
    });
    const act = Result.getOrThrow(
      resolveAddress(
        {
          ...threeScenes,
          look: Option.some({
            acts: [
              { from: 'a', name: 'one' },
              { from: 'c', name: 'two' },
            ],
          }),
        },
        { _tag: 'Act', act: 'two' },
      ),
    );
    expect(Result.getOrThrow(jobOf({ ...flags, scope: act }))).toMatchObject({
      from: Option.some(9),
      to: Option.some(15),
    });
    expect(conflict({ scope: act, to: Option.some(12) })).toBe('act excludes to');
  });

  test('a short address cuts the job to that short, on its own clock', () => {
    const job = Result.getOrThrow(jobOf({ ...flags, scope: scoped({ _tag: 'Short', id: 'cut' }) }));
    expect(job).toMatchObject({
      _tag: 'Video',
      cut: Cut.Short({ short: cutShort }),
      from: Option.none(),
    });
    expect(Result.getOrThrow(jobOf(flags))).toMatchObject({ cut: Cut.Whole() });
  });

  test('a short draws on its own page', () => {
    const short = Cut.Short({
      short: {
        id: 'cut',
        title: 'A cut',
        spans: [{ scene: 'a', from: { at: 'start' }, to: { at: 'end' } }],
      },
    });
    expect(cutPage('film', Cut.Whole())).toBe('film');
    expect(cutPage('film', short)).toBe('film/shorts/cut');
  });

  test("a render's files go in the project folder by its address and variant", () => {
    expect(renderPaths('/out/f', { _tag: 'Film' }, 'main')).toEqual({
      clip: '/out/f/film/main.mp4',
      dir: '/out/f/film/main',
    });
    expect(renderPaths('/out/f', { _tag: 'Scenes', ids: ['cold'] }, 'ink').clip).toBe(
      '/out/f/scenes/cold/ink.mp4',
    );
    expect(renderPaths('/out/f', { _tag: 'Scenes', ids: ['a', 'b'] }, 'main').clip).toBe(
      '/out/f/scenes/a+b/main.mp4',
    );
    expect(renderPaths('/out/f', { _tag: 'Act', act: 'cold open' }, 'main').dir).toBe(
      '/out/f/acts/cold-open/main',
    );
    expect(renderPaths('/out/f', { _tag: 'Short', id: 'verdict' }, 'main').clip).toBe(
      '/out/f/shorts/verdict/main.mp4',
    );
  });

  test('the job carries its address and variant', () => {
    expect(Result.getOrThrow(jobOf({ ...flags, scope: bc, variant: 'ink' }))).toMatchObject({
      address: { _tag: 'Scenes', ids: ['b', 'c'] },
      variant: 'ink',
    });
  });

  test('a needs rule fails only without its partner', () => {
    const rule = ['share', 'needs', 'workers', 'r'] as const;
    expect(Result.isFailure(flagConflicts(new Set(['share']), [rule]))).toBe(true);
    expect(Result.isSuccess(flagConflicts(new Set(['share', 'workers']), [rule]))).toBe(true);
  });
});

describe('planChunks', () => {
  test('covers the range once, in order, with no gaps', () => {
    const chunks = planChunks(120, 10_499, 6);
    expect(chunks[0]?.from).toBe(120);
    expect(chunks.at(-1)?.to).toBe(10_499);
    for (const [k, c] of chunks.entries()) {
      expect(c.index).toBe(k);
      expect(c.to).toBeGreaterThan(c.from);
      if (k > 0) expect(chunks[k - 1]?.to).toBe(c.from);
    }
  });

  /** The frames in each chunk, in order. */
  const sizes = (from: number, to: number, workers: number) =>
    planChunks(from, to, workers).map((c) => c.to - c.from);

  test('about four chunks per page, then a tail that halves', () => {
    // 150 frames a chunk for 4 pages, the last 448 frames as four of 75 and four of 37.
    const all = sizes(0, 2400, 4);
    expect(all.slice(-8)).toEqual([75, 75, 75, 75, 37, 37, 37, 37]);
    const head = all.slice(0, -8);
    expect(head).toHaveLength(14);
    expect(head.every((n) => n === 139 || n === 140)).toBe(true);
  });

  test('the last chunks the pages pull are the smallest, so the pages finish together', () => {
    // A film of 15 776 frames (about nine minutes) on 8 pages: 59 of 238–239, then eight each of 120, 60 and 30.
    const all = sizes(0, 15_776, 8);
    expect(all.slice(-24)).toEqual([
      ...Array.from({ length: 8 }, () => 120),
      ...Array.from({ length: 8 }, () => 60),
      ...Array.from({ length: 8 }, () => 30),
    ]);
    expect(all.slice(0, -24).every((n) => n >= 238 && n <= MAX_CHUNK_FRAMES)).toBe(true);
  });

  test('never over eight seconds of frames, however few the pages', () => {
    expect(sizes(0, 10_499, 6).every((n) => n <= MAX_CHUNK_FRAMES)).toBe(true);
    expect(sizes(0, 10_499, 1).every((n) => n <= MAX_CHUNK_FRAMES)).toBe(true);
  });

  test('never under a second of frames', () => {
    for (const [from, to, workers] of [
      [3600, 4200, 4],
      [0, 10_499, 6],
      [0, 1000, 8],
      [0, 2413, 4],
      [0, 61, 1],
    ] as const)
      expect(sizes(from, to, workers).every((n) => n >= MIN_CHUNK_FRAMES)).toBe(true);
    // Too short for two chunks of a second: one chunk.
    expect(sizes(0, 45, 8)).toEqual([45]);
  });

  test('an empty range has no chunks', () => {
    expect(planChunks(50, 50, 4)).toEqual([]);
  });
});

describe('ranges', () => {
  test('a video covers [from, to) in frames, clipped to the film', () => {
    expect(frameSpan(testExportInfo, Option.some(2), Option.some(3))).toEqual({
      start: 60,
      end: 90,
    });
    expect(frameSpan(testExportInfo, Option.none(), Option.some(99))).toEqual({
      start: 0,
      end: 600,
    });
  });

  test('a whole film whose end lies just past a frame keeps that frame', () => {
    // 30.01 s at 30 fps: frame 900 starts inside the film, so the film has 901 frames.
    const info = { ...testExportInfo, duration: 30.01, frames: 901 };
    expect(frameSpan(info, Option.none(), Option.none())).toEqual({ start: 0, end: 901 });
    expect(frameSpan(info, Option.some(30), Option.some(30.01))).toEqual({ start: 900, end: 901 });
  });

  test('a range from before the film starts at its first frame', () => {
    expect(frameSpan(testExportInfo, Option.some(-1), Option.some(2))).toEqual({
      start: 0,
      end: 60,
    });
  });

  test('contact times step from `from` while before `to`', () => {
    expect(contactTimes(0, 35, 10)).toEqual([0, 10, 20, 30]);
    expect(contactTimes(5, 5, 1)).toEqual([]);
  });

  test('stills are named by time so they sort', () => {
    expect(stillName(8.14)).toBe('t0008.14.png');
    expect(stillName(347.16)).toBe('t0347.16.png');
  });
});

describe('encoder budget', () => {
  const hardware = { _tag: 'Hardware' } as const;
  const software = { _tag: 'Software' } as const;
  const tag = (r: ReturnType<typeof videoEncoders>) =>
    Result.match(r, { onSuccess: String, onFailure: (e) => e._tag });

  test('the hardware encoder (the Mac): two a page with a share copy; past 14 fails, whatever the cores', () => {
    expect(MAX_HARDWARE_ENCODERS).toBe(14);
    expect(HARDWARE_WORKERS).toBe(6);
    expect(encoderLimits(hardware, 10)).toEqual({ max: 14, workers: 6 });
    expect(encoderLimits(hardware, 64)).toEqual({ max: 14, workers: 6 });
    expect(tag(videoEncoders(7, true, hardware, 64))).toBe('14');
    expect(tag(videoEncoders(8, true, hardware, 64))).toBe('TooManyEncoders');
    expect(tag(videoEncoders(14, false, hardware, 64))).toBe('14');
    expect(tag(videoEncoders(15, false, hardware, 64))).toBe('TooManyEncoders');
    // The default render, with its share copy, fits.
    expect(tag(videoEncoders(HARDWARE_WORKERS, true, hardware, 10))).toBe('12');
  });

  test('a software encoder is bounded by the cores, one encoder a page: its share is made after the join', () => {
    expect(encoderLimits(software, 16).max).toBe(16);
    expect(tag(videoEncoders(16, true, software, 16))).toBe('16');
    expect(tag(videoEncoders(17, true, software, 16))).toBe('TooManyEncoders');
    expect(tag(videoEncoders(16, false, software, 16))).toBe('16');
    expect(tag(videoEncoders(5, true, software, 4))).toBe('TooManyEncoders');
  });

  test('the software default is the measured knee, and fits a smaller machine', () => {
    expect(encoderLimits(software, 16).workers).toBe(SOFTWARE_WORKERS);
    expect(tag(videoEncoders(SOFTWARE_WORKERS, true, software, 16))).toBe(String(SOFTWARE_WORKERS));
    expect(encoderLimits(software, 4).workers).toBe(2);
    expect(encoderLimits(software, 1).workers).toBe(1);
  });

  test('TooManyEncoders names the encoder, and counts a share copy only where the page makes it', () => {
    const over = (r: ReturnType<typeof videoEncoders>) =>
      Result.match(r, { onSuccess: () => '', onFailure: (e) => e.message });
    expect(over(videoEncoders(8, true, hardware, 64))).toBe(
      '8 pages with a share copy need 16 encoders at once, over the 14 hardware encoders a render may run; use --workers 7 or fewer, or --no-share',
    );
    expect(over(videoEncoders(17, true, software, 16))).toBe(
      '17 pages need 17 encoders at once, over the 16 software encoders a render may run; use --workers 16 or fewer',
    );
  });

  test('--workers wins over the encoder default; none takes it', () => {
    expect(videoWorkers(Option.some(3), software, 16)).toBe(3);
    expect(videoWorkers(Option.none(), software, 16)).toBe(SOFTWARE_WORKERS);
    expect(videoWorkers(Option.none(), hardware, 16)).toBe(HARDWARE_WORKERS);
  });

  test('a video left to the default takes its pages from the encoder; stills draw on DRAW_WORKERS', () => {
    expect(Result.getOrThrow(jobOf(flags))).toMatchObject({
      _tag: 'Video',
      workers: Option.none(),
    });
    expect(Result.getOrThrow(jobOf({ ...flags, workers: Option.some(4) }))).toMatchObject({
      workers: Option.some(4),
    });
    expect(Result.getOrThrow(jobOf({ ...flags, stills: Option.some([1]) }))).toMatchObject({
      _tag: 'Stills',
      workers: DRAW_WORKERS,
    });
    expect(DRAW_WORKERS).toBe(6);
  });

  test('--workers on a contact sheet fails: one page composes it', () => {
    expect(conflict({ contact: Option.some(5), workers: Option.some(2) })).toBe(
      'contact excludes workers',
    );
  });

  test('--encoder is a video flag: a video keeps it, stills and a contact sheet refuse it', () => {
    const software = Option.some({ _tag: 'Software' } as const);
    expect(Result.getOrThrow(jobOf({ ...flags, encoder: software }))).toMatchObject({
      _tag: 'Video',
      encoder: software,
    });
    expect(Result.getOrThrow(jobOf(flags))).toMatchObject({ encoder: Option.none() });
    expect(conflict({ stills: Option.some([1]), encoder: software })).toBe(
      'stills excludes encoder',
    );
    expect(conflict({ contact: Option.some(5), encoder: software })).toBe(
      'contact excludes encoder',
    );
  });
});
