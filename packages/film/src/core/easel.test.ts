// The easel's words: a place in a scene read and resolved to its frame (held
// inside the scene, a mark or cue it lacks named with the ones it has, seconds
// past its end refused), a crop read and held to the frame, a view's size and
// mode, the format a look takes unless told, and a still's file name.

import { describe, expect, test } from 'bun:test';
import { Result } from 'effect';
import {
  type SceneTimes,
  type StillView,
  cropOf,
  formatFor,
  lookAtOf,
  lookFileName,
  momentOf,
  viewBox,
} from './easel.ts';

/** A scene 10 s long from film second 4.01, a mark at 2 s, a cue from 1 to 3 s. */
const scene: SceneTimes = {
  id: 'roof',
  start: 4.01,
  dur: 10,
  marks: { see: 2 },
  cues: { lift: { start: 1, end: 3 } },
};

const plain: StillView = { mode: 'plain', captions: false, format: 'image/png' };

const failureTag = <A, E extends { readonly _tag: string }>(r: Result.Result<A, E>) =>
  Result.match(r, { onFailure: (e) => e._tag, onSuccess: () => 'none' });

describe('a place in a scene', () => {
  test('seconds, a mark and a cue share read as their kind', () => {
    expect(Result.getOrThrow(lookAtOf('2.5'))).toEqual({ _tag: 'Seconds', seconds: 2.5 });
    expect(Result.getOrThrow(lookAtOf('mark:see'))).toEqual({ _tag: 'Mark', mark: 'see' });
    expect(Result.getOrThrow(lookAtOf('cue:lift'))).toEqual({ _tag: 'Cue', cue: 'lift', share: 0 });
    expect(Result.getOrThrow(lookAtOf('cue:lift@0.5'))).toEqual({
      _tag: 'Cue',
      cue: 'lift',
      share: 0.5,
    });
  });

  test('words that name no place are refused', () => {
    for (const text of [
      '',
      'mark:',
      'cue:',
      'cue:lift@2',
      'cue:lift@',
      'cue:a@0.1@0.2',
      '-1',
      'soon',
    ])
      expect(failureTag(lookAtOf(text))).toBe('LookInvalid');
  });
});

describe('a moment', () => {
  test('a place is the nearest frame, and the time is that frame in the scene', () => {
    const at = Result.getOrThrow(momentOf(scene, 30, '2'));
    expect(at.frame).toBe(Math.round(6.01 * 30));
    expect(at.time).toBeCloseTo(at.frame / 30 - 4.01, 9);
    expect(at.at).toBe('2');
  });

  test('a mark is its word; a cue share is that far through the cue', () => {
    expect(Result.getOrThrow(momentOf(scene, 30, 'mark:see')).frame).toBe(Math.round(6.01 * 30));
    expect(Result.getOrThrow(momentOf(scene, 30, 'cue:lift@0.5')).frame).toBe(
      Math.round(6.01 * 30),
    );
  });

  test("the first and last moments are held inside the scene's own frames", () => {
    expect(Result.getOrThrow(momentOf(scene, 30, '0')).frame).toBe(Math.ceil(4.01 * 30));
    expect(Result.getOrThrow(momentOf(scene, 30, '10')).frame).toBe(Math.ceil(14.01 * 30) - 1);
  });

  test('a mark or cue the scene lacks is named with the ones it has', () => {
    const mark = momentOf(scene, 30, 'mark:nope');
    expect(Result.isFailure(mark) && mark.failure).toMatchObject({
      _tag: 'LookPlaceUnknown',
      kind: 'mark',
      place: 'nope',
      known: ['see'],
    });
    const cue = momentOf(scene, 30, 'cue:nope');
    expect(Result.isFailure(cue) && cue.failure).toMatchObject({ kind: 'cue', known: ['lift'] });
  });

  test('seconds past the end are out of range', () => {
    expect(failureTag(momentOf(scene, 30, '10.5'))).toBe('LookOutOfRange');
  });
});

describe('a view', () => {
  test('the whole frame at 1:1, plain', () => {
    expect(Result.getOrThrow(viewBox(plain, 1920, 1080))).toEqual({
      sx: 0,
      sy: 0,
      sw: 1920,
      sh: 1080,
      dw: 1920,
      dh: 1080,
      grey: false,
      blur: 0,
    });
  });

  test('a crop is held to the frame, corners in any order, and shown at 1:1', () => {
    const box = Result.getOrThrow(viewBox({ ...plain, crop: [2000, 600, 1600, -5] }, 1920, 1080));
    expect(box).toMatchObject({ sx: 1600, sy: 0, sw: 320, sh: 600, dw: 320, dh: 600 });
  });

  test('a crop wholly off the frame, or with no area, is refused', () => {
    expect(failureTag(viewBox({ ...plain, crop: [2000, 0, 2100, 100] }, 1920, 1080))).toBe(
      'LookInvalid',
    );
    expect(failureTag(viewBox({ ...plain, crop: [10, 10, 10, 50] }, 1920, 1080))).toBe(
      'LookInvalid',
    );
  });

  test('a size sets the long side', () => {
    const box = Result.getOrThrow(viewBox({ ...plain, size: 960 }, 1920, 1080));
    expect([box.dw, box.dh]).toEqual([960, 540]);
  });

  test('value is grey; squint is grey and blurred by 1.2% of the long side, at least 2 px', () => {
    expect(Result.getOrThrow(viewBox({ ...plain, mode: 'value' }, 1920, 1080))).toMatchObject({
      grey: true,
      blur: 0,
    });
    expect(Result.getOrThrow(viewBox({ ...plain, mode: 'squint' }, 1920, 1080))).toMatchObject({
      grey: true,
      blur: 23,
    });
    expect(
      Result.getOrThrow(viewBox({ ...plain, mode: 'squint', size: 100 }, 1920, 1080)).blur,
    ).toBe(2);
  });
});

describe('a crop and a format', () => {
  test('four numbers are a crop; anything else is refused', () => {
    expect(Result.getOrThrow(cropOf('1, 2,3,4.5'))).toEqual([1, 2, 3, 4.5]);
    for (const text of ['1,2,3', '1,2,3,4,5', '1,,3,4', 'a,b,c,d'])
      expect(failureTag(cropOf(text))).toBe('LookInvalid');
  });

  test('a crop is lossless; a whole frame is JPEG', () => {
    expect(formatFor(true)).toBe('image/png');
    expect(formatFor(false)).toBe('image/jpeg');
  });
});

describe("a still's file", () => {
  test('is named by its time, view and build', () => {
    const moment = { at: '2', frame: 180, time: 1.99 };
    expect(lookFileName(moment, plain, 'abc.3')).toBe('t0001.99.babc.3.png');
    expect(
      lookFileName(
        moment,
        { mode: 'squint', crop: [0, 0, 10, 10], size: 64, captions: true, format: 'image/jpeg' },
        'abc.3',
      ),
    ).toBe('t0001.99.squint.crop0_0_10_10.s64.captions.babc.3.jpg');
  });
});
