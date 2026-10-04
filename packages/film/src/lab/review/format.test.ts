// What the review's cards say of a file, and which copy of a video it plays.

import { Option } from 'effect';
import { describe, expect, test } from 'bun:test';
import type { ReviewFolder, ReviewVideo } from '../../core/review.ts';
import { agoText, captionsFor, countsText, sizeText, videoSource } from './format.ts';

const file = (name: string, size = 10) => ({ ref: `out/f/${name}`, name, size, mtime: 0 });
const video = (name: string, phone: ReviewVideo['phone']): ReviewVideo => ({
  ...file(name),
  phone,
});

describe('what a card says', () => {
  test('sizes and ages', () => {
    expect(sizeText(812)).toBe('812 B');
    expect(sizeText(2.5 * 1024 ** 3)).toBe('2.5 GB');
    const now = 1_000_000_000;
    expect(agoText(now - 30_000, now)).toBe('just now');
    expect(agoText(now - 12 * 60_000, now)).toBe('12 min ago');
    expect(agoText(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(agoText(now - 2 * 86_400_000, now)).toBe('2 d ago');
  });

  test('plays the proxy once it is made, never the original in its place, and the original when asked for', () => {
    expect(videoSource(video('a b.mp4', 'ready'), 'phone')).toEqual(
      Option.some('/api/review/phone/out/f/a%20b.mp4'),
    );
    expect(videoSource(video('a b.mp4', 'pending'), 'phone')).toEqual(Option.none());
    expect(videoSource(video('a b.mp4', 'none'), 'phone')).toEqual(
      Option.some('/api/review/files/out/f/a%20b.mp4'),
    );
    expect(videoSource(video('a b.mp4', 'ready'), 'full')).toEqual(
      Option.some('/api/review/files/out/f/a%20b.mp4'),
    );
    expect(videoSource(video('a b.mp4', 'pending'), 'full')).toEqual(
      Option.some('/api/review/files/out/f/a%20b.mp4'),
    );
  });

  test("finds a video's captions, a share copy's by its master", () => {
    const docs = [file('roof.A.vtt'), file('notes.md')];
    expect(captionsFor(file('roof.A.share.mp4'), docs)).toEqual(Option.some(file('roof.A.vtt')));
    expect(captionsFor(file('roof.B.mp4'), docs)).toEqual(Option.none());
  });

  test("counts a folder's things", () => {
    const folder: ReviewFolder = {
      ref: 'art3/out',
      title: Option.some('Roofs at dusk'),
      blurb: Option.none(),
      mtime: 0,
      sets: [],
      videos: [video('a.mp4', 'none'), video('b.mp4', 'none')],
      images: [],
      docs: [file('notes.md')],
    };
    expect(countsText(folder)).toBe('2 videos · 1 doc');
  });
});
