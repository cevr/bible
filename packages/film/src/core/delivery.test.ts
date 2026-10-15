import { describe, expect, test } from 'bun:test';
import { Option, Result } from 'effect';
import {
  HOLD_DEFAULT,
  type Mark,
  compileDelivery,
  holdsIn,
  marksMisfit,
  paceBand,
  sentText,
  shiftedBy,
  spokenAlignment,
  wordsAMinute,
} from './delivery.ts';
import { DeliveryInvalid } from './errors.ts';
import { deliveredAs, parse, takeState, withDelivery } from './narration.ts';
import type { Timings, VoiceTiming } from './schema.ts';

const parsed = (text: string) => Result.getOrThrow(parse('s', text));
const failure = (text: string) => Result.getOrThrow(Result.flip(parse('s', text)));

describe('delivery marks in a line', () => {
  test('are never spoken, and land on the word after them or the gap before it', () => {
    const p = parsed('He spoke {*}slowly, {/} and {*}impressively. {//1.2} Faith.');
    expect(p.spoken).toBe('He spoke slowly, and impressively. Faith.');
    expect(p.delivery).toEqual([
      { _tag: 'Stress', word: 2 },
      { _tag: 'Breath', before: 3 },
      { _tag: 'Stress', word: 4 },
      { _tag: 'Hold', before: 5, seconds: 1.2 },
    ]);
  });

  test('a hold names its seconds or holds the default', () => {
    expect(parsed('Not by works. {//} By faith.').delivery).toEqual([
      { _tag: 'Hold', before: 3, seconds: HOLD_DEFAULT },
    ]);
  });

  test('sit beside cues and turns, which stay as they were', () => {
    const p = parsed('{open}That is the law. {@ask}So {/} where does that {*}leave us?');
    expect(p.spoken).toBe('That is the law. So where does that leave us?');
    expect(p.marks.get('open')).toBe(0);
    expect(p.turns).toEqual([{ word: 4, voice: 'ask' }]);
    expect(p.delivery).toEqual([
      { _tag: 'Breath', before: 5 },
      { _tag: 'Stress', word: 8 },
    ]);
  });

  test('a line with none parses as before', () => {
    expect(parsed('Just words, {cue}here.').delivery).toEqual([]);
  });

  test.each([
    ['{/} At the start.', 'pauses outside the line'],
    ['At the end. {//}', 'pauses outside the line'],
    ['Two {/} {//} pauses.', 'is a second pause in one gap'],
    ['A {//9} long hold.', 'outside'],
    ['A {/2} timed breath.', 'takes no seconds'],
    ['A {*2}word.', 'takes no seconds'],
    ['A {what? is} this.', 'is no cue'],
    ['A stray } brace.', 'is no cue'],
  ])('%p fails naming why', (text, why) => {
    const error = failure(text);
    expect(error).toBeInstanceOf(DeliveryInvalid);
    expect(error._tag === 'DeliveryInvalid' && error.reason).toContain(why);
  });

  test('misfits are found by word count', () => {
    const marks: ReadonlyArray<Mark> = [{ _tag: 'Stress', word: 3 }];
    expect(Option.isSome(marksMisfit(marks, 3))).toBe(true);
    expect(Option.isNone(marksMisfit(marks, 4))).toBe(true);
  });
});

describe('withDelivery', () => {
  test('writes marks back where they read, cues and spacing kept', () => {
    const text = '{open}That is the law. {@ask}So where does that leave us?';
    const marks: ReadonlyArray<Mark> = [
      { _tag: 'Stress', word: 0 },
      { _tag: 'Hold', before: 4, seconds: 1.5 },
      { _tag: 'Stress', word: 8 },
    ];
    const marked = withDelivery(text, marks);
    expect(marked).toBe('{open}{*}That is the law. {//1.5} {@ask}So where does that {*}leave us?');
    expect(parsed(marked).delivery).toEqual(marks);
    expect(parsed(marked).spoken).toBe(parsed(text).spoken);
  });

  test('takes marks out, and gives a canonical line back as written', () => {
    const line = 'He spoke {*}slowly, {/} and {*}impressively. {//1.2} Faith.';
    expect(withDelivery(line, [])).toBe('He spoke slowly, and impressively. Faith.');
    expect(withDelivery(line, parsed(line).delivery)).toBe(line);
  });
});

