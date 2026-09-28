import { describe, expect, test } from 'bun:test';
import { lineError, spokenWords } from './spoken.ts';

const none = {};

describe('lineError: a correct reading is not a mismatch', () => {
  test('numbers read as words or written as digits, grouped or not', () => {
    for (const heard of [
      'the 144000 stood',
      'the 144,000 stood',
      'the one hundred forty-four thousand stood',
      'the one hundred and forty four thousand stood',
      'the 144 thousand stood',
    ])
      expect([heard, lineError('The 144,000 stood.', heard, none)]).toEqual([heard, 0]);
  });

  test('a year read in pairs', () => {
    expect(
      lineError('In 1888, at Minneapolis.', 'in eighteen eighty-eight at Minneapolis', none),
    ).toBe(0);
    expect(lineError('Since 2001.', 'since two thousand and one', none)).toBe(0);
  });

  test('a scripture reference read aloud', () => {
    for (const heard of [
      'Zechariah chapter three verses one through four',
      'Zechariah 3, 1 to 4',
      'Zechariah three one to four',
      'Zechariah 3:1-4',
    ])
      expect([heard, lineError('Read Zechariah 3:1-4.', `read ${heard}`, none)]).toEqual([
        heard,
        0,
      ]);
  });

  test('an abbreviation read out in full', () => {
    expect(lineError('Mrs. White wrote it.', 'Missus White wrote it', none)).toBe(0);
    expect(lineError('Dr. Waggoner spoke.', 'doctor Waggoner spoke', none)).toBe(0);
    expect(lineError('St. Paul wrote.', 'Saint Paul wrote', none)).toBe(0);
  });

  test("a name the transcriber writes another way, as the script's heardAs names it", () => {
    const heardAs = { Ellet: ['Elliot', 'Elliott'], Waggoner: ['Wagner'] };
    expect(lineError('Ellet Waggoner preached.', 'Elliot Wagner preached', heardAs)).toBe(0);
    expect(lineError('Ellet Waggoner preached.', 'Elliott Waggoner preached', heardAs)).toBe(0);
    // Without it, the name is a misheard word.
    expect(lineError('Ellet Waggoner preached.', 'Elliot Waggoner preached', none)).toBeCloseTo(
      1 / 3,
    );
  });
});

describe('lineError: a wrong reading still is', () => {
  test('another word, another number, a skipped reference', () => {
    expect(lineError('The law and the gospel.', 'the law and the prophets', none)).toBeCloseTo(0.2);
    expect(lineError('The 144,000 stood.', 'the 140,000 stood', none)).toBeGreaterThan(0);
    expect(lineError('Read Zechariah 3:1-4.', 'read Zechariah 3:1-5', none)).toBeGreaterThan(0);
    // An alias is the script's word only: it does not excuse the word elsewhere.
    expect(lineError('Waggoner preached.', 'Elliot preached', { Ellet: ['Elliot'] })).toBe(0.5);
  });
});

describe('spokenWords', () => {
  test('prose is left as normalizeWords reads it', () => {
    expect(spokenWords('Grace, freely GIVEN.')).toEqual(['grace', 'freely', 'given']);
    expect(spokenWords("It's God’s verse.")).toEqual(['its', 'gods', 'verse']);
  });
});
