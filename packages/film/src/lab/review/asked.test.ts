// Answers in the order they were asked: one landing after a newer ask's
// answer is dropped, and an ask knows when something was asked after it; a
// write's answer shows what it carries of each thing only through its asks.

import { describe, expect, test } from 'bun:test';
import { Exit, Option } from 'effect';
import { type Landed, newestAsked, sending } from './asked.ts';

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

/** A write's answer as the fake server gives it: the choices and the check it carries. */
interface Wrote {
  readonly choices: Option.Option<string>;
  readonly findings: Option.Option<string>;
}

const wrote = (choices: string, findings: string): Wrote => ({
  choices: Option.some(choices),
  findings: Option.some(findings),
});

describe('sending', () => {
  test('an older write landing after a newer one shows nothing the newer one showed', () => {
    const orders = { choices: newestAsked(), findings: newestAsked() };
    const older = sending(orders);
    const newer = sending(orders);
    const shown: Array<string> = [];
    const land = (landed: Landed<Wrote, string, 'choices' | 'findings'>) => {
      landed.show(
        'choices',
        (w) => w.choices,
        (c) => shown.push(c),
      );
      landed.show(
        'findings',
        (w) => w.findings,
        (f) => shown.push(f),
      );
    };
    land(newer(Exit.succeed(wrote('newer choices', 'newer warning'))));
    land(older(Exit.succeed(wrote('older choices', 'older clean'))));
    expect(shown).toEqual(['newer choices', 'newer warning']);
    expect(older(Exit.succeed(wrote('', ''))).overtaken('findings')).toBe(true);
  });

  test("a newer write that says nothing of a thing leaves an older one's to show", () => {
    const orders = { choices: newestAsked(), findings: newestAsked() };
    const pick = sending(orders);
    const say = sending(orders);
    const shown: Array<string> = [];
    const said: Wrote = { choices: Option.some('said choices'), findings: Option.none() };
    const sayLanded = say(Exit.succeed(said));
    expect(
      sayLanded.show(
        'findings',
        (w) => w.findings,
        (f) => shown.push(f),
      ),
    ).toBe(false);
    const pickLanded = pick(Exit.succeed(wrote('picked choices', 'pick warning')));
    expect(
      pickLanded.show(
        'findings',
        (w) => w.findings,
        (f) => shown.push(f),
      ),
    ).toBe(true);
    expect(
      pickLanded.show(
        'choices',
        (w) => w.choices,
        (c) => shown.push(c),
      ),
    ).toBe(true);
    // The say's choices were never shown, so the pick's are; it was overtaken, so the page reads again.
    expect(pickLanded.overtaken('choices')).toBe(true);
    expect(shown).toEqual(['pick warning', 'picked choices']);
  });

  test('a failed write shows nothing and says why', () => {
    const land = sending({ choices: newestAsked() });
    const landed = land(Exit.fail('refused'));
    expect(landed.succeeded).toBe(false);
    expect(landed.failure).toEqual(Option.some('refused'));
    expect(landed.show('choices', Option.some, () => {})).toBe(false);
  });
});
