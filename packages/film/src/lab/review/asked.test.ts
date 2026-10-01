// Answers in the order they were asked: one landing after a newer ask's
// answer is dropped, and an ask knows when something was asked after it.

import { describe, expect, test } from 'bun:test';
import { newestAsked } from './asked.ts';

describe('newestAsked', () => {
  test('an older answer landing after a newer one is not shown', () => {
    const asks = newestAsked();
    const read = asks.ask();
    const say = asks.ask();
    const shown: Array<string> = [];
    expect(say.answer(() => shown.push('say'))).toBe(true);
    expect(read.answer(() => shown.push('read'))).toBe(false);
    expect(shown).toEqual(['say']);
  });

  test('answers landing in the order asked are all shown', () => {
    const asks = newestAsked();
    const first = asks.ask();
    const second = asks.ask();
    const shown: Array<string> = [];
    first.answer(() => shown.push('first'));
    second.answer(() => shown.push('second'));
    expect(shown).toEqual(['first', 'second']);
  });

  test('an ask is overtaken once something is asked after it', () => {
    const asks = newestAsked();
    const say = asks.ask();
    expect(say.overtaken()).toBe(false);
    asks.ask();
    expect(say.overtaken()).toBe(true);
  });
});
