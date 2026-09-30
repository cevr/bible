import { describe, expect, test } from 'bun:test';
import { type Encoder, encoderName } from '../core/encoder.ts';
import { SETTINGS, chooseEncoder, config, qualities } from './encode.ts';

const hardware: Encoder = { _tag: 'Hardware' };
const software: Encoder = { _tag: 'Software' };

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
  test('the first candidate the browser can encode with is chosen, and no later one is asked', async () => {
    const { asked, can } = browser(['Hardware', 'Software']);
    expect(await chooseEncoder([hardware, software], can, 'none')).toEqual(hardware);
    expect(asked).toEqual(['Hardware']);
  });

  test('a Mac whose hardware encoder fails is missing one: it never falls to software', async () => {
    const { asked, can } = browser(['Software']);
    expect(await chooseEncoder([hardware], can, 'no hardware H.264')).toEqual({
      _tag: 'Missing',
      reason: 'no hardware H.264',
    });
    expect(asked).toEqual(['Hardware']);
  });

  test('the Linux box, allowed software, encodes in software', async () => {
    const { asked, can } = browser(['Software']);
    expect(await chooseEncoder([software], can, 'none')).toEqual(software);
    expect(asked).toEqual(['Software']);
  });

  test('an encoder is named for logs and the doctor in lower case', () => {
    expect(encoderName(hardware)).toBe('hardware');
    expect(encoderName(software)).toBe('software');
  });
});

describe('the encoder config', () => {
  test("each encoder's config takes its own acceleration and the quality it is handed", () => {
    for (const encoder of [hardware, software]) {
      const quality = SETTINGS[encoder._tag].master;
      expect(config(1920, 1080, 1, encoder, quality)).toMatchObject({
        codec: 'avc',
        quality,
        hardwareAcceleration: SETTINGS[encoder._tag].hardwareAcceleration,
      });
    }
  });

  test('a render at full scale is not resized; a scaled one resizes to even dimensions', () => {
    expect(config(1920, 1080, 1, hardware, SETTINGS.Hardware.master).transform).toBeUndefined();
    expect(config(1920, 3414, 0.5625, hardware, SETTINGS.Hardware.master).transform).toEqual({
      width: 1080,
      height: 1920,
      fit: 'fill',
    });
  });
});

describe('what the page encodes', () => {
  test('the share copy is checked and encoded only when one is made', () => {
    expect(qualities(hardware, true)).toEqual([SETTINGS.Hardware.master, SETTINGS.Hardware.share]);
    expect(qualities(hardware, false)).toEqual([SETTINGS.Hardware.master]);
  });

  test('the software encoder makes no share copy in the page: x264 makes it from the master', () => {
    expect(SETTINGS.Software.share).toBeNull();
    expect(qualities(software, true)).toEqual([SETTINGS.Software.master]);
  });
});
