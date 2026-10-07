// Upstream: packages/react/src/number-field/root/NumberFieldRoot.test.tsx,
// packages/react/src/number-field/input/NumberFieldInput.test.tsx,
// packages/react/src/number-field/scrub-area/NumberFieldScrubArea.test.tsx
//
// Every field is owned as the lab owns one: the owner holds the value and
// hears only commits. Dropped: the uncontrolled and `onValueChange` cases,
// the Field, Form, hidden-input and autofill cases (this port has no Field
// and no hidden form input), the stepper buttons, Group, the scrub area's
// virtual cursor and wheel stepping (not ported), React.Activity, the
// conformance suite, and cases that only exercise React's event plumbing.
//
// Scrubbing: headless Chromium grants pointer lock, but under the lock a
// Playwright mouse move (absolute coordinates) is reported as a jump to the
// lock point and back, not the drag it stands for. So the locked path is
// driven with `pointermove` events carrying `movementX` (as upstream drives
// it), and the real-mouse drags run with the lock refused, the path WebKit
// and refused locks take.
import { describe, expect, it } from 'bun:test';

import { expect as see, type Page } from '@playwright/test';

import { harness, logOf } from './harness.ts';

const h = harness('number-field.tsx');

const open = (fixture: string, query: Record<string, string> = {}) => h.open(fixture, { query });
const input = (page: Page) => page.locator('#input');

/** The commit lines of the page's log. */
const commitsOf = async (page: Page) =>
  (await logOf(page)).filter((line) => line.startsWith('commit'));

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
 * this one move changed the value the input shows, read in the same task.
 */
const lockedMove = (page: Page, movementX: number, shiftKey = false) =>
  page.evaluate(
    ([x, shift]) => {
      const field = document.querySelector<HTMLInputElement>('#input');
      const shown = () => {
        (window as unknown as { __flush: () => void }).__flush();
        return Number(field?.value);
      };
      const before = shown();
      document.body.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          cancelable: true,
          movementX: x,
          shiftKey: shift,
        }),
      );
      return Math.round((shown() - before) * 1000) / 1000;
    },
    [movementX, shiftKey] as const,
  );

/** Sets the field's `disabled`, applied at once. */
const setDisabled = (page: Page, disabled: boolean) =>
  page.evaluate((next) => {
    (window as unknown as { __set: (flags: { disabled: boolean }) => void }).__set({
      disabled: next,
    });
  }, disabled);

/** Presses the scrub area with the lock refused and drags it `dx` pixels right. */
const dragScrubArea = async (page: Page, dx: number) => {
  await refusePointerLock(page);
  const { x, y } = await centerOf(page, 'scrub-area');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y, { steps: 5 });
};

describe('NumberField.Root', () => {
  it('renders the parts with their roles and labels', async () => {
    const page = await open('field', { value: '5' });
    await see(input(page)).toHaveValue('5');
    await see(page.getByTestId('scrub-area')).toHaveAttribute('role', 'presentation');
    await see(input(page)).toHaveAttribute('aria-roledescription', 'Number field');
    await see(input(page)).toHaveAttribute('inputmode', 'numeric');
    await see(input(page)).toHaveAttribute('autocomplete', 'off');
  });

  it('starts empty on a null value', async () => {
    const page = await open('field');
    await see(input(page)).toHaveValue('');
  });

  it('marks every part disabled', async () => {
    const page = await open('field', { disabled: 'true' });
    await Promise.all(
      ['root', 'scrub-area'].map((id) =>
        see(page.getByTestId(id)).toHaveAttribute('data-disabled', ''),
      ),
    );
    await see(input(page)).toBeDisabled();
  });

  it('formats the value with the locale and format', async () => {
    const page = await open('field', {
      value: '1234.5',
      locale: 'de-DE',
      format: JSON.stringify({ style: 'currency', currency: 'EUR' }),
    });
    await see(input(page)).toHaveValue(/^1\.234,50\s€$/);
  });

  it("follows the owner's value, including null", async () => {
    const page = await open('field', { value: '5' });
    await page.click('#set-42');
    await see(input(page)).toHaveValue('42');
    await page.click('#set-null');
    await see(input(page)).toHaveValue('');
  });

  it("steps from the owner's value after an external change", async () => {
    const page = await open('field', { value: '5' });
    await page.click('#set-42');
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('43');
  });

  it("shows the owner's value again when the owner declines a commit", async () => {
    const page = await open('field', { value: '5', mirror: 'false' });
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    expect(await logOf(page)).toEqual(['commit 6 keyboard']);
    await see(input(page)).toHaveValue('5');
  });
});

