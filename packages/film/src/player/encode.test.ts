import { describe, expect, test } from 'bun:test';
import { type Encoder, encoderName } from '../core/encoder.ts';
import { chooseEncoder } from './encode.ts';

/** A browser that encodes with `have`, recording each encoder it was asked about. */
const browser = (have: ReadonlyArray<Encoder['_tag']>) => {
  const asked: Array<Encoder['_tag']> = [];
  const can = (encoder: Encoder) => {
    asked.push(encoder._tag);
    return Promise.resolve(have.includes(encoder._tag));
  };
  return { asked, can };
};

describe('chooseEncoder', () => {
  test('a machine with the hardware encoder (the Mac) uses it, and software is never asked', async () => {
    const { asked, can } = browser(['Hardware', 'Software']);
    expect(await chooseEncoder(can, 'none')).toEqual({ _tag: 'Hardware' });
    expect(asked).toEqual(['Hardware']);
  });

  test('a machine with no hardware encoder (the Linux Workbox) encodes in software', async () => {
    const { asked, can } = browser(['Software']);
    expect(await chooseEncoder(can, 'none')).toEqual({ _tag: 'Software' });
    expect(asked).toEqual(['Hardware', 'Software']);
  });

  test('a browser with neither is missing one, and says why', async () => {
    const { can } = browser([]);
    expect(await chooseEncoder(can, 'no H.264 at 1920×1080')).toEqual({
      _tag: 'Missing',
      reason: 'no H.264 at 1920×1080',
    });
  });

  test('an encoder is named for logs and the doctor in lower case', () => {
    expect(encoderName({ _tag: 'Hardware' })).toBe('hardware');
    expect(encoderName({ _tag: 'Software' })).toBe('software');
  });
});
