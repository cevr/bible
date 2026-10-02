// Upstream: packages/react/src/use-render/useRender.test.tsx,
// packages/react/src/internals/useRenderElement.test.tsx,
// packages/react/src/direction-provider/DirectionProvider.test.tsx
//
// Dropped: the React-element `render` form (Solid has no element to clone),
// React.lazy unwrapping and the uppercase-render-name warning (both React).
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';

import { expect as see } from '@playwright/test';

import { type Harness, harness, logOf } from './harness.ts';

let h: Harness;
beforeAll(async () => {
  h = await harness('foundations.tsx');
});
afterAll(async () => {
  await h.close();
});

describe('useRender', () => {
  it('renders a div by default, the default tag, or what render returns', async () => {
    const page = await h.open('defaults');
    expect(await page.locator('#plain').evaluate((el) => el.tagName)).toBe('DIV');
    expect(await page.locator('#span').evaluate((el) => el.tagName)).toBe('SPAN');
    expect(await page.locator('#rendered').evaluate((el) => el.tagName)).toBe('B');
    expect(await page.locator('#button').getAttribute('type')).toBe('button');
  });

  it('turns state into data attributes, live, props overriding them', async () => {
    const page = await h.open('state-attributes');
    const el = page.locator('#state');
    expect(await el.getAttribute('data-active')).toBe(null);
    expect(await el.getAttribute('data-count')).toBe(null);
    expect(await el.getAttribute('data-missing')).toBe(null);
    expect(await el.getAttribute('data-camelcase')).toBe('');
    expect(await el.getAttribute('data-extra')).toBe('yes');
    expect(await el.getAttribute('data-orientation')).toBe('vertical');
    await page.click('#bump');
    await see(el).toHaveAttribute('data-active', '');
    expect(await el.getAttribute('data-count')).toBe('1');
    await page.click('#bump');
    await see(el).not.toHaveAttribute('data-active');
    expect(await el.getAttribute('data-count')).toBe('2');
  });

  it('applies a custom state attributes mapping', async () => {
    const page = await h.open('state-attributes');
    expect(await page.locator('#mapped').getAttribute('data-checked-state')).toBe('on');
    expect(await page.locator('#mapped').getAttribute('data-checkedstate')).toBe(null);
  });

  it('passes the element to the params ref and the props ref', async () => {
    const page = await h.open('refs');
    await page.click('#check');
    expect(await logOf(page)).toEqual(['props ref div', 'params ref div', 'same with-ref']);
  });

  it('renders nothing while enabled is false, and again once it is true', async () => {
    const page = await h.open('enabled');
    await see(page.locator('#toggled')).toHaveCount(1);
    await page.click('#toggle');
    await see(page.locator('#toggled')).toHaveCount(0);
    await page.click('#toggle');
    await see(page.locator('#toggled')).toHaveText('here');
  });
});

describe('useRenderElement', () => {
  it('accepts class and style as functions of the state', async () => {
    const page = await h.open('class-style');
    const part = page.locator('#fn-class');
    await see(part).toHaveClass(/\boff\b/);
    await see(part).toHaveClass(/\binternal\b/);
    expect(await part.getAttribute('style')).toContain('margin: 1px');
    expect(await part.getAttribute('style')).toContain('color: blue');
    await part.click();
    await see(part).toHaveClass(/\bon\b/);
    await see(part).toHaveClass(/\binternal\b/);
  });

  it('keeps the internal class and style when the functions return undefined', async () => {
    const page = await h.open('class-style');
    const part = page.locator('#fn-style');
    await see(part).toHaveClass('internal');
    expect(await part.getAttribute('style')).not.toContain('font-weight');
    await part.click();
    expect(await part.getAttribute('style')).toContain('font-weight: 700');
  });

  it('lets the user handler stop the internal one with preventBaseUIHandler', async () => {
    const page = await h.open('class-style');
    await page.click('#prevent');
    expect(await logOf(page)).toEqual(['user click']);
    await page.click('#fn-class');
    expect(await logOf(page)).toEqual(['user click', 'internal click']);
  });

  it('renders without reading reactive props outside a tracking scope', async () => {
    const page = await h.open('class-style');
    const warnings: Array<string> = [];
    page.on('console', (message) => {
      if (message.text().includes('STRICT_READ_UNTRACKED')) {
        warnings.push(message.text());
      }
    });
    await page.reload();
    await page.locator('#root[data-mounted]').waitFor({ state: 'attached' });
    await page.click('#fn-class');
    await see(page.locator('#fn-class')).toHaveClass(/\bon\b/);
    expect(warnings).toEqual([]);
  });

  it('calls render with the merged props and the live state', async () => {
    const page = await h.open('class-style');
    const part = page.locator('#render-part');
    expect(await part.evaluate((el) => el.tagName)).toBe('SECTION');
    await see(part).toHaveAttribute('data-on', 'false');
    await part.click();
    await see(part).toHaveAttribute('data-on', 'true');
    await see(part).toHaveAttribute('data-on', 'true');
  });
});

describe('DirectionProvider', () => {
  it('defaults to ltr outside a provider and provides its direction, live', async () => {
    const page = await h.open('direction');
    await see(page.locator('#outside')).toHaveText('ltr');
    await see(page.locator('#inside')).toHaveText('rtl');
    await page.click('#flip');
    await see(page.locator('#inside')).toHaveText('ltr');
  });
});
