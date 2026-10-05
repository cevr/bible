// Upstream: packages/react/src/number-field/root/NumberFieldRoot.test.tsx,
// packages/react/src/number-field/input/NumberFieldInput.test.tsx,
// packages/react/src/number-field/scrub-area/NumberFieldScrubArea.test.tsx
//
// Dropped: the Field, Form, hidden-input and autofill cases (this port has
// no Field and no hidden form input), the stepper buttons, Group, the scrub
// area's virtual cursor and wheel stepping (not ported), React.Activity, the
// conformance suite, and cases that only exercise React's event plumbing.
//
// Scrubbing: headless Chromium grants pointer lock, but under the lock a
// Playwright mouse move (absolute coordinates) is reported as a jump to the
// lock point and back, not the drag it stands for. So the locked path is
// driven with `pointermove` events carrying `movementX`/`movementY` (as
// upstream drives it), and the real-mouse drags run with the lock refused,
// the path WebKit and refused locks take.
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { type Harness, harness, logOf } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness('number-field.tsx');
});
afterAll(async () => {
  await h.close();
});

const open = (fixture: string, query: Record<string, string> = {}) => h.open(fixture, { query });
const input = (page: Page) => page.locator('#input');

/** The center of a test id's element. */
const centerOf = async (page: Page, testId: string) => {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) {
    throw new Error(`${testId} has no box`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

/** Makes pointer lock requests fail, as a browser that refuses them does. */
const refusePointerLock = (page: Page) =>
  page.evaluate(() => {
    HTMLElement.prototype.requestPointerLock = () => Promise.reject(new Error('refused'));
  });

/**
 * A locked-pointer move: only the movement counts. Chromium also sends its
 * own moves while it recenters the locked pointer, so this returns how much
 * this one move changed the value, read from the change it logs at once.
 */
const lockedMove = (page: Page, movementX: number, movementY = 0, shiftKey = false) =>
  page.evaluate(
    ([x, y, shift]) => {
      const lines = (window as unknown as { __log: Array<string> }).__log;
      const lastChange = () => {
        const line = lines.findLast((entry) => entry.startsWith('change '));
        return line === undefined ? 0 : Number(line.split(' ')[1]);
      };
      const before = lastChange();
      document.body.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          movementX: x,
          movementY: y,
          shiftKey: shift,
        }),
      );
      return Math.round((lastChange() - before) * 1000) / 1000;
    },
    [movementX, movementY, shiftKey] as const,
  );

describe('NumberField.Root', () => {
  it('renders the parts with their roles and labels', async () => {
    const page = await open('field', { defaultValue: '5' });
    await see(input(page)).toHaveValue('5');
    await see(page.getByTestId('scrub-area')).toHaveAttribute('role', 'presentation');
    await see(input(page)).toHaveAttribute('aria-roledescription', 'Number field');
    await see(input(page)).toHaveAttribute('inputmode', 'numeric');
    await see(input(page)).toHaveAttribute('autocomplete', 'off');
  });

  it('starts empty without a default value', async () => {
    const page = await open('field');
    await see(input(page)).toHaveValue('');
  });

  it('marks every part disabled and read-only', async () => {
    const page = await open('field', { disabled: 'true' });
    await Promise.all(
      ['root', 'scrub-area'].map((id) =>
        see(page.getByTestId(id)).toHaveAttribute('data-disabled', ''),
      ),
    );
    await see(input(page)).toBeDisabled();
    const readOnly = await open('field', { readOnly: 'true' });
    await see(readOnly.getByTestId('root')).toHaveAttribute('data-readonly', '');
    await see(input(readOnly)).toHaveAttribute('readonly', '');
  });

  it('formats the value with the locale and format', async () => {
    const page = await open('field', {
      defaultValue: '1234.5',
      locale: 'de-DE',
      format: JSON.stringify({ style: 'currency', currency: 'EUR' }),
    });
    await see(input(page)).toHaveValue(/^1\.234,50\s€$/);
  });

  it('follows a controlled value, including null', async () => {
    const page = await open('controlled');
    await see(input(page)).toHaveValue('5');
    await page.click('#set-42');
    await see(input(page)).toHaveValue('42');
    await page.click('#set-null');
    await see(input(page)).toHaveValue('');
  });

  it('steps from the controlled value after an external change', async () => {
    const page = await open('controlled');
    await page.click('#set-42');
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('43');
  });

  it('shows the controlled value when the owner does not take a change', async () => {
    const page = await open('controlled', { mirror: 'false' });
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    expect(await logOf(page)).toEqual(['change 6 keyboard', 'commit 6 keyboard']);
    await see(input(page)).toHaveValue('5');
  });

  it('keeps the value when a change is canceled, and does not commit it', async () => {
    const page = await open('field', { defaultValue: '5', cancel: 'keyboard' });
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('5');
    expect(await logOf(page)).toEqual(['change 6 keyboard']);
  });
});

