import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
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
  cutBase,
  cutPage,
  encoderLimits,
  flagConflicts,
  jobOf,
  frameSpan,
  planChunks,
  sceneSpan,
  stillName,
  videoEncoders,
  videoWorkers,
} from './render-plan.ts';
import { testExportInfo } from './testing.ts';

const flags = {
  tag: 't',
  captions: true,
  workers: Option.none(),
  stills: Option.none(),
  contact: Option.none(),
  span: Option.none(),
  from: Option.none(),
  to: Option.none(),
  scale: Option.none(),
  out: Option.none(),
  share: Option.none(),
  encoder: Option.none(),
  short: Option.none(),
} as const;

const conflict = (over: Partial<Parameters<typeof jobOf>[0]>) =>
  Result.match(jobOf({ ...flags, ...over }), {
    onSuccess: () => 'none',
    onFailure: (e) => `${e.flag} ${e.rule} ${e.other}`,
  });

describe('jobOf', () => {
  test('a flag the job would ignore fails as FlagsConflict', () => {
    expect(conflict({ stills: Option.some([3]), span: Option.some({ from: 0, to: 9 }) })).toBe(
      'stills excludes scene',
    );
    expect(conflict({ stills: Option.some([3]), contact: Option.some(5) })).toBe(
      'stills excludes contact',
    );
    expect(conflict({ span: Option.some({ from: 0, to: 9 }), from: Option.some(2) })).toBe(
      'scene excludes from',
    );
    expect(conflict({ contact: Option.some(5), share: Option.some(false) })).toBe(
      'contact excludes share',
    );
    expect(conflict({ stills: Option.some([3]), scale: Option.some(0.5) })).toBe(
      'stills excludes scale',
    );
  });

  test('a video takes its range, scale and share; defaults when not given', () => {
    const job = Result.getOrThrow(
      jobOf({ ...flags, from: Option.some(2), to: Option.some(4), share: Option.some(false) }),
    );
    expect(job._tag).toBe('Video');
    expect(job).toMatchObject({ scale: 1, share: false, from: Option.some(2) });
    expect(Result.getOrThrow(jobOf(flags))).toMatchObject({ _tag: 'Video', share: true });
  });

  test('--scene sets the range of a contact sheet', () => {
    const job = Result.getOrThrow(
      jobOf({ ...flags, contact: Option.some(5), span: Option.some({ from: 3, to: 7 }) }),
    );
    expect(job).toMatchObject({
      _tag: 'Contact',
      every: 5,
      from: Option.some(3),
      to: Option.some(7),
    });
  });

  test('--short cuts the job to that short, and excludes --scene', () => {
    const short = {
      id: 'cut',
      title: 'A cut',
      spans: [{ scene: 'a', from: { scene: 'start' }, to: { scene: 'end' } }],
    } as const;
    const job = Result.getOrThrow(jobOf({ ...flags, short: Option.some(short) }));
    expect(job).toMatchObject({ _tag: 'Video', cut: Cut.Short({ short }) });
    expect(Result.getOrThrow(jobOf(flags))).toMatchObject({ cut: Cut.Whole() });
    expect(conflict({ short: Option.some(short), span: Option.some({ from: 0, to: 9 }) })).toBe(
      'short excludes scene',
    );
  });

  test('a short draws on its own page and writes under out/<film>/shorts', () => {
    const short = Cut.Short({
      short: {
        id: 'cut',
        title: 'A cut',
        spans: [{ scene: 'a', from: { scene: 'start' }, to: { scene: 'end' } }],
      },
    });
    expect(cutPage('film', Cut.Whole())).toBe('film');
    expect(cutPage('film', short)).toBe('film/shorts/cut');
    expect(cutBase('/out/film', Cut.Whole())).toBe('/out/film');
    expect(cutBase('/out/film', short)).toBe('/out/film/shorts/cut');
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

  test('about four chunks per page, so an idle page always has one to pull', () => {
    expect(planChunks(0, 2400, 4)).toHaveLength(16);
    expect(planChunks(0, 3000, 6)).toHaveLength(24);
  });

  test('never over eight seconds of frames, however few the pages', () => {
    const chunks = planChunks(0, 10_499, 6);
    expect(chunks).toHaveLength(Math.ceil(10_499 / MAX_CHUNK_FRAMES));
    expect(chunks.every((c) => c.to - c.from <= MAX_CHUNK_FRAMES)).toBe(true);
  });

  test('never under a second of frames', () => {
    const chunks = planChunks(3600, 4200, 4);
    expect(
      chunks.every((c, k, all) => k === all.length - 1 || c.to - c.from >= MIN_CHUNK_FRAMES),
    ).toBe(true);
    expect(planChunks(0, 45, 8).map((c) => [c.from, c.to])).toEqual([
      [0, 30],
      [30, 45],
    ]);
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

  test('a range from before the film starts at its first frame', () => {
    expect(frameSpan(testExportInfo, Option.some(-1), Option.some(2))).toEqual({
      start: 0,
      end: 60,
    });
  });

  test('--scene spans its scenes, from the layout', () => {
    const placed = layout(
      [
        { id: 'a', min: 4 },
        { id: 'b', min: 5 },
        { id: 'c', min: 6 },
      ],
      { voice: '', scenes: {} },
    );
    expect(Result.getOrThrow(sceneSpan(placed, ['b', 'c']))).toEqual({ from: 4, to: 15 });
    const unknown = Result.match(sceneSpan(placed, ['b', 'z']), {
      onSuccess: () => 'ok',
      onFailure: (e) => `${e._tag}:${e.scene}`,
    });
    expect(unknown).toBe('UnknownScene:z');
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