describe('compileDelivery', () => {
  const words = ['Not', 'by', 'works.', 'By', 'faith.'];
  const marks: ReadonlyArray<Mark> = [
    { _tag: 'Hold', before: 3, seconds: 1.5 },
    { _tag: 'Breath', before: 1 },
    { _tag: 'Stress', word: 4 },
  ];

  test('v4 and v3 take audio tags and capitals, and no speed', () => {
    for (const model of ['eleven_v4', 'eleven_v3']) {
      const c = compileDelivery(words, marks, model, Option.some(140));
      expect(sentText(c)).toBe('Not [pause] by works. [pause] By FAITH.');
      expect(c.holds).toEqual([{ before: 3, seconds: 1.5 }]);
      expect(c.speed).toEqual(Option.none());
      expect(c.approximate.map((m) => m._tag)).toEqual(['Breath', 'Stress']);
    }
  });

  test('the earlier models take SSML breaks and a speed, and no stress', () => {
    const c = compileDelivery(words, marks, 'eleven_multilingual_v2', Option.some(140));
    expect(sentText(c)).toBe('Not <break time="0.3s" /> by works. <break time="1.5s" /> By faith.');
    expect(c.speed).toEqual(Option.some(1.11));
  });

  test('a line with no marks is sent as written', () => {
    expect(sentText(compileDelivery(words, [], 'eleven_v4'))).toBe(words.join(' '));
  });

  test('speed stays inside what the models take', () => {
    const speed = (natural: Option.Option<number>) =>
      compileDelivery(words, [], 'eleven_flash_v2_5', natural).speed;
    expect(speed(Option.some(60))).toEqual(Option.some(1.2));
    expect(speed(Option.some(400))).toEqual(Option.some(0.7));
    expect(speed(Option.none())).toEqual(Option.none());
  });
});

describe('the take of a compiled line', () => {
  test('its alignment drops what was sent as a direction', () => {
    const chars = [...'a [pause] b'];
    const at = chars.map((_, i) => i / 10);
    const a = spokenAlignment(chars, at, at, [2]);
    expect(a.chars.join('')).toBe('a  b');
    expect(a.starts).toEqual([0, 0.1, 0.9, 1]);
    expect(a.breaks).toEqual([2]);
  });

  test('holds become gap edits, latest first, and words move with them', () => {
    const takeWords = [
      { start: 0, end: 0.5 },
      { start: 0.7, end: 1 },
      { start: 1.2, end: 1.5 },
    ];
    const edits = holdsIn(takeWords, [
      { before: 1, seconds: 1 },
      { before: 2, seconds: 0.2 },
    ]);
    expect(edits).toEqual([{ at: 0.6, by: 0.8 }]);
    expect(shiftedBy(takeWords, edits)).toEqual([
      { start: 0, end: 0.5 },
      { start: 1.5, end: 1.8 },
      { start: 2, end: 2.3 },
    ]);
    expect(holdsIn(takeWords, [{ before: 1, seconds: 0.05 }])[0]?.by).toBeCloseTo(-0.15);
  });

  test('pace is words a minute against the band', () => {
    expect(wordsAMinute(31, 12)).toEqual(Option.some(155));
    expect(wordsAMinute(0, 12)).toEqual(Option.none());
    expect([paceBand(140), paceBand(155), paceBand(170)]).toEqual(['slow', 'in', 'fast']);
  });
});

describe('a staging take with marks', () => {
  const marks: ReadonlyArray<Mark> = [{ _tag: 'Stress', word: 1 }];
  const timings = (
    delivered: Pick<VoiceTiming, 'delivered'> = {},
    source: 'elevenlabs' | 'recorded' = 'elevenlabs',
  ): Timings => ({
    voice: 'v',
    scenes: {
      a: { hash: '811c9dc5', file: 'a.mp3', duration: 1, words: [], source, ...delivered },
    },
  });

  test('is current only under the marks it was read with', () => {
    const key = deliveredAs(marks);
    expect(key.delivered).toBeString();
    expect(deliveredAs([])).toEqual({});
    expect(takeState('a', '', timings(key), 'v', marks)._tag).toBe('Staging');
    expect(takeState('a', '', timings(), 'v', marks)).toMatchObject({
      _tag: 'Stale',
      reason: 'text changed',
    });
    expect(takeState('a', '', timings(key), 'v', [])._tag).toBe('Stale');
    expect(takeState('a', '', timings(), 'v', [])._tag).toBe('Staging');
  });

  test('a person’s take is judged by its words alone', () => {
    expect(takeState('a', '', timings({}, 'recorded'), 'v', marks)._tag).toBe('Recorded');
  });
});
