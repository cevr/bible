// The take limit, derived from the body the studio reads (STUDIO_MAX_BODY)
// and the capture's rate: the longest recording whose post, a 24-bit mono
// WAV in base64 in JSON, still fits, so the recorder can show it, warn near
// it and stop before it. A take the server still refuses as too large says
// so in time, not bytes.

import { describe, expect, test } from 'bun:test';
import { BodyTooLarge, SttUntimed } from '../../core/refusals.ts';
import { STUDIO_MAX_BODY } from '../../core/studio.ts';
import { takeBody, takeLimit, tooLong } from './api.ts';
import { encodeWav } from './wav.ts';

// The body is ASCII (base64 in JSON): a character is a byte.
const bodyBytes = (frames: number, rate: number) =>
  takeBody(encodeWav({ rate, samples: new Float32Array(frames) })).length;

describe('the take limit', () => {
  test('is the longest take whose post still fits the body the studio reads', () => {
    const { frames } = takeLimit(44100);
    expect(bodyBytes(frames, 44100)).toBeLessThanOrEqual(STUDIO_MAX_BODY);
    expect(bodyBytes(frames + 1, 44100)).toBeGreaterThan(STUDIO_MAX_BODY);
  }, 60_000);

  test('is a length of time at the capture rate: shorter at a higher rate', () => {
    expect(takeLimit(44100).seconds).toBeCloseTo(380.4, 1);
    expect(takeLimit(48000).seconds).toBeCloseTo(349.5, 1);
    expect(takeLimit(96000).seconds).toBeCloseTo(174.8, 1);
  });

  test('a take refused as too large says how long it is and how long a take may be', () => {
    const wav = encodeWav({ rate: 44100, samples: new Float32Array(44100 * 400) });
    expect(tooLong(wav)(BodyTooLarge.make({ limit: STUDIO_MAX_BODY })).message).toBe(
      'the take is 6 min 40 s long, and at 44.1 kHz the lab takes at most 6 min 20 s: record the beat in a shorter take',
    );
    const other = SttUntimed.make({ file: 'a.wav', heard: 3 });
    expect(tooLong(wav)(other)).toBe(other);
  });
});
