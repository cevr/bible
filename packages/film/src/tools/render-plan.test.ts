import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import {
  MAX_CHUNK_FRAMES,
  MIN_CHUNK_FRAMES,
  contactTimes,
  flagConflicts,
  jobOf,
  frameSpan,
  planChunks,
  sceneSpan,
  stillName,
} from './render-plan.ts';
import { testExportInfo } from './testing.ts';

const flags = {
  tag: 't',
  captions: true,
  workers: 4,
  stills: Option.none(),
  contact: Option.none(),
  span: Option.none(),
  from: Option.none(),
  to: Option.none(),
  scale: Option.none(),
  out: Option.none(),
  share: Option.none(),
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
