// The page's keys: each press reaches `take` with its key, its physical key,
// its modifiers and its target; a press `take` takes has its default
// prevented; a press already handled or composing text is not heard; once
// interrupted, nothing more is heard.

import { describe, expect, test } from 'bun:test';
import { Effect, Option } from 'effect';
import { hostOf } from './host.ts';
import { appleAgent, type KeyPress, Keys } from './keys.ts';

/** A key press of `key` (with `held` modifiers), cancelable as the browser's are. */
const keydown = (
  key: string,
  held: Partial<Record<'shiftKey' | 'metaKey' | 'altKey' | 'isComposing', boolean>> & {
    readonly code?: string;
  } = {},
) => Object.assign(new Event('keydown', { cancelable: true }), { key, ...held });

/** A page the presses are aimed at: the presses `take` heard, and a way to stop hearing. */
const page = (take: (press: KeyPress) => boolean = () => false) => {
  const focused = new EventTarget();
  const heard: Array<KeyPress> = [];
  const stop = Effect.runCallbackWith(hostOf(Keys.layerOn(focused)))(
    Keys.use((keys) =>
      keys.listen((press) => {
        heard.push(press);
        return take(press);
      }),
    ),
  );
  return { focused, heard, stop, press: (e: Event) => (focused.dispatchEvent(e), e) };
};

describe('Keys.listen', () => {
  test('a press reaches take with its key, code, modifiers and target; one it takes has its default prevented', () => {
    const p = page((press) => press.key === 'ArrowRight');
    const taken = p.press(keydown('ArrowRight', { shiftKey: true, code: 'ArrowRight' }));
    const left = p.press(keydown('ø', { altKey: true, code: 'KeyO' }));
    expect(p.heard).toEqual([
      {
        key: 'ArrowRight',
        code: 'ArrowRight',
        shift: true,
        meta: false,
        ctrl: false,
        alt: false,
        target: Option.some(p.focused),
      },
      {
        key: 'ø',
        code: 'KeyO',
        shift: false,
        meta: false,
        ctrl: false,
        alt: true,
        target: Option.some(p.focused),
      },
    ]);
    expect([taken.defaultPrevented, left.defaultPrevented]).toEqual([true, false]);
  });

  test('a press a control has handled, or one composing text, is not heard', () => {
    const p = page(() => true);
    const handled = keydown('ArrowDown');
    handled.preventDefault();
    p.press(handled);
    p.press(keydown('k', { isComposing: true }));
    expect(p.heard).toEqual([]);
  });

  test('interrupted, it hears nothing more', () => {
    const p = page(() => true);
    p.stop();
    const after = p.press(keydown(' '));
    expect(p.heard).toEqual([]);
    expect(after.defaultPrevented).toBe(false);
  });
});

test("a Mac's or an Apple device's User-Agent keys as a Mac; Linux's, Windows' and Android's do not", () => {
  const agents = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/154.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
    '',
  ];
  expect(agents.map((a) => appleAgent(a))).toEqual([
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
  ]);
});
