// The behaviour mixins in the browser: a ref factory's two phases, a mixin's
// state across reactive updates, and a listener's lifetime.
import { describe, expect, it } from 'bun:test';

import { expect as see } from '@playwright/test';

import { harness, logOf } from './harness.ts';

const h = harness('mix.tsx');

describe('onElement', () => {
  it('runs its setup on the connected element, its spread and dynamic attributes set, and its cleanup on dispose', async () => {
    const page = await h.open('on-element');
    await see(page.locator('#probe')).toHaveAttribute('data-mixed', 'yes');
    await see.poll(() => logOf(page)).toEqual(['setup connected=true mixed=yes title=dynamic']);
    await page.click('#toggle');
    await see(page.locator('#probe')).toHaveCount(0);
    expect(await logOf(page)).toEqual(['setup connected=true mixed=yes title=dynamic', 'cleanup']);
  });
});

describe('mix', () => {
  it("keeps a mixin's state across reactive updates when built in the body", async () => {
    const page = await h.open('state');
    const counter = page.locator('#counter');
    await see(counter).toHaveAttribute('data-count', '0');
    await see(counter).toHaveAttribute('title', 'first');
    await counter.click();
    await counter.click();
    await see(counter).toHaveAttribute('data-count', '2');
    await page.click('#relabel');
    await see(counter).toHaveAttribute('title', 'first+');
    await see(counter).toHaveAttribute('data-count', '2');
  });
});

describe('listen', () => {
  it('listens on the document and with listener options, and stops on dispose', async () => {
    const page = await h.open('listen');
    await page.locator('#scroller').hover();
    await page.mouse.wheel(0, 200);
    await see.poll(() => logOf(page)).toEqual(['wheel prevented=true']);
    expect(await page.locator('#scroller').evaluate((el) => el.scrollTop)).toBe(0);
    await page.keyboard.press('a');
    await see.poll(() => logOf(page)).toEqual(['wheel prevented=true', 'key a']);
    await page.click('#toggle');
    await see(page.locator('#scroller')).toHaveCount(0);
    // A key press resolves once its events are dispatched: a listener left behind would have logged.
    await page.keyboard.press('b');
    expect(await logOf(page)).toEqual(['wheel prevented=true', 'key a']);
  });
});
