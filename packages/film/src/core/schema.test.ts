import { describe, expect, test } from 'bun:test';
import { Result, Schema } from 'effect';
import {
  CuePatch,
  type Span,
  Timed,
  Timings,
  TimingsJson,
  type VoiceTiming,
  type Word,
} from './schema.ts';

const take: VoiceTiming = {
  hash: 'h',
  file: 'a.mp3',
  duration: 2,
  words: [
    { text: 'Look', start: 0, end: 0.4 },
    { text: 'and', start: 0.5, end: 0.8 },
    { text: 'live.', start: 0.9, end: 2 },
  ],
};

const decodes = (a: VoiceTiming) =>
  Result.isSuccess(Schema.decodeResult(Timings)({ voice: 'v', scenes: { a } }));

/** `take` with word `i` changed. */
const withWord = (i: number, word: Partial<Word>): VoiceTiming => ({
  ...take,
  words: take.words.map((w, k) => {
    if (k !== i) return w;
    return { ...w, ...word };
  }),
});

describe('Timings', () => {
  test('a well-formed take decodes from its file, and encodes back', () => {
    const text = Schema.encodeSync(TimingsJson)({ voice: 'v', scenes: { a: take } });
    expect(Schema.encodeSync(TimingsJson)(Schema.decodeSync(TimingsJson)(text))).toBe(text);
  });

  test('a take with no words (a silent take) decodes', () => {
    expect(decodes({ ...take, words: [] })).toBe(true);
  });

  test('refuses a negative duration', () => {
    expect(decodes({ ...take, duration: -5 })).toBe(false);
  });

  test('refuses a word that starts before 0 or ends before it starts', () => {
    expect(decodes(withWord(0, { start: -0.1 }))).toBe(false);
    expect(decodes(withWord(1, { start: 0.9, end: 0.6 }))).toBe(false);
  });

  test('refuses words out of order', () => {
    expect(decodes(withWord(2, { start: 0.2 }))).toBe(false);
  });

  test('refuses a word that ends after the take', () => {
    expect(decodes(withWord(2, { start: 99, end: 99.5 }))).toBe(false);
    // Within the tolerance the take's measured length is allowed to differ by.
    expect(decodes(withWord(2, { end: 2.01 }))).toBe(true);
  });
});

describe('Timed', () => {
  /** A scene as JSON text, decoded as the tools decode a scene module. */
  const decodes = (json: string) =>
    Result.isSuccess(Schema.decodeResult(Schema.fromJsonString(Timed))(json));

  test('a span may name an ease; an ease the kit lacks is refused', () => {
    expect(decodes('{"id":"a","timeline":{"slam":{"mark":"m","ease":"outBack"}}}')).toBe(true);
    expect(decodes('{"id":"a","timeline":{"slam":{"mark":"m","ease":"bouncy"}}}')).toBe(false);
  });

  test('refuses negative time: a lead, tail, min, span dur or transition dur below 0', () => {
    expect(decodes('{"id":"a","lead":0,"tail":0.6,"min":3}')).toBe(true);
    expect(decodes('{"id":"a","lead":-1}')).toBe(false);
    expect(decodes('{"id":"a","tail":-0.1}')).toBe(false);
    expect(decodes('{"id":"a","min":-3}')).toBe(false);
    expect(decodes('{"id":"a","timeline":{"slam":{"mark":"m","dur":-0.2}}}')).toBe(false);
    for (const kind of ['fade', 'pan', 'ink'])
      expect(decodes(`{"id":"a","enter":{"kind":"${kind}","dur":-1}}`)).toBe(false);
    // An offset moves a cue either way from its anchor.
    expect(decodes('{"id":"a","timeline":{"slam":{"mark":"m","offset":-0.4}}}')).toBe(true);
  });

  test('a span ends by its dur or on a mark (`until`), never both', () => {
    const spans: ReadonlyArray<Span> = [
      { mark: 'm', dur: 1 },
      { after: 'a', until: 'n' },
      // @ts-expect-error: a span that ends both ways does not type
      { mark: 'm', dur: 1, until: 'n' },
    ];
    expect(spans).toHaveLength(3);
    expect(decodes('{"id":"a","timeline":{"walk":{"mark":"m","until":"n"}}}')).toBe(true);
    expect(decodes('{"id":"a","timeline":{"walk":{"mark":"m","dur":1,"until":"n"}}}')).toBe(false);
  });

  test('a stagger is a share of the cue, 0 to 1', () => {
    expect(decodes('{"id":"a","timeline":{"drop":{"mark":"m","dur":1,"stagger":0.5}}}')).toBe(true);
    expect(decodes('{"id":"a","timeline":{"drop":{"mark":"m","stagger":1.2}}}')).toBe(false);
    expect(decodes('{"id":"a","timeline":{"drop":{"mark":"m","stagger":-0.1}}}')).toBe(false);
  });

  test('knobs are numbers or points, nothing else', () => {
    expect(decodes('{"id":"a","knobs":{"handY":800,"quoteAt":[960,170]}}')).toBe(true);
    expect(decodes('{"id":"a","knobs":{"handY":"800"}}')).toBe(false);
    expect(decodes('{"id":"a","knobs":{"quoteAt":[960]}}')).toBe(false);
    expect(decodes('{"id":"a","knobs":{"handY":null}}')).toBe(false);
  });

  test('a scene may say it is a storyboard card, and only with true', () => {
    expect(decodes('{"id":"a","storyboard":true}')).toBe(true);
    expect(decodes('{"id":"a","storyboard":false}')).toBe(false);
  });
});

describe('CuePatch', () => {
  const decodes = (json: string) =>
    Result.isSuccess(Schema.decodeResult(Schema.fromJsonString(CuePatch))(json));

  test('sets an until, or a dur, but not both; never a negative dur', () => {
    expect(decodes('{"until":"gift"}')).toBe(true);
    expect(decodes('{"dur":1,"offset":-0.2}')).toBe(true);
    expect(decodes('{"dur":1,"until":"gift"}')).toBe(false);
    expect(decodes('{"dur":-1}')).toBe(false);
    expect(decodes('{}')).toBe(false);
  });
});
