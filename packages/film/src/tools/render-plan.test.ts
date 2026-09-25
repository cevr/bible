import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import { layout } from '../core/layout.ts';
import {
  MIN_CHUNK_FRAMES,
  contactTimes,
  frameSpan,
  muxArgs,
  planChunks,
  sceneSpan,
  stillName,
} from './render-plan.ts';
import { testExportInfo } from './testing.ts';

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
    expect(planChunks(0, 10_499, 6)).toHaveLength(24);
    expect(planChunks(0, 2400, 4)).toHaveLength(16);
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

describe('muxArgs', () => {
  test('the audio is cut from the WAV master and encoded once, with -t, not -shortest', () => {
    const args = muxArgs(
      'list.txt',
      Option.some({ file: 'full.wav', start: 120, duration: 20 }),
      'out.mp4',
    );
    expect(args.join(' ')).toContain('-ss 120.000000 -t 20.000000 -i full.wav -c:a aac');
    expect(args).not.toContain('-shortest');
  });

  test('a film with no track muxes video only', () => {
    expect(muxArgs('list.txt', Option.none(), 'out.mp4')).not.toContain('-c:a');
  });
});
