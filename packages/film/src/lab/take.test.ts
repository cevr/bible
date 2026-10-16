// A beat's take as a page plays it: the attempt named, else the one kept,
// else the staging take the timings name, each with its audio's URL; none
// when the beat has none of these.

import { describe, expect, it } from 'bun:test';
import { Option } from 'effect';
import { attemptUrl } from '../core/api.ts';
import type { StudioAttempt, StudioAttempts } from '../core/studio.ts';
import { narrationFileUrl } from '../player/narrated.ts';
import { takeHeard } from './take.ts';

const attempt = (file: string, kept: boolean): StudioAttempt => ({
  file,
  transcript: `heard ${file}`,
  wer: 0,
  at: 1,
  duration: 3,
  kept,
  current: true,
});

const read = (
  attempts: ReadonlyArray<StudioAttempt>,
  staged?: StudioAttempts['staged'],
): StudioAttempts =>
  Option.match(Option.fromUndefinedOr(staged), {
    onNone: () => ({ beat: 'cold', attempts }),
    onSome: (s) => ({ beat: 'cold', attempts, staged: s }),
  });

describe("a beat's take as a page plays it", () => {
  it('plays the attempt named, with what was heard', () => {
    const take = takeHeard(
      'rbf',
      read([attempt('a.flac', true), attempt('b.flac', false)]),
      Option.some('b.flac'),
    );
    expect(take).toEqual(
      Option.some({
        url: attemptUrl('rbf', 'cold', 'b.flac'),
        source: 'recorded',
        heard: Option.some('heard b.flac'),
        duration: 3,
      }),
    );
  });

  it('plays the attempt kept when none is named, before a staging take', () => {
    const take = takeHeard(
      'rbf',
      read([attempt('a.flac', true)], { file: 'cold.0cbdb0cac54f.flac', duration: 2 }),
      Option.none(),
    );
    expect(Option.map(take, (t) => t.url)).toEqual(
      Option.some(attemptUrl('rbf', 'cold', 'a.flac')),
    );
  });

  it("plays the staging take the timings name when no attempt is kept, from the film's narration", () => {
    const take = takeHeard(
      'rbf',
      read([attempt('a.flac', false)], { file: 'cold.0cbdb0cac54f.flac', duration: 2 }),
      Option.none(),
    );
    expect(take).toEqual(
      Option.some({
        url: narrationFileUrl('rbf', 'cold.0cbdb0cac54f.flac'),
        source: 'staging',
        heard: Option.none(),
        duration: 2,
      }),
    );
    expect(narrationFileUrl('rbf', 'cold.0cbdb0cac54f.flac')).toBe(
      '/films/rbf/narration/cold.0cbdb0cac54f.flac',
    );
  });

  it('plays none when no take is kept, none is staged, or the attempt named is not there', () => {
    expect(takeHeard('rbf', read([attempt('a.flac', false)]), Option.none())).toEqual(
      Option.none(),
    );
    expect(takeHeard('rbf', read([attempt('a.flac', true)]), Option.some('z.flac'))).toEqual(
      Option.none(),
    );
  });
});