describe('NumberField.Input: keyboard', () => {
  it('steps with ArrowUp and ArrowDown, committing each step', async () => {
    const page = await open('field', { value: '5' });
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('6');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await see(input(page)).toHaveValue('4');
    expect(await logOf(page)).toEqual([
      'commit 6 keyboard',
      'commit 5 keyboard',
      'commit 4 keyboard',
    ]);
  });

  it('steps by largeStep with Shift and smallStep with Alt', async () => {
    const page = await open('field', { value: '5' });
    await input(page).focus();
    await page.keyboard.press('Shift+ArrowUp');
    await see(input(page)).toHaveValue('15');
    await page.keyboard.press('Alt+ArrowDown');
    await see(input(page)).toHaveValue('14.9');
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('15.9');
    expect(await logOf(page)).toEqual([
      'commit 15 keyboard',
      'commit 14.9 keyboard',
      'commit 15.9 keyboard',
    ]);
  });

  it('uses explicit step, largeStep and smallStep', async () => {
    const page = await open('field', { value: '0', largeStep: '5', smallStep: '0.25' });
    await input(page).focus();
    await page.keyboard.press('Shift+ArrowUp');
    await see(input(page)).toHaveValue('5');
    await page.keyboard.press('Alt+ArrowUp');
    await see(input(page)).toHaveValue('5.25');
    const stepped = await open('field', { value: '1.3', step: '0.5' });
    await input(stepped).focus();
    await stepped.keyboard.press('ArrowUp');
    await see(input(stepped)).toHaveValue('1.8');
  });

  it('jumps to min and max with Home and End', async () => {
    const page = await open('field', { value: '50', min: '0', max: '100' });
    await input(page).focus();
    await page.keyboard.press('Home');
    await see(input(page)).toHaveValue('0');
    await page.keyboard.press('End');
    await see(input(page)).toHaveValue('100');
    expect(await logOf(page)).toEqual(['commit 0 keyboard', 'commit 100 keyboard']);
  });

  it('leaves Home, End, PageUp and PageDown to the browser without bounds', async () => {
    const page = await open('field', { value: '50' });
    await input(page).focus();
    await page.keyboard.press('Home');
    expect(await input(page).evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(0);
    await page.keyboard.press('PageUp');
    await page.keyboard.press('PageDown');
    await see(input(page)).toHaveValue('50');
    expect(await logOf(page)).toEqual([]);
  });

  it('clamps steps to min and max and commits nothing at a bound', async () => {
    const page = await open('field', { value: '9', min: '0', max: '10' });
    await input(page).focus();
    await page.keyboard.press('Shift+ArrowUp');
    await see(input(page)).toHaveValue('10');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await see(input(page)).toHaveValue('0');
    expect(await logOf(page)).toEqual(['commit 10 keyboard', 'commit 0 keyboard']);
  });

  it('seeds an empty field with the in-range value nearest 0', async () => {
    const page = await open('field', { min: '-10', max: '-5' });
    await input(page).focus();
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('-5');
  });

  it('steps from typed text that is not committed yet', async () => {
    const page = await open('field', { value: '5' });
    await input(page).fill('');
    await input(page).pressSequentially('20');
    await page.keyboard.press('ArrowUp');
    await see(input(page)).toHaveValue('21');
  });
});

describe('NumberField.Input: typing', () => {
  it('commits typed text on blur, not while typing', async () => {
    const page = await open('field');
    await input(page).click();
    await page.keyboard.type('12');
    await see(input(page)).toHaveValue('12');
    expect(await logOf(page)).toEqual([]);
    await input(page).blur();
    expect(await logOf(page)).toEqual(['commit 12 input-blur']);
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
    expect(await logOf(page)).toEqual([]);
    const composed = await open('enter-commits');
    await input(composed).fill('');
    await input(composed).pressSequentially('8');
    await composed.keyboard.press('Enter');
    await see(input(composed)).not.toBeFocused();
    expect(await logOf(composed)).toEqual(['commit 8 input-blur']);
  });

  // Not in upstream: `commitOnEnter`.
  it('commits typed text on Enter when commitOnEnter is set, keeping focus', async () => {
    const page = await open('field', { commitOnEnter: 'true', locale: 'en-US' });
    await input(page).click();
    await page.keyboard.type('1234.5');
    await page.keyboard.press('Enter');
    await see(input(page)).toBeFocused();
    await see(input(page)).toHaveValue('1,234.5');
    expect(await logOf(page)).toEqual(['commit 1234.5 keyboard']);
    await page.keyboard.press('Enter');
    expect(await logOf(page)).toEqual(['commit 1234.5 keyboard']);
  });

  // Not in upstream: `allowExpressions`.
  it('reads typed arithmetic on commit, relative text from the value before editing', async () => {
    const page = await open('field', {
      allowExpressions: 'true',
      commitOnEnter: 'true',
      value: '0.42',
    });
    await input(page).click();
    await input(page).selectText();
    await page.keyboard.type('*2');
    await see(input(page)).toHaveValue('*2');
    expect(await logOf(page)).toEqual([]);
    await page.keyboard.press('Enter');
    await see(input(page)).toHaveValue('0.84');
    expect(await logOf(page)).toEqual(['commit 0.84 keyboard']);

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
    const page = await open('field', { allowExpressions: 'true', value: '3' });
    await input(page).click();
    await input(page).selectText();
    await page.keyboard.type('2*(1+');
    await see(input(page)).toHaveValue('2*(1+');
    await input(page).blur();
    await see(input(page)).toHaveValue('2*(1+');
    expect(await logOf(page)).toEqual([]);
  });

  it("follows the owner's later value after a blur on text that does not read, committing nothing stale", async () => {
    const page = await open('field', { allowExpressions: 'true', value: '5' });
    await input(page).click();
    await input(page).selectText();
    await page.keyboard.type('10+');
    await input(page).blur();
    await see(input(page)).toHaveValue('10+');
    await page.click('#set-42');
    await see(input(page)).toHaveValue('42');
    await input(page).focus();
    await input(page).blur();
    expect(await commitsOf(page)).toEqual([]);
  });

  it('blocks characters that are not part of a number', async () => {
    const page = await open('field', { value: '5' });
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
  });

  it('accepts one decimal separator for the locale', async () => {
    const page = await open('field', { locale: 'de-DE' });
    await input(page).click();
    await page.keyboard.type('1,5,');
    await see(input(page)).toHaveValue('1,5');
    await input(page).blur();
    expect(await logOf(page)).toEqual(['commit 1.5 input-blur']);
  });

  it('commits null on blur after the field is cleared', async () => {
    const page = await open('field', { value: '5' });
    await input(page).fill('');
    await input(page).blur();
    expect(await logOf(page)).toEqual(['commit null input-clear']);
  });

  it('does not commit when an untouched empty field is blurred', async () => {
    const page = await open('field');
    await input(page).focus();
    await input(page).blur();
    expect(await logOf(page)).toEqual([]);
  });

  it('commits and shows the clamped value on blur', async () => {
    const page = await open('field', { min: '0', max: '10' });
    await input(page).click();
    await page.keyboard.type('50');
    await see(input(page)).toHaveValue('50');
    await input(page).blur();
    await see(input(page)).toHaveValue('10');
    expect(await logOf(page)).toEqual(['commit 10 input-blur']);
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

  it('inserts a paste at the caret', async () => {
    const page = await open('field', { value: '123' });
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
    await input(page).blur();
    expect(await logOf(page)).toEqual(['commit 1923 input-blur']);
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
});

describe('NumberField.ScrubArea', () => {
  it('scrubs with a mouse drag when pointer lock is refused', async () => {
    const page = await open('field', { value: '0' });
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
    expect(await logOf(page)).toEqual([]);
    await page.mouse.up();
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    expect(await commitsOf(page)).toEqual(['commit 4 scrub']);
    await see(input(page)).toHaveValue('4');
  });

  it("shows the owner's value after the release when the owner declines the commit", async () => {
    const page = await open('field', { value: '5', mirror: 'false' });
    await dragScrubArea(page, 10);
    await see(input(page)).toHaveValue('15');
    await page.mouse.up();
    expect(await commitsOf(page)).toEqual(['commit 15 scrub']);
    await see(input(page)).toHaveValue('5');
  });

  it('scrubs by largeStep with Shift and smallStep with Alt', async () => {
    const page = await open('field', { value: '0' });
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
    expect(await commitsOf(page)).toEqual(['commit 39.6 scrub']);
  });

  it('waits for 2 pixels of movement', async () => {
    const page = await open('field', { value: '0' });
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 1, y);
    await see(input(page)).toHaveValue('0');
    await page.mouse.move(x + 2, y);
    await see(input(page)).toHaveValue('1');
    await page.mouse.up();
  });

  it('clamps scrubbing to min and max', async () => {
    const page = await open('field', { value: '0', min: '-3', max: '3' });
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
    const page = await open('field', { value: '0' });
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await see.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('BODY');

    expect(await lockedMove(page, 10)).toBe(10);
    expect(await lockedMove(page, -4)).toBe(-4);
    expect(await lockedMove(page, 2, true)).toBe(20);

    await page.mouse.up();
    expect(await page.evaluate(() => document.pointerLockElement)).toBe(null);
    // Chromium's own recentering moves may scrub on until the release, so the
    // value is read once it is over: one commit, the value the field then shows.
    const shown = await input(page).inputValue();
    expect(await commitsOf(page)).toEqual([`commit ${shown} scrub`]);
  });

  it('scrubs with a finger, without the lock, and commits once on the lift', async () => {
    // The browser's own touches (CDP), so the pointer events are its own: pointerType touch.
    const page = await h.open('field', { touch: true, query: { value: '0' } });
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
    const shown = await input(page).inputValue();
    await at('touchEnd', x + 20, y);
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    expect(await commitsOf(page)).toEqual([`commit ${shown} scrub`]);
  });

  it('clicks its target when pressed without moving', async () => {
    const page = await open('field', { value: '0' });
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.up();
    // With the lock refused the browser's own click reaches the target, and only
    // that one (upstream NumberFieldScrubArea.test.tsx:663 asserts one call).
    expect(await logOf(page)).toEqual(['commit 0 scrub', 'scrub-area click']);
  });

  it('stops scrubbing when it becomes disabled mid-scrub, back on the owner value', async () => {
    const page = await open('field', { value: '5' });
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await see.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('BODY');
    // The move scrubs; Chromium's own recentering moves may scrub on, so only the move is read.
    expect(await lockedMove(page, 10)).toBe(10);
    await setDisabled(page, true);
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    expect(await page.evaluate(() => document.pointerLockElement)).toBe(null);
    await see(input(page)).toHaveValue('5');
    await page.mouse.up();
    // Canceled, not ended: no commit. (The release may still bring the browser's
    // own click, as the lock is gone by then.)
    expect(await commitsOf(page)).toEqual([]);
  });

  it("follows the owner's later value after a scrub its disabling cancelled, committing nothing stale", async () => {
    const page = await open('field', { value: '5', mirror: 'false' });
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await see.poll(() => page.evaluate(() => document.pointerLockElement?.tagName)).toBe('BODY');
    expect(await lockedMove(page, 10)).toBe(10);
    await setDisabled(page, true);
    await page.mouse.up();
    await setDisabled(page, false);
    await page.click('#set-42');
    await see(input(page)).toHaveValue('42');
    await input(page).focus();
    await input(page).blur();
    await see(input(page)).toHaveValue('42');
    expect(await commitsOf(page)).toEqual([]);
  });

  it('does not request the lock when it becomes disabled before the request runs', async () => {
    const page = await open('field', { value: '0' });
    const requests = await page.evaluate(() => {
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
      (window as unknown as { __set: (next: { disabled: boolean }) => void }).__set({
        disabled: true,
      });
      return new Promise<number>((resolve) => setTimeout(() => resolve(count), 50));
    });
    expect(requests).toBe(0);
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
  });

  it('releases a lock granted after it became disabled', async () => {
    const page = await open('field', { value: '0' });
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
    await page.evaluate(() => {
      (window as unknown as { __set: (next: { disabled: boolean }) => void }).__set({
        disabled: true,
      });
    });
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    await page.evaluate(() => (window as unknown as { __grant: () => Promise<void> }).__grant());
    await see.poll(() => page.evaluate(() => document.pointerLockElement)).toBe(null);
    await page.mouse.up();
    expect(await commitsOf(page)).toEqual([]);
  });

  it('does not start on a non-primary button', async () => {
    const page = await open('field', { value: '0' });
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down({ button: 'middle' });
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    await page.mouse.up({ button: 'middle' });
  });

  it("clears the scrubbing state when it unmounts mid-scrub, back on the owner's value", async () => {
    const page = await open('unmounting');
    await refusePointerLock(page);
    const { x, y } = await centerOf(page, 'scrub-area');
    await page.mouse.move(x, y);
    await page.mouse.down();
    await see(page.getByTestId('root')).toHaveAttribute('data-scrubbing', '');
    // The move scrubs (10 px) before it drops the scrub area.
    await page.mouse.move(x + 10, y);
    await see(page.getByTestId('scrub-area')).toHaveCount(0);
    await see(page.getByTestId('root')).not.toHaveAttribute('data-scrubbing');
    await see(input(page)).toHaveValue('0');
    await page.mouse.up();
    expect(await commitsOf(page)).toEqual([]);
  });
});

describe('NumberField: unmounting mid-edit', () => {
  const show = (page: Page, next: { input?: boolean; root?: boolean }) =>
    page.evaluate((parts) => {
      (window as unknown as { __show: (next: { input?: boolean; root?: boolean }) => void }).__show(
        parts,
      );
    }, next);

  it("drops the typed value when the input unmounts, back on the owner's value", async () => {
    // A rounding format reads the text again on any commit; the leaving blur must not.
    const page = await open('unmounting-parts', {
      format: JSON.stringify({ maximumFractionDigits: 2 }),
    });
    await input(page).click();
    await input(page).selectText();
    await page.keyboard.type('10');
    await show(page, { input: false });
    await see(input(page)).toHaveCount(0);
    await show(page, { input: true });
    await see(input(page)).toHaveValue('5');
    await input(page).focus();
    await input(page).blur();
    expect(await commitsOf(page)).toEqual([]);
  });

  it('drops the typed value quietly when the whole field unmounts', async () => {
    const page = await open('unmounting-parts');
    await input(page).click();
    await input(page).selectText();
    await page.keyboard.type('10');
    await show(page, { root: false });
    await see(input(page)).toHaveCount(0);
    await show(page, { root: true });
    await see(input(page)).toHaveValue('5');
    expect(await commitsOf(page)).toEqual([]);
  });
});