describe('NumberField.Input: keyboard', () => {
  it('steps with ArrowUp and ArrowDown, committing each step', async () => {
    const page = await open('field', { defaultValue: '5' });
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('6');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await see(input(page)).toHaveValue('4');
    expect(await logOf(page)).toEqual([
      'change 6 keyboard',
      'commit 6 keyboard',
      'change 5 keyboard',
      'commit 5 keyboard',
      'change 4 keyboard',
      'commit 4 keyboard',
    ]);
  });

  it('steps by largeStep with Shift and smallStep with Alt', async () => {
    const page = await open('field', { defaultValue: '5' });
    await input(page).focus();
    await page.keyboard.press('Shift+ArrowUp');
    await see(input(page)).toHaveValue('15');
    await page.keyboard.press('Alt+ArrowDown');
    await see(input(page)).toHaveValue('14.9');
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('15.9');
    expect(await logOf(page)).toEqual([
      'change 15 keyboard',
      'commit 15 keyboard',
      'change 14.9 keyboard',
      'commit 14.9 keyboard',
      'change 15.9 keyboard',
      'commit 15.9 keyboard',
    ]);
  });

  it('uses explicit largeStep and smallStep', async () => {
    const page = await open('field', { defaultValue: '0', largeStep: '5', smallStep: '0.25' });
    await input(page).focus();
    await page.keyboard.press('Shift+ArrowUp');
    await see(input(page)).toHaveValue('5');
    await page.keyboard.press('Alt+ArrowUp');
    await see(input(page)).toHaveValue('5.25');
  });

  it('steps by step and snaps to it with snapOnStep (Alt snapping to the nearest)', async () => {
    const page = await open('field', { defaultValue: '1.3', step: '0.5', snapOnStep: 'true' });
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('1.5');
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('2');
    const unsnapped = await open('field', { defaultValue: '1.3', step: '0.5' });
    await input(unsnapped).focus();
    await unsnapped.keyboard.press('ArrowUp');
    await see(input(unsnapped)).toHaveValue('1.8');
    const small = await open('field', { defaultValue: '0.15', snapOnStep: 'true' });
    await input(small).focus();
    await small.keyboard.press('Alt+ArrowUp');
    await see(input(small)).toHaveValue('0.3');
  });

  it('jumps to min and max with Home and End', async () => {
    const page = await open('field', { defaultValue: '50', min: '0', max: '100' });
    await input(page).focus();
    await page.keyboard.press('Home');
    await see(input(page)).toHaveValue('0');
    await page.keyboard.press('End');
    await see(input(page)).toHaveValue('100');
    expect(await logOf(page)).toEqual([
      'change 0 keyboard',
      'commit 0 keyboard',
      'change 100 keyboard',
      'commit 100 keyboard',
    ]);
  });

  it('leaves Home, End, PageUp and PageDown to the browser without bounds', async () => {
    const page = await open('field', { defaultValue: '50' });
    await input(page).focus();
    await page.keyboard.press('Home');
    expect(await input(page).evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(0);
    await page.keyboard.press('PageUp');
    await page.keyboard.press('PageDown');
    await see(input(page)).toHaveValue('50');
    expect(await logOf(page)).toEqual([]);
  });

  it('clamps steps to min and max and commits nothing at a bound', async () => {
    const page = await open('field', { defaultValue: '9', min: '0', max: '10' });
    await input(page).focus();
    await page.keyboard.press('Shift+ArrowUp');
    await see(input(page)).toHaveValue('10');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await see(input(page)).toHaveValue('0');
    expect(await logOf(page)).toEqual([
      'change 10 keyboard',
      'commit 10 keyboard',
      'change 0 keyboard',
      'commit 0 keyboard',
    ]);
  });

  it('seeds an empty field with the in-range value nearest 0', async () => {
    const page = await open('field', { min: '-10', max: '-5' });
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('-5');
  });

  it('steps from typed text that is not committed yet', async () => {
    const page = await open('field', { defaultValue: '5' });
    await input(page).fill('');
    await input(page).pressSequentially('20');
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('21');
  });
});

describe('NumberField.Input: typing', () => {
  it('reports each parseable keystroke and commits on blur', async () => {
    const page = await open('field');
    await input(page).click();
    await page.keyboard.type('12');
    await see(input(page)).toHaveValue('12');
    expect(await logOf(page)).toEqual(['change 1 input-change', 'change 12 input-change']);
    await input(page).blur();
    expect(await logOf(page)).toEqual([
      'change 1 input-change',
      'change 12 input-change',
      'commit 12 input-blur',
    ]);
  });

  it('formats typed text only on blur', async () => {
    const page = await open('field', { locale: 'en-US' });
    await input(page).click();
    await page.keyboard.type('1234.5');
    await see(input(page)).toHaveValue('1234.5');
    await input(page).blur();
    await see(input(page)).toHaveValue('1,234.5');
  });

  it('does not commit on Enter (it submits a form), but Enter may blur to commit', async () => {
    const page = await open('field');
    await input(page).click();
    await page.keyboard.type('7');
    await page.keyboard.press('Enter');
    expect(await logOf(page)).toEqual(['change 7 input-change']);
    const composed = await open('enter-commits');
    await input(composed).fill('');
    await input(composed).pressSequentially('8');
    await composed.keyboard.press('Enter');
    await see(input(composed)).not.toBeFocused();
    expect(await logOf(composed)).toEqual([
      'change null input-clear',
      'change 8 input-change',
      'commit 8 input-blur',
    ]);
  });

  // Not in upstream: `commitOnEnter`.
  it('commits typed text on Enter when commitOnEnter is set, keeping focus', async () => {
    const page = await open('field', { commitOnEnter: 'true', locale: 'en-US' });
    await input(page).click();
    await page.keyboard.type('1234.5');
    await page.keyboard.press('Enter');
    await see(input(page)).toBeFocused();
    await see(input(page)).toHaveValue('1,234.5');
    const lines = await logOf(page);
    expect(lines.at(-1)).toBe('commit 1234.5 keyboard');
    await page.keyboard.press('Enter');
    expect(await logOf(page)).toEqual(lines);
  });

  // Not in upstream: `allowExpressions`.
  it('reads typed arithmetic on commit, relative text from the value before editing', async () => {
    const page = await open('field', {
      allowExpressions: 'true',
      commitOnEnter: 'true',
      defaultValue: '0.42',
      step: 'any',
    });
    await input(page).click();
    await input(page).selectText();
    await page.keyboard.type('*2');
    await see(input(page)).toHaveValue('*2');
    expect(await logOf(page)).toEqual([]);
    await page.keyboard.press('Enter');
    await see(input(page)).toHaveValue('0.84');
    expect(await logOf(page)).toEqual(['change 0.84 keyboard', 'commit 0.84 keyboard']);

    await input(page).selectText();
    await page.keyboard.type('+0.1');
    await input(page).blur();
    await see(input(page)).toHaveValue('0.94');

    await input(page).selectText();
    await page.keyboard.type('(1+2)/4');
    await page.keyboard.press('Enter');
    await see(input(page)).toHaveValue('0.75');

    // A leading minus is a negative number, not a subtraction.
    await input(page).selectText();
    await page.keyboard.type('-0.5');
    await page.keyboard.press('Enter');
    await see(input(page)).toHaveValue('-0.5');
  });

  it('keeps text that does not read as arithmetic, and blocks no operator', async () => {
    const page = await open('field', { allowExpressions: 'true', defaultValue: '3' });
    await input(page).click();
    await input(page).selectText();
    await page.keyboard.type('2*(1+');
    await see(input(page)).toHaveValue('2*(1+');
    await input(page).blur();
    await see(input(page)).toHaveValue('2*(1+');
    // Only the `2` read as a number while typing; nothing was committed.
    expect(await logOf(page)).toEqual(['change 2 input-change']);
  });

  it('blocks characters that are not part of a number', async () => {
    const page = await open('field', { defaultValue: '5' });
    await input(page).click();
    await page.keyboard.type('a!');
    await see(input(page)).toHaveValue('5');
    await page.keyboard.insertText('x');
    await see(input(page)).toHaveValue('5');
    expect(await logOf(page)).toEqual([]);
  });

  it('allows a minus sign only when negatives are reachable', async () => {
    const page = await open('field', { min: '0' });
    await input(page).click();
    await page.keyboard.type('-3');
    await see(input(page)).toHaveValue('3');
    const negative = await open('field');
    await input(negative).click();
    await negative.keyboard.type('-3');
    await see(input(negative)).toHaveValue('-3');
    expect(await logOf(negative)).toEqual(['change -3 input-change']);
  });

  it('accepts one decimal separator for the locale', async () => {
    const page = await open('field', { locale: 'de-DE' });
    await input(page).click();
    await page.keyboard.type('1,5,');
    await see(input(page)).toHaveValue('1,5');
    // "1," still reads as 1, and typed text reports every keystroke.
    expect(await logOf(page)).toEqual([
      'change 1 input-change',
      'change 1 input-change',
      'change 1.5 input-change',
    ]);
  });

  it('reports clearing the field and commits null on blur', async () => {
    const page = await open('field', { defaultValue: '5' });
    await input(page).fill('');
    await input(page).blur();
    expect(await logOf(page)).toEqual(['change null input-clear', 'commit null input-clear']);
  });

  it('does not commit when an untouched empty field is blurred', async () => {
    const page = await open('field');
    await input(page).focus();
    await input(page).blur();
    expect(await logOf(page)).toEqual([]);
  });

  it('reports and shows the clamped value on blur', async () => {
    const page = await open('field', { min: '0', max: '10' });
    await input(page).click();
    await page.keyboard.type('50');
    await see(input(page)).toHaveValue('50');
    await input(page).blur();
    await see(input(page)).toHaveValue('10');
    expect(await logOf(page)).toEqual([
      'change 5 input-change',
      'change 10 input-change',
      'change 10 input-blur',
      'commit 10 input-blur',
    ]);
  });

  it('keeps typed out-of-range values with allowOutOfRange, but clamps steps', async () => {
    const page = await open('field', { min: '0', max: '10', allowOutOfRange: 'true' });
    await input(page).click();
    await page.keyboard.type('50');
    await input(page).blur();
    await see(input(page)).toHaveValue('50');
    expect(await logOf(page)).toEqual([
      'change 5 input-change',
      'change 50 input-change',
      'commit 50 input-blur',
    ]);
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('10');
  });

  it('rounds to the format on blur', async () => {
    const page = await open('field', {
      locale: 'en-US',
      format: JSON.stringify({ maximumFractionDigits: 1 }),
    });
    await input(page).click();
    await page.keyboard.type('1.26');
    await input(page).blur();
    await see(input(page)).toHaveValue('1.3');
    expect(await logOf(page)).toContain('commit 1.3 input-blur');
  });

  it('does not change or commit when the blur change is canceled', async () => {
    const page = await open('field', { defaultValue: '5', max: '10', cancel: 'input-blur' });
    await input(page).fill('');
    await input(page).pressSequentially('20');
    await input(page).blur();
    expect(await logOf(page)).not.toContain('commit 10 input-blur');
  });

  it('inserts a paste at the caret', async () => {
    const page = await open('field', { defaultValue: '123' });
    await input(page).click();
    await input(page).evaluate((el: HTMLInputElement) => {
      el.setSelectionRange(1, 1);
      const data = new DataTransfer();
      data.setData('text/plain', '9');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await see(input(page)).toHaveValue('1923');
    expect(await input(page).evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(2);
    expect(await logOf(page)).toEqual(['change 1923 input-paste']);
  });

  it('ignores a paste that leaves no number', async () => {
    const page = await open('field');
    await input(page).evaluate((el: HTMLInputElement) => {
      el.focus();
      const data = new DataTransfer();
      data.setData('text/plain', 'abc');
      el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await see(input(page)).toHaveValue('');
    expect(await logOf(page)).toEqual([]);
  });

  it('does not change a read-only field', async () => {
    const page = await open('field', { defaultValue: '5', readOnly: 'true' });
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await page.keyboard.type('9');
    await see(input(page)).toHaveValue('5');
    expect(await logOf(page)).toEqual([]);
  });
});

describe('NumberField.ScrubArea', () => {
  it('scrubs with a mouse drag when pointer lock is refused', async () => {
    const page = await open('field', { defaultValue: '0' });
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await see(page.getByTestId('root')).toHaveAttribute('data-scrubbing', '');
    await see(page.getByTestId('scrub-area')).toHaveAttribute('data-scrubbing', '');
    await see(input(page)).toBeFocused();
    await page.mouse.move(x + 10, y, { steps: 5 });
    await see(input(page)).toHaveValue('10');
    await page.mouse.move(x + 4, y, { steps: 3 });
    await see(input(page)).toHaveValue('4');
    await page.mouse.up();
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    const lines = await logOf(page);
    expect(
      lines.filter((line) => line.startsWith('change')).every((l) => l.endsWith(' scrub')),
    ).toBe(true);
    expect(lines.filter((line) => line.startsWith('commit'))).toEqual(['commit 4 scrub']);
  });

  it('scrubs by largeStep with Shift and smallStep with Alt', async () => {
    const page = await open('field', { defaultValue: '0' });
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.keyboard.down('Shift');
    await page.mouse.move(x + 4, y, { steps: 2 });
    await page.keyboard.up('Shift');
    await see(input(page)).toHaveValue('40');
    await page.keyboard.down('Alt');
    await page.mouse.move(x, y, { steps: 2 });
    await page.keyboard.up('Alt');
    await see(input(page)).toHaveValue('39.6');
    await page.mouse.up();
    expect((await logOf(page)).filter((line) => line.startsWith('commit'))).toEqual([
      'commit 39.6 scrub',
    ]);
  });

  it('scrubs on vertical movement with direction vertical (up increases)', async () => {
    const page = await open('field', { defaultValue: '0', direction: 'vertical' });
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y, { steps: 5 });
    await see(input(page)).toHaveValue('0');
    await page.mouse.move(x + 20, y - 6, { steps: 3 });
    await see(input(page)).toHaveValue('6');
    await page.mouse.up();
  });

  it('waits for pixelSensitivity pixels of movement', async () => {
    const page = await open('field', { defaultValue: '0', pixelSensitivity: '6' });
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 4, y, { steps: 2 });
    await see(input(page)).toHaveValue('0');
    await page.mouse.move(x + 6, y, { steps: 1 });
    await see(input(page)).toHaveValue('2');
    await page.mouse.up();
  });

  it('clamps scrubbing to min and max', async () => {
    const page = await open('field', { defaultValue: '0', min: '-3', max: '3' });
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 20, y, { steps: 10 });
    await see(input(page)).toHaveValue('3');
    await page.mouse.move(x - 20, y, { steps: 20 });
    await see(input(page)).toHaveValue('-3');
    await page.mouse.up();
  });

  it('locks the pointer while a mouse scrubs', async () => {
    const page = await open('field', { defaultValue: '0' });
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await see.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('BODY');

    expect(await lockedMove(page, 10)).toBe(10);
    expect(await lockedMove(page, -4)).toBe(-4);
    expect(await lockedMove(page, 2, 0, true)).toBe(20);

    await page.mouse.up();
    expect(await page.evaluate(() => document.pointerLockElement)).toBe(null);
    const lines = await logOf(page);
    const last = lines.findLast((line) => line.startsWith('change '));
    expect(lines.filter((line) => line.startsWith('commit'))).toEqual([
      `commit ${last?.split(' ')[1]} scrub`,
    ]);
    expect(
      lines.filter((line) => line.startsWith('change')).every((l) => l.endsWith(' scrub')),
    ).toBe(true);
  });

  it('scrubs with a finger, without the lock, and commits once on the lift', async () => {
    // The browser's own touches (CDP), so the pointer events are its own: pointerType touch.
    const page = await h.open('field', { touch: true, query: { defaultValue: '0' } });
    const cdp = await page.context().newCDPSession(page);
    const at = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
      });
    // A phone lays the page out wider than its screen: touches land in screen pixels.
    const scale = await page.evaluate(() => window.visualViewport?.scale ?? 1);
    const centre = await centerOf(page, 'scrub-area');
    const x = centre.x * scale;
    const y = centre.y * scale;
    await at('touchStart', x, y);
    await see(page.getByTestId('root')).toHaveAttribute('data-scrubbing', '');
    await at('touchMove', x + 4, y);
    await at('touchMove', x + 8, y);
    await at('touchMove', x + 12, y);
    await at('touchMove', x + 16, y);
    await at('touchMove', x + 20, y);
    await see.poll(async () => Number(await input(page).inputValue())).toBeGreaterThan(5);
    expect(await page.evaluate(() => document.pointerLockElement)).toBe(null);
    await at('touchEnd', x + 20, y);
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    const lines = await logOf(page);
    const last = lines.findLast((line) => line.startsWith('change '));
    expect(lines.filter((line) => line.startsWith('commit'))).toEqual([
      `commit ${last?.split(' ')[1]} scrub`,
    ]);
  });

  it('clicks its target when pressed without moving', async () => {
    const page = await open('field', { defaultValue: '0' });
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    // With the lock refused the browser's own click reaches the target, and only
    // that one (upstream NumberFieldScrubArea.test.tsx:663 asserts one call).
    expect(await logOf(page)).toEqual(['commit 0 scrub', 'scrub-area click']);
  });

  for (const flag of ['disabled', 'readOnly'] as const) {
    it(`stops scrubbing when it becomes ${flag} mid-scrub`, async () => {
      const page = await open('field', { defaultValue: '0' });
      const { x, y } = await centerOf(page, 'scrub-area');
      await page.mouse.move(x, y);
      await page.mouse.down();
      await see.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('BODY');
      await page.evaluate((name) => {
        (window as unknown as { __set: (next: Record<string, boolean>) => void }).__set({
          [name]: true,
        });
      }, flag);
      await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
      expect(await page.evaluate(() => document.pointerLockElement)).toBe(null);
      await page.mouse.up();
      // Canceled, not ended: no commit. (The release may still bring the browser's
      // own click, as the lock is gone by then.)
      expect((await logOf(page)).filter((line) => line.startsWith('commit'))).toEqual([]);
    });

    it(`does not request the lock when it becomes ${flag} before the request runs`, async () => {
      const page = await open('field', { defaultValue: '0' });
      const requests = await page.evaluate((name) => {
        let count = 0;
        HTMLElement.prototype.requestPointerLock = () => {
          count += 1;
          return Promise.resolve();
        };
        // The press and the change in one task: the queued request has not run yet.
        document.querySelector('[data-testid="scrub-area"]')?.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            button: 0,
            pointerType: 'mouse',
          }),
        );
        (window as unknown as { __set: (next: Record<string, boolean>) => void }).__set({
          [name]: true,
        });
        return new Promise<number>((resolve) => setTimeout(() => resolve(count), 50));
      }, flag);
      expect(requests).toBe(0);
      await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    });

    it(`releases a lock granted after it became ${flag}`, async () => {
      const page = await open('field', { defaultValue: '0' });
      // The lock is granted only when the test says so.
      await page.evaluate(() => {
        const original = HTMLElement.prototype.requestPointerLock;
        HTMLElement.prototype.requestPointerLock = function (this: HTMLElement) {
          return new Promise<void>((resolve, reject) => {
            (window as unknown as { __grant: () => Promise<void> }).__grant = () =>
              original.call(this).then(resolve, reject);
          });
        };
      });
      const { x, y } = await centerOf(page, 'scrub-area');
      await page.mouse.move(x, y);
      await page.mouse.down();
      await see(page.getByTestId('root')).toHaveAttribute('data-scrubbing', '');
      await page.evaluate((name) => {
        (window as unknown as { __set: (next: Record<string, boolean>) => void }).__set({
          [name]: true,
        });
      }, flag);
      await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
      await page.evaluate(() => (window as unknown as { __grant: () => Promise<void> }).__grant());
      await see.poll(() => page.evaluate(() => document.pointerLockElement)).toBe(null);
      await page.mouse.up();
      expect((await logOf(page)).filter((line) => line.startsWith('commit'))).toEqual([]);
    });
  }

  it('does not start on a non-primary button or when read-only', async () => {
    const page = await open('field', { defaultValue: '0' });
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'middle' });
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    await page.mouse.up({ button: 'middle' });
    const readOnly = await open('field', { defaultValue: '0', readOnly: 'true' });
    await readOnly.mouse.move(x, y);
    await readOnly.mouse.down();
    await see(readOnly.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    await readOnly.mouse.move(x + 10, y, { steps: 5 });
    await readOnly.mouse.up();
    await see(input(readOnly)).toHaveValue('0');
  });

  it('clears the scrubbing state when it unmounts mid-scrub', async () => {
    const page = await open('unmounting');
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await see(page.getByTestId('root')).toHaveAttribute('data-scrubbing', '');
    await page.mouse.move(x + 2, y);
    await see(page.getByTestId('scrub-area')).toHaveCount(0);
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    await page.mouse.up();
  });
});
