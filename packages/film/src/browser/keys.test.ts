// The page's keys: each press reaches `take` with its modifiers and one
// answer to whether it is typing (a field: an input, a textarea, a select;
// or editable text); a press `take` takes has its default prevented; once
// interrupted, nothing more is heard.

import { describe, expect, test } from 'bun:test';
import { Effect } from 'effect';
import { hostOf } from './host.ts';
import { type KeyPress, Keys } from './keys.ts';

/** A target with an element's tag and editability, as a press's target has. */
class Focused extends EventTarget {
  constructor(
    readonly tagName: string,
    readonly isContentEditable = false,
  ) {
    super();
  }
}

/** A key press of `key` (with `held` modifiers), cancelable as the browser's are. */
const keydown = (key: string, held: Partial<Record<'shiftKey' | 'metaKey', boolean>> = {}) =>
  Object.assign(new Event('keydown', { cancelable: true }), { key, ...held });

/** A page whose focus is `focused`: the presses `take` heard, and a way to stop hearing. */
const page = (focused: Focused, take: (press: KeyPress) => boolean = () => false) => {
  const heard: Array<KeyPress> = [];
  const stop = Effect.runCallbackWith(hostOf(Keys.layerOn(focused)))(
    Keys.use((keys) =>
      keys.listen((press) => {
        heard.push(press);
        return take(press);
      }),
    ),
  );
  return { heard, stop, press: (e: Event) => (focused.dispatchEvent(e), e) };
};

describe('Keys.listen', () => {
  test('a press reaches take with its key and modifiers; one it takes has its default prevented', () => {
    const p = page(new Focused('BODY'), (press) => press.key === 'ArrowRight');
    const taken = p.press(keydown('ArrowRight', { shiftKey: true }));
    const left = p.press(keydown('q', { metaKey: true }));
    expect(p.heard).toEqual([
      { key: 'ArrowRight', shift: true, meta: false, ctrl: false, alt: false, typing: false },
      { key: 'q', shift: false, meta: true, ctrl: false, alt: false, typing: false },
    ]);
    expect([taken.defaultPrevented, left.defaultPrevented]).toEqual([true, false]);
  });

  test('a press into an input, a textarea, a select or editable text is typing', () => {
    const typed = [
      new Focused('INPUT'),
      new Focused('TEXTAREA'),
      new Focused('SELECT'),
      new Focused('DIV', true),
      new Focused('DIV'),
      new Focused('BUTTON'),
    ].map((focused) => {
      const p = page(focused);
      p.press(keydown('n'));
      return p.heard.map((press) => press.typing);
    });
    expect(typed).toEqual([[true], [true], [true], [true], [false], [false]]);
  });

  test('interrupted, it hears nothing more', () => {
    const p = page(new Focused('BODY'), () => true);
    p.stop();
    const after = p.press(keydown(' '));
    expect(p.heard).toEqual([]);
    expect(after.defaultPrevented).toBe(false);
  });
});
