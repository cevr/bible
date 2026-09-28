import { describe, expect, test } from 'bun:test';
import { Option, Schema } from 'effect';
import { EncoderName, encoderCandidates, encoderNamed } from './encoder.ts';

describe('encoderCandidates', () => {
  test('macOS renders on the hardware encoder only', () => {
    expect(encoderCandidates('darwin', Option.none())).toEqual([{ _tag: 'Hardware' }]);
  });

  test('a platform with no hardware path (Linux) renders in software', () => {
    expect(encoderCandidates('linux', Option.none())).toEqual([{ _tag: 'Software' }]);
  });

  test('--encoder software is the one way the Mac renders in software', () => {
    expect(encoderCandidates('darwin', Option.some(encoderNamed('software')))).toEqual([
      { _tag: 'Software' },
    ]);
    expect(encoderCandidates('linux', Option.some(encoderNamed('hardware')))).toEqual([
      { _tag: 'Hardware' },
    ]);
  });
});

describe('EncoderName', () => {
  test('is hardware or software, nothing else', () => {
    expect(EncoderName.literals).toEqual(['hardware', 'software']);
    expect(Schema.is(EncoderName)('gpu')).toBe(false);
  });
});
